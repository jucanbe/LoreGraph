"""Imágenes de la campaña: retratos de entidades y mapas propios.

Los archivos se guardan en ``data/media/<campaña>/`` y se sirven en
``/media/<campaña>/<archivo>``. En el grafo, cada imagen es un nodo
``rpg:Image`` anidado en su entidad (``<entidad>/n/img-…``) con
``schema:contentUrl``, su origen (subida, generada, enlace) y la procedencia
del cambio que la añadió.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import TYPE_CHECKING

import pyoxigraph as ox

from loregraph.apimodel import ApiModel
from loregraph.errors import BadRequest, NotFound
from loregraph.models import Actor, EntidadRef
from loregraph.namespaces import RDF, RPG, SCHEMA
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.store.terms import OxTerm, lit, literal_python_value, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

Triple = tuple[OxTerm, OxTerm, OxTerm]
TYPE = nn(str(RDF.type))
ALLOWED = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
MAX_BYTES = 15 * 1024 * 1024
MAGIC = {b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg", b"GIF8": "image/gif", b"RIFF": "image/webp"}


class Imagen(ApiModel):
    nodo: str
    url: str
    origen: str | None = None


class Marcador(ApiModel):
    nodo: str | None = None
    entidad: EntidadRef
    x: float
    y: float


class MarcadorEntrada(ApiModel):
    entidad: str
    x: float
    y: float


class Mapa(ApiModel):
    entidad: EntidadRef
    imagen: Imagen | None = None
    marcadores: list[Marcador]


class MediaService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    @property
    def root(self) -> Path:
        return self.k.settings.data_path / "media"

    # ----------------------------------------------------------------- archivos
    def _sniff(self, data: bytes) -> str | None:
        for magic, mime in MAGIC.items():
            if data.startswith(magic):
                if mime == "image/webp" and data[8:12] != b"WEBP":
                    continue
                return mime
        return None

    def save_file(self, camp: CampaignHandle, data: bytes) -> str:
        """Guarda los bytes de una imagen y devuelve su URL relativa (``/media/…``)."""
        if len(data) > MAX_BYTES:
            raise BadRequest(f"La imagen supera {MAX_BYTES // (1024 * 1024)} MB")
        mime = self._sniff(data)
        if mime is None:
            raise BadRequest("Formato no admitido: usa PNG, JPEG, WebP o GIF")
        folder = self.root / camp.id
        folder.mkdir(parents=True, exist_ok=True)
        name = f"{secrets.token_hex(8)}{ALLOWED[mime]}"
        (folder / name).write_bytes(data)
        return f"/media/{camp.id}/{name}"

    def file_path(self, cid: str, name: str) -> Path:
        base = (self.root / cid).resolve()
        target = (base / name).resolve()
        if not target.is_relative_to(base) or not target.is_file():
            raise NotFound("Imagen no encontrada")
        return target

    def _image_triples(self, owner: str, url: str, origen: str, prompt: str | None = None) -> tuple[ox.NamedNode,
                                                                                                    list[Triple]]:
        node = nn(f"{owner}/n/img-{secrets.token_hex(4)}")
        ts: list[Triple] = [
            (node, TYPE, nn(str(RPG.Image))),
            (node, nn(str(SCHEMA.contentUrl)), lit(url)),
            (node, nn(str(RPG.imageOrigin)), lit(origen)),
        ]
        if prompt:
            ts.append((node, nn(str(RPG.generationPrompt)), lit(prompt)))
        return node, ts

    # ---------------------------------------------------------------- retratos
    def add_portrait(self, camp: CampaignHandle, ref: str, data: bytes, actor: Actor, replace: bool = True,
                     origen: str = "subida", prompt: str | None = None) -> Imagen:
        iri = self._editable(camp, ref)
        url = self.save_file(camp, data)
        node, triples = self._image_triples(iri, url, origen, prompt)
        triples.append((nn(iri), nn(str(RPG.hasDepiction)), node))
        removes = self._portrait_triples(camp, iri) if replace else []
        self.k.provenance.commit(camp, actor, removes={camp.canon: removes}, adds={camp.canon: triples},
                                 about=[iri], track_time=False)
        return Imagen(nodo=node.value, url=url, origen=origen)

    def remove_portrait(self, camp: CampaignHandle, ref: str, node: str, actor: Actor) -> None:
        iri = self._editable(camp, ref)
        if not node.startswith(iri + "/n/img-"):
            # También se acepta la URL de la imagen (la ficha solo expone las URLs).
            node = next((str(t[0]).strip("<>") for t in self._portrait_triples(camp, iri)
                         if isinstance(t[2], ox.Literal) and t[2].value == node), "")
            if not node:
                raise NotFound("Retrato no encontrado")
        removes = [t for t in self._portrait_triples(camp, iri) if node in (str(t[0]).strip("<>"), str(t[2]).strip("<>"))]
        if not removes:
            raise NotFound("Retrato no encontrado")
        self.k.provenance.commit(camp, actor, removes={camp.canon: removes}, about=[iri], track_time=False)

    def _portrait_triples(self, camp: CampaignHandle, iri: str) -> list[Triple]:
        out: list[Triple] = []
        for t in self.k.store.triples(nn(iri), nn(str(RPG.hasDepiction)), None, camp.canon):
            out.append(t)
            out.extend(self.k.store.triples(t[2], None, None, camp.canon))  # type: ignore[arg-type]
        return out

    def _editable(self, camp: CampaignHandle, ref: str) -> str:
        iri = self.k.entities.resolve(camp, ref)
        if self.k.iris.entity_id(iri) is None or not self.k.entities.exists(camp, iri):
            raise NotFound(f"No existe la entidad '{ref}'")
        return iri

    # ------------------------------------------------------------------- mapas
    def create_map(self, camp: CampaignHandle, nombre: str, descripcion: str, data: bytes, actor: Actor) -> str:
        from loregraph.models import EntidadEntrada

        res = self.k.entities.create(
            camp, EntidadEntrada(clases=["rpg:Map"], valores={"rdfs:label": [nombre],
                                                               **({"schema:description": [descripcion]} if descripcion else {})}),
            actor,
        )
        url = self.save_file(camp, data)
        node, triples = self._image_triples(res.iri, url, "subida")
        triples.append((nn(res.iri), nn(str(RPG.mapImage)), node))
        self.k.provenance.commit(camp, actor, adds={camp.canon: triples}, about=[res.iri], track_time=False)
        return res.id

    def maps(self, camp: CampaignHandle, lang: str = "es") -> list[Mapa]:
        rows = self.k.store.select(f"SELECT ?m WHERE {{ ?m a <{RPG.Map}> }}", default_graph=[camp.canon])
        return sorted((self.get_map(camp, r["m"].value, lang) for r in rows), key=lambda m: m.entidad.etiqueta.lower())

    def get_map(self, camp: CampaignHandle, ref: str, lang: str = "es") -> Mapa:
        iri = self.k.entities.resolve(camp, ref)
        if not self.k.store.query(f"ASK {{ <{iri}> a <{RPG.Map}> }}", default_graph=[camp.canon]):
            raise NotFound(f"No existe el mapa '{ref}'")
        img = self.k.store.select(
            f"""SELECT ?n ?u ?o WHERE {{ <{iri}> <{RPG.mapImage}> ?n . ?n <{SCHEMA.contentUrl}> ?u .
                OPTIONAL {{ ?n <{RPG.imageOrigin}> ?o }} }}""",
            default_graph=[camp.canon],
        )
        marks = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> SELECT ?n ?e ?x ?y WHERE {{
                <{iri}> rpg:hasMarker ?n . ?n rpg:markerOf ?e ; rpg:markerX ?x ; rpg:markerY ?y . }}""",
            default_graph=[camp.canon],
        )
        labeler = Labeler(self.k.store, camp, lang)
        labeler.preload([iri, *(m["e"].value for m in marks)])
        return Mapa(
            entidad=labeler.entity_ref(iri, with_description=True),
            imagen=Imagen(nodo=img[0]["n"].value, url=img[0]["u"].value,
                          origen=img[0]["o"].value if "o" in img[0] else None) if img else None,
            marcadores=[
                Marcador(nodo=m["n"].value, entidad=labeler.entity_ref(m["e"].value),
                         x=float(literal_python_value(m["x"])), y=float(literal_python_value(m["y"])))  # type: ignore[arg-type]
                for m in marks
            ],
        )

    def set_markers(self, camp: CampaignHandle, ref: str, marcadores: list[MarcadorEntrada], actor: Actor,
                    lang: str = "es") -> Mapa:
        iri = self.get_map(camp, ref, lang).entidad.iri
        removes: list[Triple] = []
        for t in self.k.store.triples(nn(iri), nn(str(RPG.hasMarker)), None, camp.canon):
            removes.append(t)
            removes.extend(self.k.store.triples(t[2], None, None, camp.canon))  # type: ignore[arg-type]
        adds: list[Triple] = []
        for i, m in enumerate(marcadores):
            if not (0 <= m.x <= 1 and 0 <= m.y <= 1):
                raise BadRequest("Las coordenadas de los marcadores van de 0 a 1")
            target = self.k.entities.resolve(camp, m.entidad)
            if not self.k.store.query(f"ASK {{ <{target}> a ?t }}", default_graph=camp.read_graphs):
                raise BadRequest(f"No existe la entidad '{m.entidad}'")
            node = nn(f"{iri}/n/mk-{i}-{secrets.token_hex(3)}")
            adds += [
                (nn(iri), nn(str(RPG.hasMarker)), node),
                (node, TYPE, nn(str(RPG.MapMarker))),
                (node, nn(str(RPG.markerOf)), nn(target)),
                (node, nn(str(RPG.markerX)), ox.Literal(f"{m.x:.5f}", datatype=nn("http://www.w3.org/2001/XMLSchema#decimal"))),
                (node, nn(str(RPG.markerY)), ox.Literal(f"{m.y:.5f}", datatype=nn("http://www.w3.org/2001/XMLSchema#decimal"))),
            ]
        self.k.provenance.commit(camp, actor, removes={camp.canon: removes}, adds={camp.canon: adds}, about=[iri],
                                 track_time=False)
        return self.get_map(camp, iri, lang)

    def maps_of_entity(self, camp: CampaignHandle, ref: str, lang: str = "es") -> list[Mapa]:
        iri = self.k.entities.resolve(camp, ref)
        rows = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> SELECT DISTINCT ?m WHERE {{ ?m rpg:hasMarker/rpg:markerOf <{iri}> }}""",
            default_graph=[camp.canon],
        )
        return [self.get_map(camp, r["m"].value, lang) for r in rows]
