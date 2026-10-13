"""Resolución de tripletas en JSON o Turtle a términos RDF (para propuestas y creencias)."""

from __future__ import annotations

import pyoxigraph as ox

from loregraph.models import ErrorValidacion, TripletaEntrada
from loregraph.namespaces import OWL, RDF
from loregraph.services.kernel import CampaignHandle
from loregraph.store.terms import OxTerm, lit, nn

Triple = tuple[OxTerm, OxTerm, OxTerm]


class TripleResolver:
    """Convierte referencias (id local, clave temporal, clave compacta o IRI) en IRIs."""

    def __init__(self, camp: CampaignHandle, ref_map: dict[str, str] | None = None, lang: str = "es") -> None:
        self.camp = camp
        self.ctx = camp.ctx
        self.ref_map = ref_map or {}
        self.lang = lang

    def _t(self, es: str, en: str) -> str:
        return es if self.lang == "es" else en

    def ref(self, value: str) -> str | None:
        v = value.strip()
        if v in self.ref_map:
            return self.ref_map[v]
        try:
            return self.camp.entity_iri(v)
        except KeyError:
            return None

    def predicate(self, value: str) -> str | None:
        v = value.strip()
        if v == "a":
            return str(RDF.type)
        try:
            iri = self.ctx.expand(v)
        except KeyError:
            return None
        if not iri.startswith(("http://", "https://", "urn:")):
            return None
        # Solo propiedades que existen en la ontología o en las formas activas.
        return iri if iri in self.ctx.known_properties else None

    def is_object_property(self, p: str) -> bool:
        return p == str(RDF.type) or p in self.ctx.object_properties or p == str(OWL.sameAs)

    def resolve(self, t: TripletaEntrada) -> tuple[Triple | None, ErrorValidacion | None]:
        s = self.ref(t.s)
        if s is None:
            return None, ErrorValidacion(mensaje=self._t(f"Sujeto no válido: {t.s}", f"Invalid subject: {t.s}"))
        p = self.predicate(t.p)
        if p is None:
            return None, ErrorValidacion(mensaje=self._t(f"Predicado no válido: {t.p}", f"Invalid predicate: {t.p}"))
        o: OxTerm
        if t.literal or t.datatype or t.idioma or not isinstance(t.o, str) or not self.is_object_property(p):
            if t.datatype:
                try:
                    dt = self.ctx.expand(t.datatype)
                except KeyError:
                    return None, ErrorValidacion(mensaje=self._t("Tipo de dato desconocido", "Unknown datatype"))
                o = lit(t.o, dt)
            else:
                o = lit(t.o, lang=t.idioma) if t.idioma else lit(t.o)
        else:
            if p == str(RDF.type):
                try:
                    obj = self.ctx.expand(t.o)
                except KeyError:
                    obj = None
            else:
                obj = self.ref(t.o)
            if obj is None:
                return None, ErrorValidacion(campo=self.ctx.compact(p),
                                             mensaje=self._t(f"Objeto no válido: {t.o}", f"Invalid object: {t.o}"))
            o = nn(obj)
        return (nn(s), nn(p), o), None

    def resolve_all(self, items: list[TripletaEntrada]) -> tuple[list[Triple], list[ErrorValidacion]]:
        out: list[Triple] = []
        errors: list[ErrorValidacion] = []
        for t in items:
            tr, err = self.resolve(t)
            if err:
                errors.append(err)
            elif tr:
                out.append(tr)
        return out, errors

    def parse_turtle(self, text: str, skolem_base: str) -> tuple[list[Triple], list[ErrorValidacion]]:
        header = "".join(f"@prefix {p}: <{ns}> .\n" for p, ns in self.ctx.prefixes.items())
        try:
            quads = list(ox.parse((header + text).encode(), format=ox.RdfFormat.TURTLE,
                                  base_iri=self.camp.iri + "/"))
        except SyntaxError as exc:
            return [], [ErrorValidacion(mensaje=self._t(f"Turtle no válido: {exc}", f"Invalid Turtle: {exc}"))]
        bnodes: dict[str, ox.NamedNode] = {}

        def sk(term: OxTerm) -> OxTerm:
            if isinstance(term, ox.BlankNode):
                if term.value not in bnodes:
                    bnodes[term.value] = nn(f"{skolem_base}/b/{len(bnodes) + 1}")
                return bnodes[term.value]
            return term

        return [(sk(q.subject), q.predicate, sk(q.object)) for q in quads], []  # type: ignore[misc]


def to_entrada(t: Triple) -> TripletaEntrada:
    """Inversa de :meth:`TripleResolver.resolve` (para editar tripletas en la interfaz)."""
    s, p, o = t
    if isinstance(o, ox.Literal):
        return TripletaEntrada(
            s=s.value, p=p.value, o=o.value, literal=True,  # type: ignore[union-attr]
            datatype=o.datatype.value if o.datatype and not o.language else None, idioma=o.language,
        )
    return TripletaEntrada(s=s.value, p=p.value, o=o.value)  # type: ignore[union-attr]
