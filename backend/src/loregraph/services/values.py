"""Conversión de valores de formulario (JSON) a tripletas RDF, guiada por el esquema."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import pyoxigraph as ox

from loregraph.forms.schema import Campo
from loregraph.models import ErrorValidacion
from loregraph.namespaces import RDF, XSD
from loregraph.services.kernel import CampaignHandle
from loregraph.store.iris import new_suffix
from loregraph.store.terms import OxTerm, lit, nn

Triple = tuple[OxTerm, OxTerm, OxTerm]
TYPE = nn(str(RDF.type))
_IRI_RE = re.compile(r"^(https?|urn):[^\s<>\"{}|\\^`]+$")


@dataclass
class BuildResult:
    triples: list[Triple] = field(default_factory=list)
    nested: list[str] = field(default_factory=list)
    references: set[str] = field(default_factory=set)
    errors: list[ErrorValidacion] = field(default_factory=list)


class ValueBuilder:
    """Traduce ``{clave: [valores]}`` a tripletas usando los campos del formulario."""

    def __init__(self, camp: CampaignHandle, lang: str = "es") -> None:
        self.camp = camp
        self.ctx = camp.ctx
        self.lang = lang
        self._backlink_key: str | None = None

    def field_index(self, campos: list[Campo]) -> dict[str, Campo]:
        idx: dict[str, Campo] = {}
        for c in campos:
            idx[c.id] = c
            idx[c.ruta] = c
        return idx

    def build(
        self,
        subject: str,
        valores: dict[str, list[Any]],
        campos: list[Campo],
        result: BuildResult | None = None,
        owner_field: str | None = None,
    ) -> BuildResult:
        res = result or BuildResult()
        idx = self.field_index(campos)
        s = nn(subject)
        for key, vals in valores.items():
            campo = idx.get(key)
            label_key = f"{owner_field}.{key}" if owner_field else key
            if campo is None:
                res.errors.append(ErrorValidacion(foco=subject, campo=label_key,
                                                  mensaje=self._t("Campo desconocido para esta clase",
                                                                  "Unknown field for this class")))
                continue
            if vals is None:
                continue
            if not isinstance(vals, list):
                vals = [vals]
            p = nn(campo.ruta)
            for v in vals:
                if v is None or (isinstance(v, str) and not v.strip()):
                    continue
                if campo.tipo == "objeto":
                    self._nested(subject, campo, v, res)
                    continue
                term = self._term(campo, v, subject, res)
                if term is not None:
                    res.triples.append((s, p, term))
        # Campos ocultos con valor fijo (sh:defaultValue + dash:hidden): se rellenan solos.
        given = {idx[k].ruta for k in valores if k in idx}
        for campo in campos:
            if campo.oculto and campo.valorPorDefecto is not None and campo.ruta not in given \
                    and campo.id != (self._backlink_key or ""):
                default = campo.valorPorDefecto
                if isinstance(default, str) and ":" in default and not default.startswith("http"):
                    try:
                        default = self.ctx.expand(default)
                    except KeyError:
                        pass
                term = self._term(campo, default, subject, res)
                if term is not None:
                    res.triples.append((s, nn(campo.ruta), term))
        return res

    # ------------------------------------------------------------- internos
    def _t(self, es: str, en: str) -> str:
        return es if self.lang == "es" else en

    def _err(self, res: BuildResult, subject: str, campo: Campo, msg_es: str, msg_en: str, valor: Any) -> None:
        res.errors.append(ErrorValidacion(foco=subject, campo=campo.id, mensaje=self._t(msg_es, msg_en),
                                          valor=str(valor)))

    def resolve_ref(self, ref: str) -> str | None:
        ref = ref.strip()
        try:
            iri = self.camp.entity_iri(ref)
        except KeyError:
            return None
        return iri if _IRI_RE.match(iri) else None

    def _term(self, campo: Campo, v: Any, subject: str, res: BuildResult) -> OxTerm | None:
        t = campo.tipo
        if t in ("referencia",):
            if not isinstance(v, str):
                self._err(res, subject, campo, "Referencia no válida", "Invalid reference", v)
                return None
            iri = self.resolve_ref(v)
            if iri is None:
                self._err(res, subject, campo, "Referencia no válida", "Invalid reference", v)
                return None
            res.references.add(iri)
            return nn(iri)
        if t == "iri":
            if not isinstance(v, str) or not _IRI_RE.match(v.strip()):
                self._err(res, subject, campo, "Debe ser una IRI absoluta", "Must be an absolute IRI", v)
                return None
            # Puede ser un concepto o entidad conocidos: sus tipos hacen falta para validar.
            res.references.add(v.strip())
            return nn(v.strip())
        if t == "enum":
            allowed = campo.valores or []
            for opt in allowed:
                if v == opt.valor or (isinstance(v, str) and opt.clave is not None and v == opt.clave):
                    if isinstance(opt.valor, str) and opt.clave is not None:
                        res.references.add(opt.valor)
                        return nn(opt.valor)
                    return lit(opt.valor, campo.datatype)
            self._err(res, subject, campo, "Valor no permitido", "Value not allowed", v)
            return None
        if t in ("texto", "textoLargo"):
            return lit(str(v).strip(), None)
        if t == "textoMultilingue":
            if isinstance(v, dict):
                return lit(str(v.get("valor", "")).strip(), lang=v.get("idioma") or self.lang)
            return lit(str(v).strip(), lang=self.lang)
        if t == "entero":
            try:
                if isinstance(v, bool):
                    raise ValueError
                n = int(v) if not isinstance(v, float) or v.is_integer() else None
                if n is None:
                    raise ValueError
            except (TypeError, ValueError):
                self._err(res, subject, campo, "Debe ser un número entero", "Must be an integer", v)
                return None
            return lit(n, campo.datatype or str(XSD.integer))
        if t == "decimal":
            try:
                f = float(str(v).replace(",", "."))
            except (TypeError, ValueError):
                self._err(res, subject, campo, "Debe ser un número", "Must be a number", v)
                return None
            return ox.Literal(_decimal_str(f), datatype=nn(campo.datatype or str(XSD.decimal)))
        if t == "booleano":
            if isinstance(v, bool):
                return lit(v, str(XSD.boolean))
            if str(v).lower() in ("true", "false", "1", "0", "sí", "si", "no"):
                return lit(str(v).lower() in ("true", "1", "sí", "si"), str(XSD.boolean))
            self._err(res, subject, campo, "Debe ser verdadero o falso", "Must be true or false", v)
            return None
        if t == "fecha":
            try:
                d = date.fromisoformat(str(v)[:10])
            except ValueError:
                self._err(res, subject, campo, "Fecha no válida (AAAA-MM-DD)", "Invalid date (YYYY-MM-DD)", v)
                return None
            return lit(d.isoformat(), str(XSD.date))
        if t == "fechaHora":
            try:
                dt = datetime.fromisoformat(str(v))
            except ValueError:
                self._err(res, subject, campo, "Fecha y hora no válidas", "Invalid date-time", v)
                return None
            return lit(dt.isoformat(), str(XSD.dateTime))
        return lit(str(v))

    def _nested(self, owner: str, campo: Campo, v: Any, res: BuildResult) -> None:
        if not isinstance(v, dict):
            self._err(res, owner, campo, "Se esperaba un objeto", "An object was expected", v)
            return
        given = v.get("iri")
        vals = v.get("valores")
        if vals is None:
            vals = {k: x for k, x in v.items() if k != "iri"}
        if given and isinstance(given, str) and given.startswith(owner + "/"):
            node = given
        else:
            node = f"{owner}/n/{new_suffix(4)}"
        sub = campo.subformulario
        if sub is None:
            return
        n = nn(node)
        res.nested.append(node)
        res.triples.append((nn(owner), nn(campo.ruta), n))
        for cls in sub.clases[:1]:
            res.triples.append((n, TYPE, nn(cls.iri)))
        if campo.enlaceInverso:
            back = self.ctx.expand(campo.enlaceInverso)
            res.triples.append((n, nn(back), nn(owner)))
            back_key = campo.enlaceInverso
            vals = {k: x for k, x in vals.items() if k not in (back_key, back)}
        # normaliza listas
        norm = {k: (x if isinstance(x, list) else [x]) for k, x in vals.items()}
        previous = self._backlink_key
        self._backlink_key = campo.enlaceInverso
        try:
            self.build(node, norm, sub.campos, res, owner_field=campo.id)
        finally:
            self._backlink_key = previous


def _decimal_str(f: float) -> str:
    s = repr(f)
    if "e" in s or "E" in s:
        s = f"{f:.10f}".rstrip("0")
    if "." not in s:
        s += ".0"
    return s
