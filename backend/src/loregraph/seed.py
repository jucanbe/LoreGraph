"""Carga de campañas de ejemplo incluidas en los módulos (``modules/<id>/examples/<campaña>/``).

Cada ejemplo contiene:

* ``campaign.yaml``: ``id``, ``nombre``, ``descripcion``, ``modulos``.
* ``canon.ttl``: el mundo canónico. ``__CAMPAIGN__`` se sustituye por la IRI de la campaña
  (p. ej. ``@prefix : <__CAMPAIGN__/entity/> .``).
* ``knowledge/<id-personaje>.ttl`` (opcional): creencias de cada personaje.
* ``proposals/*.json`` (opcional): propuestas de agentes de ejemplo (formato ``PropuestaEntrada``).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pyoxigraph as ox
import yaml

from loregraph.models import Actor, CampanaEntrada, ErrorValidacion, PropuestaEntrada
from loregraph.namespaces import RDF, RPG
from loregraph.services.kernel import CampaignHandle, Kernel
from loregraph.services.validation import ShaclValidator

log = logging.getLogger(__name__)
SEED_ACTOR = Actor(tipo="humano", nombre="semilla", peticion="Carga de la campaña de ejemplo")


def _parse(text: str, camp_iri: str) -> list[tuple]:
    data = text.replace("__CAMPAIGN__", camp_iri).encode()
    return [(q.subject, q.predicate, q.object) for q in ox.parse(data, format=ox.RdfFormat.TURTLE)]


def example_dirs(k: Kernel) -> list[Path]:
    out = []
    for mod in k.registry.modules.values():
        base = mod.path / "examples"
        if base.is_dir():
            out.extend(sorted(d for d in base.iterdir() if (d / "campaign.yaml").is_file()))
    return out


def validate_campaign(k: Kernel, camp: CampaignHandle, lang: str = "es") -> list[ErrorValidacion]:
    """Valida todo el canon de una campaña contra las formas SHACL activas."""
    triples = k.store.graph_triples(camp.canon)
    entity_classes = camp.ctx.subclasses(str(RPG.Entity)) | camp.ctx.subclasses(str(RPG.Fact))
    focus = sorted({
        s.value for s, p, o in triples
        if p.value == str(RDF.type) and isinstance(o, ox.NamedNode) and o.value in entity_classes
    })
    vocab = [t for g in camp.module_graphs for t in k.store.graph_triples(g) if t[1].value == str(RDF.type)]
    return ShaclValidator(camp.ctx, k.iris).validate([*triples, *vocab], focus=focus, lang=lang)


def seed_example(k: Kernel, folder: Path, replace: bool = True) -> tuple[str, int]:
    meta = yaml.safe_load((folder / "campaign.yaml").read_text(encoding="utf-8"))
    entrada = CampanaEntrada.model_validate(meta)
    cid = entrada.id or folder.name
    entrada.id = cid
    if k.campaigns.handle(cid) is not None:
        if not replace:
            return cid, 0
        k.campaigns.delete(cid)
    camp = k.campaigns.create(entrada)
    canon = _parse((folder / "canon.ttl").read_text(encoding="utf-8"), camp.iri)
    subjects = {s.value for s, _, _ in canon if isinstance(s, ox.NamedNode) and "/n/" not in s.value}
    # Sin historia temporal: el estado de ejemplo es el de partida, no un cambio de la sesión actual.
    k.provenance.commit(camp, SEED_ACTOR, adds={camp.canon: canon}, about=subjects, track_time=False)
    n = len(canon)

    kdir = folder / "knowledge"
    if kdir.is_dir():
        for f in sorted(kdir.glob("*.ttl")):
            graph = camp.knowledge(f.stem)
            beliefs = _parse(f.read_text(encoding="utf-8"), camp.iri)
            k.provenance.commit(camp, SEED_ACTOR, adds={graph: beliefs}, about={k.iris.entity(cid, f.stem)})
            n += len(beliefs)

    pdir = folder / "proposals"
    if pdir.is_dir():
        for f in sorted(pdir.glob("*.json")):
            prop = PropuestaEntrada.model_validate(json.loads(f.read_text(encoding="utf-8")))
            res = k.proposals.create(camp, prop, "agente")
            if not res.ok:
                log.warning("Propuesta de ejemplo %s no válida: %s", f.name, [e.mensaje for e in res.errores])

    errors = validate_campaign(k, camp)
    for e in errors:
        log.warning("[%s] %s %s: %s (%s)", cid, e.focoId or e.foco, e.campo, e.mensaje, e.valor)
    if errors:
        print(f"Aviso: la campaña '{cid}' tiene {len(errors)} incidencias SHACL (ver registro).")
    k.search.reindex_campaign(camp)
    return cid, n


def seed_examples(k: Kernel, only: str | None = None, replace: bool = True) -> list[tuple[str, int]]:
    k.search.reindex_modules()
    done = []
    for folder in example_dirs(k):
        meta = yaml.safe_load((folder / "campaign.yaml").read_text(encoding="utf-8"))
        cid = meta.get("id") or folder.name
        if only and cid != only:
            continue
        done.append(seed_example(k, folder, replace))
    return done
