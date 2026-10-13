"""Entidades: listado, ficha, alta, edición y borrado (con validación SHACL y procedencia)."""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING, Literal

import pyoxigraph as ox

from loregraph.errors import BadRequest, Conflict, Forbidden, NotFound, ValidationFailed
from loregraph.forms.builder import FormBuilder
from loregraph.forms.schema import Campo, Formulario
from loregraph.models import (
    Actor,
    CampoValores,
    Entidad,
    EntidadEntrada,
    ErrorValidacion,
    GrupoValores,
    ListaEntidades,
    Pagina,
    Relacion,
    ResultadoEscritura,
    Valor,
)
from loregraph.namespaces import FOAF, RDF, RDFS, RPG, SCHEMA, SKOS
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.services.validation import ShaclValidator
from loregraph.services.values import BuildResult, ValueBuilder
from loregraph.store.iris import new_suffix, slugify
from loregraph.store.terms import OxTerm, literal_python_value, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

Triple = tuple[OxTerm, OxTerm, OxTerm]
TYPE = nn(str(RDF.type))
HIDDEN_RELATION_PROPS = {str(RDF.type), str(RPG.relatedTo), str(RPG.hasRelationship), str(RPG.inCampaign),
                         str(RPG.hasHistory), str(RPG.hasDepiction), str(RPG.mapImage), str(RPG.hasMarker)}
#: Propiedades internas que no se muestran como valores de la ficha (tienen su propia vista).
HIDDEN_VALUE_PROPS = {str(RDF.type), str(RPG.hasHistory), str(RPG.hasDepiction), str(RPG.mapImage)}


