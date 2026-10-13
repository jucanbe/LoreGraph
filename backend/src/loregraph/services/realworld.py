"""Enriquecimiento desde el mundo real (Wikidata, con DBpedia como complemento).

Los datos reales se muestran siempre separados de los de la campaña: nunca se
escriben en el canon.
"""

from __future__ import annotations

import hashlib
import re
from typing import TYPE_CHECKING, Any

from loregraph.errors import DomainError
from loregraph.models import HechoReal, MundoReal, MundoRealEntidad
from loregraph.namespaces import RPG
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.services.sparql import remote_select

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

_WD_RE = re.compile(r"^https?://(?:www\.)?wikidata\.org/(?:entity|wiki)/(Q\d+)$")
_DBP_RE = re.compile(r"^https?://(?:([a-z]{2})\.)?dbpedia\.org/(?:resource|page)/(.+)$")
_POINT_RE = re.compile(r"Point\(\s*([-\d.eE]+)\s+([-\d.eE]+)\s*\)")

#: Hechos destacados de Wikidata (propiedad → etiquetas es/en).
FACT_PROPS: dict[str, tuple[str, str]] = {
    "P31": ("instancia de", "instance of"),
    "P279": ("subclase de", "subclass of"),
    "P17": ("país", "country"),
    "P131": ("ubicado en", "located in"),
    "P276": ("ubicación", "location"),
    "P571": ("fundación o creación", "inception"),
    "P576": ("disolución o demolición", "dissolved or demolished"),
    "P569": ("fecha de nacimiento", "date of birth"),
    "P570": ("fecha de fallecimiento", "date of death"),
    "P19": ("lugar de nacimiento", "place of birth"),
    "P20": ("lugar de fallecimiento", "place of death"),
    "P106": ("ocupación", "occupation"),
    "P27": ("nacionalidad", "citizenship"),
    "P1082": ("población", "population"),
    "P2044": ("altitud", "elevation"),
    "P149": ("estilo arquitectónico", "architectural style"),
    "P84": ("arquitecto", "architect"),
    "P138": ("nombrado en honor a", "named after"),
    "P361": ("parte de", "part of"),
    "P1435": ("protección patrimonial", "heritage designation"),
}