class EntityService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # ================================================================ lectura
    def form(self, camp: CampaignHandle, classes: list[str], lang: str = "es") -> Formulario:
        iris = []
        for c in classes:
            try:
                iri = camp.ctx.expand(c)
            except KeyError as exc:
                raise BadRequest(str(exc)) from exc
            if iri not in camp.ctx.known_classes:
                raise NotFound(f"Clase desconocida en esta campaña: {c}")
            iris.append(iri)
        return FormBuilder(camp.ctx, lang).build(iris)

    def list(
        self,
        camp: CampaignHandle,
        clase: str | None = None,
        q: str | None = None,
        orden: Literal["nombre", "reciente", "relevancia"] = "nombre",
        limite: int = 50,
        desplazamiento: int = 0,
        lang: str = "es",
        filtros: dict[str, str] | None = None,
    ) -> ListaEntidades:
        ctx = camp.ctx
        root = ctx.expand(clase) if clase else str(RPG.Entity)
        classes = ctx.subclasses(root)
        values = " ".join(f"<{c}>" for c in classes)
        filter_clauses = ""
        for i, (prop, ref) in enumerate((filtros or {}).items()):
            try:
                p_iri = ctx.expand(prop)
            except KeyError as exc:
                raise BadRequest(str(exc)) from exc
            filter_clauses += f" ?e <{p_iri}> <{camp.entity_iri(ref)}> ."
            _ = i
        rows = self.k.store.select(
            f"""SELECT DISTINCT ?e WHERE {{
                VALUES ?t {{ {values} }}
                ?e a ?t . {filter_clauses}
                FILTER EXISTS {{ ?e <{RDFS.label}>|<{SKOS.prefLabel}> ?l }}
            }}""",
            default_graph=[camp.canon, *[self.k.iris.module_graph(m, "vocabulary") for m in camp.modules]],
        )
        iris = [r["e"].value for r in rows if isinstance(r["e"], ox.NamedNode)]
        ranking: dict[str, int] = {}
        if q:
            matches = self.k.search.matching_iris(q, camp)
            ranking = {iri: i for i, iri in enumerate(matches)}
            iris = [i for i in iris if i in ranking]
        labeler = Labeler(self.k.store, camp, lang)
        labeler.preload(iris)
        meta = self.k.aux.meta(iris)
        if orden == "reciente":
            iris.sort(key=lambda i: -(meta.get(i, (0, 0))[1] or 0))
        elif orden == "relevancia" and q:
            iris.sort(key=lambda i: ranking.get(i, 1 << 30))
        else:
            iris.sort(key=lambda i: labeler.label(i).lower())
        total = len(iris)
        page = iris[desplazamiento:desplazamiento + limite]
        items = []
        for i in page:
            ref = labeler.entity_ref(i, with_description=True)
            ref.modificada = meta.get(i, (None, None))[1]
            items.append(ref)
        return ListaEntidades(elementos=items, pagina=Pagina(total=total, limite=limite, desplazamiento=desplazamiento))

    def _types(self, camp: CampaignHandle, iri: str, graphs: list[str]) -> list[str]:
        rows = self.k.store.select(f"SELECT ?t WHERE {{ <{iri}> a ?t }}", default_graph=graphs)
        return [r["t"].value for r in rows if isinstance(r["t"], ox.NamedNode)]

    def exists(self, camp: CampaignHandle, iri: str) -> bool:
        return bool(self._types(camp, iri, [camp.canon]))

    def resolve(self, camp: CampaignHandle, ref: str) -> str:
        try:
            return camp.entity_iri(ref)
        except KeyError as exc:
            raise BadRequest(str(exc)) from exc

    def _ordered_classes(self, camp: CampaignHandle, types: list[str]) -> list[str]:
        ctx = camp.ctx
        known = [t for t in types if t in ctx.known_classes]
        primary = ctx.primary_type(known)
        rest = [t for t in known if t != primary]
        # descarta superclases redundantes de otros tipos
        rest = [t for t in rest if not any(t != o and t in ctx.superclasses(o) for o in known)]
        return [primary, *rest] if primary else rest

    def get(self, camp: CampaignHandle, ref: str, lang: str = "es") -> Entidad:
        iri = self.resolve(camp, ref)
        # La ficha muestra lo afirmado (canon y vocabularios), no los atajos derivados.
        graphs = [camp.canon, *camp.module_graphs]
        types = self._types(camp, iri, graphs)
        if not types:
            raise NotFound(f"No existe la entidad '{ref}'")
        ctx = camp.ctx
        is_campaign = self.k.iris.entity_id(iri) is not None
        origin = "campana" if is_campaign else f"modulo:{ctx.module_of(iri) or '?'}"
        classes = self._ordered_classes(camp, types)
        form = FormBuilder(ctx, lang).build(classes) if classes else None
        fields = {c.ruta: c for c in form.campos} if form else {}

        out_rows = list(self._subject_triples(iri, graphs))
        labeler = Labeler(self.k.store, camp, lang)
        labeler.preload([iri, *(o.value for _, _, o in out_rows if isinstance(o, ox.NamedNode))])

        by_pred: dict[str, list[OxTerm]] = defaultdict(list)
        for _, p, o in out_rows:
            if o not in by_pred[p.value]:
                by_pred[p.value].append(o)
        # Literales multilingües: se muestran solo los del idioma pedido (si los hay).
        for p, objs in by_pred.items():
            tagged = [o for o in objs if isinstance(o, ox.Literal) and o.language]
            if len(tagged) > 1:
                langs = {o.language for o in tagged}
                pick = lang if lang in langs else ("en" if "en" in langs else sorted(langs)[0])
                by_pred[p] = [o for o in objs if not (isinstance(o, ox.Literal) and o.language
                                                      and o.language != pick)]

        valores: dict[str, list[Valor]] = {}
        campos_val: dict[str, CampoValores] = {}
        for p, objs in by_pred.items():
            if p in HIDDEN_VALUE_PROPS:
                continue
            campo = fields.get(p)
            vals = [self._valor(camp, labeler, o, campo, graphs, lang) for o in objs]
            key = ctx.compact(p)
            valores[key] = vals
            campos_val[p] = CampoValores(
                id=key, ruta=p, etiqueta=campo.etiqueta if campo else ctx.label(p, lang),
                tipo=campo.tipo if campo else None, widget=campo.widget if campo else None, valores=vals,
            )

        grupos: list[GrupoValores] = []
        used: set[str] = set()
        if form:
            for g in [*form.grupos, None]:
                gid = g.id if g else None
                cs = [campos_val[c.ruta] for c in form.campos if c.grupo == gid and c.ruta in campos_val and not c.oculto]
                used.update(c.ruta for c in cs)
                if cs:
                    grupos.append(GrupoValores(id=gid, etiqueta=g.etiqueta if g else self._t(lang, "General", "General"),
                                               campos=cs))
        extra = [cv for p, cv in campos_val.items() if p not in used and p not in fields]
        if extra:
            grupos.append(GrupoValores(id="otros", etiqueta=self._t(lang, "Otros datos", "Other data"), campos=extra))

        # Valores deducidos por las reglas del módulo (grafo derivado), sin los atajos de relaciones.
        derived: dict[str, list[OxTerm]] = defaultdict(list)
        for _, p, o in self._subject_triples(iri, [camp.derived]):
            if p.value not in (str(RPG.relatedTo), str(RPG.knows)) and o not in by_pred.get(p.value, []):
                derived[p.value].append(o)
        if derived:
            labeler.preload(o.value for os_ in derived.values() for o in os_ if isinstance(o, ox.NamedNode))
            grupos.append(GrupoValores(
                id="derivados", etiqueta=self._t(lang, "Deducido por reglas", "Derived by rules"),
                campos=[
                    CampoValores(id=ctx.compact(p), ruta=p, etiqueta=ctx.label(p, lang),
                                 valores=[self._valor(camp, labeler, o, None, graphs, lang) for o in os_])
                    for p, os_ in derived.items()
                ],
            ))

        anchors_props = {str(RPG.realWorldAnchor), str(RPG.inspiredBy), str(RPG.correspondsTo)}
        anchors_props |= {
            str(s) for s in ctx.ont.subjects(RDFS.subPropertyOf, RPG.realWorldAnchor)  # type: ignore[arg-type]
        }
        anclas = [
            Valor(tipo="iri", valor=o.value, etiqueta=o.value, clave=ctx.compact(p))
            for p, objs in by_pred.items() if p in anchors_props
            for o in objs if isinstance(o, ox.NamedNode)
        ]
        meta = self.k.aux.meta([iri]).get(iri, (None, None))
        desc = by_pred.get(str(SCHEMA.description))
        return Entidad(
            id=camp.entity_id(iri) or iri,
            iri=iri,
            campana=camp.id,
            etiqueta=labeler.label(iri),
            descripcion=desc[0].value if desc and isinstance(desc[0], ox.Literal) else None,
            tipo=labeler.class_ref(classes[0]) if classes else None,
            clases=[labeler.class_ref(c) for c in classes],
            editable=is_campaign,
            origen=origin,
            grupos=grupos,
            valores=valores,
            relaciones=self.relations(camp, iri, labeler, graphs),
            imagenes=self.images(camp, iri, by_pred),
            anclasReales=anclas,
            creada=meta[0],
            modificada=meta[1],
        )

    def images(self, camp: CampaignHandle, iri: str, by_pred: dict[str, list[OxTerm]]) -> list[str]:
        """URLs de las imágenes: retratos subidos (rutas `/media/…`) y enlaces externos (foaf:depiction)."""
        out: list[str] = []
        for node in by_pred.get(str(RPG.hasDepiction), []):
            if isinstance(node, ox.NamedNode):
                for _, _, url in self.k.store.triples(node, nn(str(SCHEMA.contentUrl)), None, camp.canon):
                    out.append(url.value)  # type: ignore[union-attr]
        out += [o.value for o in by_pred.get(str(FOAF.depiction), []) if isinstance(o, ox.NamedNode)]
        return out

    def _t(self, lang: str, es: str, en: str) -> str:
        return es if lang == "es" else en

    def _subject_triples(self, iri: str, graphs: list[str]) -> list[Triple]:
        rows = self.k.store.select(f"SELECT ?p ?o WHERE {{ <{iri}> ?p ?o }}", default_graph=graphs)
        s = nn(iri)
        return [(s, r["p"], r["o"]) for r in rows]

    def _valor(
        self, camp: CampaignHandle, labeler: Labeler, o: OxTerm, campo: Campo | None, graphs: list[str], lang: str,
        depth: int = 0,
    ) -> Valor:
        ctx = camp.ctx
        if isinstance(o, ox.Literal):
            return Valor(tipo="literal", valor=literal_python_value(o), etiqueta=o.value,
                         datatype=o.datatype.value if o.datatype else None, idioma=o.language)
        if isinstance(o, ox.NamedNode):
            iri = o.value
            if campo is not None and campo.tipo == "objeto" and campo.subformulario is not None and depth < 3:
                sub_fields = {c.ruta: c for c in campo.subformulario.campos}
                trip = self._subject_triples(iri, graphs)
                labeler.preload(x.value for _, _, x in trip if isinstance(x, ox.NamedNode))
                grouped: dict[str, list[OxTerm]] = defaultdict(list)
                for _, p, x in trip:
                    if p.value != str(RDF.type):
                        grouped[p.value].append(x)
                campos = []
                for c in campo.subformulario.campos:
                    if c.ruta in grouped and not c.oculto:
                        campos.append(CampoValores(
                            id=c.id, ruta=c.ruta, etiqueta=c.etiqueta, tipo=c.tipo, widget=c.widget,
                            valores=[self._valor(camp, labeler, x, c, graphs, lang, depth + 1) for x in grouped[c.ruta]],
                        ))
                for p, xs in grouped.items():
                    if p not in sub_fields:
                        campos.append(CampoValores(
                            id=ctx.compact(p), ruta=p, etiqueta=ctx.label(p, lang),
                            valores=[self._valor(camp, labeler, x, None, graphs, lang, depth + 1) for x in xs],
                        ))
                summary = self._nested_summary(campos)
                return Valor(tipo="objeto", valor=iri, etiqueta=summary, campos=campos)
            types = labeler.types(iri)
            primary = ctx.primary_type(types) if types else None
            compact = ctx.compact(iri)
            return Valor(
                tipo="iri", valor=iri, etiqueta=labeler.label(iri),
                # Solo las entidades navegables llevan id; los conceptos SKOS se muestran como texto.
                id=camp.entity_id(iri) if labeler.is_entity(iri) else None,
                clave=compact if compact != iri else None,
                clase=labeler.class_ref(primary) if primary else None,
            )
        return Valor(tipo="literal", valor=str(o), etiqueta=str(o))

    @staticmethod
    def _nested_summary(campos: list[CampoValores]) -> str:
        parts = []
        for c in campos[:3]:
            parts.append(", ".join(v.etiqueta for v in c.valores))
        return " · ".join(p for p in parts if p)

    def relations(self, camp: CampaignHandle, iri: str, labeler: Labeler, graphs: list[str]) -> list[Relacion]:
        ctx = camp.ctx
        rels: list[Relacion] = []
        out_rows = self.k.store.select(
            f"SELECT ?p ?o WHERE {{ <{iri}> ?p ?o . FILTER isIRI(?o) }}", default_graph=graphs
        )
        in_rows = self.k.store.select(
            f"SELECT ?s ?p WHERE {{ ?s ?p <{iri}> }}", default_graph=[camp.canon, *camp.module_graphs]
        )
        q_rows = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> PREFIX rdfs: <{RDFS}>
            SELECT ?r ?src ?tgt ?type ?str ?from ?until WHERE {{
                ?r a/rdfs:subClassOf* rpg:Relationship ; rpg:source ?src ; rpg:target ?tgt .
                FILTER (?src = <{iri}> || ?tgt = <{iri}>)
                OPTIONAL {{ ?r rpg:relationshipType ?type }}
                OPTIONAL {{ ?r rpg:strength ?str }}
                OPTIONAL {{ ?r rpg:validFrom ?from }}
                OPTIONAL {{ ?r rpg:validUntil ?until }}
            }}""",
            default_graph=[camp.canon, *camp.module_graphs],
        )
        candidates = {r["o"].value for r in out_rows} | {r["s"].value for r in in_rows if isinstance(r["s"], ox.NamedNode)}
        for r in q_rows:
            for k in ("src", "tgt", "type", "from", "until"):
                if k in r:
                    candidates.add(r[k].value)
        labeler.preload(candidates)

        seen_out: set[tuple[str, str]] = set()
        for r in out_rows:
            p, o = r["p"].value, r["o"].value
            if p in HIDDEN_RELATION_PROPS or not labeler.is_entity(o) or (p, o) in seen_out:
                continue
            seen_out.add((p, o))
            rels.append(Relacion(propiedad=labeler.term(r["p"]), otra=labeler.entity_ref(o), direccion="saliente"))
        for r in in_rows:
            s = r["s"]
            if not isinstance(s, ox.NamedNode):
                continue
            p = r["p"].value
            if p in HIDDEN_RELATION_PROPS or not labeler.is_entity(s.value):
                continue
            if (p, s.value) in seen_out:
                continue  # simétricas: ya aparece como saliente
            rels.append(Relacion(propiedad=labeler.term(r["p"]), otra=labeler.entity_ref(s.value), direccion="entrante"))
        seen_q: set[str] = set()
        for r in q_rows:
            node = r["r"].value
            if node in seen_q:
                continue
            seen_q.add(node)
            outgoing = r["src"].value == iri
            other = r["tgt"].value if outgoing else r["src"].value
            rels.append(Relacion(
                propiedad=labeler.term(nn(str(RPG.relatedTo))),
                otra=labeler.entity_ref(other),
                direccion="saliente" if outgoing else "entrante",
                cualificada=True,
                tipoRelacion=labeler.term(r["type"]) if "type" in r else None,
                intensidad=int(r["str"].value) if "str" in r else None,
                desde=labeler.entity_ref(r["from"].value) if "from" in r else None,
                hasta=labeler.entity_ref(r["until"].value) if "until" in r else None,
                nodo=node,
            ))
        _ = ctx
        return rels

    # ============================================================= escritura
    def _validate_classes(self, camp: CampaignHandle, keys: list[str]) -> list[str]:
        out = []
        for c in keys:
            try:
                iri = camp.ctx.expand(c)
            except KeyError as exc:
                raise BadRequest(str(exc)) from exc
            if iri not in camp.ctx.known_classes:
                raise BadRequest(f"Clase desconocida en esta campaña: {c}")
            if not camp.ctx.is_subclass(iri, str(RPG.Entity)):
                raise BadRequest(f"La clase {c} no es una entidad de campaña")
            out.append(iri)
        return out

    def _nested_cbd(self, iri: str, graph: str, depth: int = 0) -> list[Triple]:
        """Tripletas de los nodos anidados (``<entidad>/n/…``) de una entidad, recursivamente."""
        out: list[Triple] = []
        for _, _, o in self.k.store.triples(nn(iri), None, None, graph):
            if isinstance(o, ox.NamedNode) and o.value.startswith(iri + "/n/") and depth < 5:
                out.extend(self.k.store.triples(o, None, None, graph))
                out.extend(self._nested_cbd(o.value, graph, depth + 1))
        return out

    def _reference_context(self, camp: CampaignHandle, refs: set[str], graph_extra: list[str] | None = None) -> list[Triple]:
        if not refs:
            return []
        values = " ".join(f"<{r}>" for r in refs)
        rows = self.k.store.select(
            f"SELECT ?s ?t WHERE {{ VALUES ?s {{ {values} }} ?s a ?t }}",
            default_graph=[*camp.read_graphs, *(graph_extra or [])],
        )
        return [(r["s"], TYPE, r["t"]) for r in rows]

    def build_entity_triples(
        self, camp: CampaignHandle, iri: str, entrada: EntidadEntrada, lang: str
    ) -> tuple[list[str], Formulario, BuildResult]:
        classes = self._validate_classes(camp, entrada.clases)
        form = FormBuilder(camp.ctx, lang).build(classes)
        builder = ValueBuilder(camp, lang)
        res = builder.build(iri, entrada.valores, form.campos)
        s = nn(iri)
        res.triples[0:0] = [(s, TYPE, nn(c)) for c in classes]
        return classes, form, res

    def validate_state(
        self, camp: CampaignHandle, state: list[Triple], focus: list[str], refs: set[str], lang: str,
        extra_graphs: list[str] | None = None,
    ) -> list[ErrorValidacion]:
        context = self._reference_context(camp, refs, extra_graphs)
        return ShaclValidator(camp.ctx, self.k.iris).validate([*state, *context], focus=focus, lang=lang)

    def create(self, camp: CampaignHandle, entrada: EntidadEntrada, actor: Actor, lang: str = "es") -> ResultadoEscritura:
        label = _first_str(entrada.valores.get("rdfs:label")) or "entidad"
        eid = entrada.id or f"{slugify(label)}-{new_suffix(2)}"
        iri = self.k.iris.entity(camp.id, eid)
        if self.exists(camp, iri):
            raise Conflict(f"Ya existe la entidad '{eid}'")
        _, _, res = self.build_entity_triples(camp, iri, entrada, lang)
        if res.errors:
            raise ValidationFailed(res.errors)
        errors = self.validate_state(camp, res.triples, [iri, *res.nested], res.references, lang)
        if any(e.severidad == "violacion" for e in errors):
            raise ValidationFailed(errors)
        ch = self.k.provenance.commit(camp, actor, adds={camp.canon: res.triples}, about=[iri])
        return ResultadoEscritura(id=eid, iri=iri, cambio=ch or "")

    def update(
        self, camp: CampaignHandle, ref: str, entrada: EntidadEntrada, actor: Actor, lang: str = "es"
    ) -> ResultadoEscritura:
        iri = self.resolve(camp, ref)
        if self.k.iris.entity_id(iri) is None:
            raise Forbidden("Las entidades del vocabulario de un módulo no se pueden editar")
        if not self.exists(camp, iri):
            raise NotFound(f"No existe la entidad '{ref}'")
        _, form, res = self.build_entity_triples(camp, iri, entrada, lang)
        if res.errors:
            raise ValidationFailed(res.errors)
        covered = {c.ruta for c in form.campos} | {str(RDF.type)}
        current = list(self.k.store.triples(nn(iri), None, None, camp.canon))
        removes = [t for t in current if t[1].value in covered]
        # Solo los nodos anidados de campos del formulario (no retratos, historial temporal…).
        for _, _, o in list(removes):
            if isinstance(o, ox.NamedNode) and o.value.startswith(iri + "/n/"):
                removes.extend(self.k.store.triples(o, None, None, camp.canon))
                removes.extend(self._nested_cbd(o.value, camp.canon))
        keep = [t for t in current if t[1].value not in covered]
        state = [*keep, *res.triples]
        errors = self.validate_state(camp, state, [iri, *res.nested], res.references, lang)
        if any(e.severidad == "violacion" for e in errors):
            raise ValidationFailed(errors)
        ch = self.k.provenance.commit(
            camp, actor, removes={camp.canon: removes}, adds={camp.canon: res.triples}, about=[iri]
        )
        return ResultadoEscritura(id=camp.entity_id(iri) or iri, iri=iri, cambio=ch or "")

    def delete_triples(self, camp: CampaignHandle, iri: str) -> tuple[list[Triple], set[str]]:
        """Tripletas a borrar al eliminar una entidad, y entidades afectadas."""
        g = camp.canon
        removes: list[Triple] = list(self.k.store.triples(nn(iri), None, None, g))
        removes.extend(self._nested_cbd(iri, g))
        affected: set[str] = {iri}
        fact_classes = camp.ctx.subclasses(str(RPG.Fact))
        for s, p, o in list(self.k.store.triples(None, None, nn(iri), g)):
            removes.append((s, p, o))
            if not isinstance(s, ox.NamedNode):
                continue
            s_types = {t.value for _, _, t in self.k.store.triples(s, TYPE, None, g)}
            if s_types & fact_classes:
                # hecho cualificado que apunta a la entidad: se elimina entero
                removes.extend(self.k.store.triples(s, None, None, g))
                for s2, p2, o2 in self.k.store.triples(None, None, s, g):
                    removes.append((s2, p2, o2))
                    affected.add(s2.value)  # type: ignore[union-attr]
            else:
                affected.add(s.value)
        return removes, affected

    def delete(self, camp: CampaignHandle, ref: str, actor: Actor) -> str:
        iri = self.resolve(camp, ref)
        if self.k.iris.entity_id(iri) is None:
            raise Forbidden("Las entidades del vocabulario de un módulo no se pueden borrar")
        if not self.exists(camp, iri):
            raise NotFound(f"No existe la entidad '{ref}'")
        removes, affected = self.delete_triples(camp, iri)
        # Borrar no es un cambio «en el mundo» con fecha: no se genera historia temporal.
        ch = self.k.provenance.commit(camp, actor, removes={camp.canon: removes}, about=affected, track_time=False)
        self.k.aux.unindex_entity(iri, camp.id)
        return ch or ""


def _first_str(vals: object) -> str | None:
    if isinstance(vals, list) and vals and isinstance(vals[0], str):
        return vals[0]
    if isinstance(vals, str):
        return vals
    return None