class RealWorldService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def for_entity(self, camp: CampaignHandle, ref: str, lang: str = "es") -> MundoRealEntidad:
        iri = self.k.entities.resolve(camp, ref)
        ent = self.k.entities.get(camp, ref, lang)
        anchors = [(v.valor, v.clave or "rpg:realWorldAnchor") for v in ent.anclasReales]
        labeler = Labeler(self.k.store, camp, lang)
        return MundoRealEntidad(
            entidad=labeler.entity_ref(iri),
            anclas=[self.describe(a, rel, lang) for a, rel in anchors],
        )

    def describe(self, iri: str, relacion: str, lang: str = "es") -> MundoReal:
        settings = self.k.settings
        wd = _WD_RE.match(iri)
        dbp = _DBP_RE.match(iri)
        fuente = "wikidata" if wd else "dbpedia"
        base = MundoReal(iri=iri, fuente=fuente, relacion=relacion)  # type: ignore[arg-type]
        if not wd and not dbp:
            base.error = "Solo se admiten recursos de Wikidata o DBpedia" if lang == "es" else \
                "Only Wikidata or DBpedia resources are supported"
            return base
        if not settings.federation_enabled:
            base.error = "La consulta al mundo real está desactivada" if lang == "es" else "Real-world lookup is disabled"
            return base
        key = "mundo:" + hashlib.sha256(f"{iri}|{lang}".encode()).hexdigest()
        cached = self.k.aux.cache_get(key)
        if cached is not None:
            res = MundoReal.model_validate(cached)
            res.relacion = relacion
            return res
        try:
            res = self._wikidata(wd.group(1), relacion, lang) if wd else self._dbpedia(iri, dbp, relacion, lang)  # type: ignore[union-attr]
        except DomainError as exc:
            base.error = exc.message
            return base
        self.k.aux.cache_set(key, res.model_dump(), settings.federation_cache_ttl_s)
        return res

    # ---------------------------------------------------------------- Wikidata
    def _wikidata(self, qid: str, relacion: str, lang: str) -> MundoReal:
        s = self.k.settings
        other = "en" if lang != "en" else "es"
        entity = f"http://www.wikidata.org/entity/{qid}"
        q = f"""
        PREFIX wd: <http://www.wikidata.org/entity/>
        PREFIX wdt: <http://www.wikidata.org/prop/direct/>
        PREFIX schema: <http://schema.org/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?label ?labelAlt ?desc ?descAlt ?image ?coord ?article WHERE {{
          OPTIONAL {{ wd:{qid} rdfs:label ?label FILTER (lang(?label) = "{lang}") }}
          OPTIONAL {{ wd:{qid} rdfs:label ?labelAlt FILTER (lang(?labelAlt) = "{other}") }}
          OPTIONAL {{ wd:{qid} schema:description ?desc FILTER (lang(?desc) = "{lang}") }}
          OPTIONAL {{ wd:{qid} schema:description ?descAlt FILTER (lang(?descAlt) = "{other}") }}
          OPTIONAL {{ wd:{qid} wdt:P18 ?image }}
          OPTIONAL {{ wd:{qid} wdt:P625 ?coord }}
          OPTIONAL {{ ?article schema:about wd:{qid} ;
                      schema:isPartOf <https://{lang}.wikipedia.org/> }}
        }} LIMIT 1"""
        data = remote_select(self.k, s.wikidata_endpoint, q, s.federation_timeout_s)
        b = (data.get("results", {}).get("bindings") or [{}])[0]

        def val(*names: str) -> str | None:
            for n in names:
                if n in b:
                    return str(b[n]["value"])
            return None

        lat = lon = None
        coord = val("coord")
        if coord:
            m = _POINT_RE.search(coord)
            if m:
                lon, lat = float(m.group(1)), float(m.group(2))

        props = " ".join(f"wdt:{p}" for p in FACT_PROPS)
        fq = f"""
        PREFIX wd: <http://www.wikidata.org/entity/>
        PREFIX wdt: <http://www.wikidata.org/prop/direct/>
        PREFIX wikibase: <http://wikiba.se/ontology#>
        PREFIX bd: <http://www.bigdata.com/rdf#>
        SELECT ?p ?v ?vLabel WHERE {{
          VALUES ?p {{ {props} }}
          wd:{qid} ?p ?v .
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "{lang},{other},mul". }}
        }} LIMIT 60"""
        facts: dict[str, list[str]] = {}
        try:
            fdata = remote_select(self.k, s.wikidata_endpoint, fq, s.federation_timeout_s)
            for fb in fdata.get("results", {}).get("bindings", []):
                pid = fb["p"]["value"].rsplit("/", 1)[-1]
                v = fb.get("vLabel", fb.get("v", {})).get("value", "")
                if fb.get("v", {}).get("datatype", "").endswith("dateTime"):
                    sign = "-" if v.startswith("-") else ""
                    v = sign + v.lstrip("+-")[:10]
                if v and v not in facts.setdefault(pid, []):
                    facts[pid].append(v)
        except DomainError:
            pass  # los hechos son opcionales
        hechos = [
            HechoReal(propiedad=f"wdt:{p}", etiqueta=FACT_PROPS[p][0 if lang == "es" else 1], valores=facts[p][:6])
            for p in FACT_PROPS if p in facts
        ]
        resumen = self._dbpedia_abstract_for_wikidata(entity, lang)
        return MundoReal(
            iri=entity, fuente="wikidata", relacion=relacion,
            etiqueta=val("label", "labelAlt"), descripcion=val("desc", "descAlt"),
            resumen=resumen, imagen=val("image"), latitud=lat, longitud=lon, hechos=hechos,
            enlace=val("article") or f"https://www.wikidata.org/wiki/{qid}",
        )

    def _dbpedia_abstract_for_wikidata(self, wd_iri: str, lang: str) -> str | None:
        s = self.k.settings
        q = f"""
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX dbo: <http://dbpedia.org/ontology/>
        SELECT ?abs WHERE {{
          ?r owl:sameAs <{wd_iri}> ; dbo:abstract ?abs .
          FILTER (lang(?abs) = "{lang}")
        }} LIMIT 1"""
        try:
            data = remote_select(self.k, s.dbpedia_endpoint, q, min(s.federation_timeout_s, 8))
        except DomainError:
            return None
        b = data.get("results", {}).get("bindings", [])
        return str(b[0]["abs"]["value"]) if b else None

    # ----------------------------------------------------------------- DBpedia
    def _dbpedia(self, iri: str, m: Any, relacion: str, lang: str) -> MundoReal:
        s = self.k.settings
        resource = f"http://dbpedia.org/resource/{m.group(2)}"
        q = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX dbo: <http://dbpedia.org/ontology/>
        PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?label ?abs ?thumb ?lat ?long ?page WHERE {{
          OPTIONAL {{ <{resource}> rdfs:label ?label FILTER (lang(?label) = "{lang}") }}
          OPTIONAL {{ <{resource}> dbo:abstract ?abs FILTER (lang(?abs) = "{lang}") }}
          OPTIONAL {{ <{resource}> dbo:thumbnail ?thumb }}
          OPTIONAL {{ <{resource}> geo:lat ?lat ; geo:long ?long }}
          OPTIONAL {{ <{resource}> foaf:isPrimaryTopicOf ?page }}
        }} LIMIT 1"""
        data = remote_select(self.k, s.dbpedia_endpoint, q, s.federation_timeout_s)
        b = (data.get("results", {}).get("bindings") or [{}])[0]

        def val(n: str) -> str | None:
            return str(b[n]["value"]) if n in b else None

        def num(n: str) -> float | None:
            v = val(n)
            try:
                return float(v) if v is not None else None
            except ValueError:
                return None

        return MundoReal(
            iri=iri, fuente="dbpedia", relacion=relacion, etiqueta=val("label"), resumen=val("abs"),
            imagen=val("thumb"), latitud=num("lat"), longitud=num("long"), enlace=val("page") or iri,
        )


__all__ = ["RealWorldService", "RPG"]
