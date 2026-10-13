"""Exportación e importación de campañas completas.

El archivo es un ZIP con:

* ``loregraph.json``: formato, versión, datos de la campaña (nombre, módulos),
  IRI base de origen, ajustes de la campaña, consultas guardadas e incoherencias
  ignoradas;
* ``grafos.nq``: todos los grafos de la campaña en N-Quads (canon, derivado,
  procedencia, propuestas, conocimiento de cada personaje);
* ``media/``: imágenes subidas (retratos y mapas).

Al importar se reescriben las IRIs de la campaña (y de la base de datos de
origen) para que encajen en esta instalación, con el mismo id o con uno nuevo.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import pyoxigraph as ox

from loregraph.apimodel import ApiModel
from loregraph.errors import BadRequest, Conflict
from loregraph.models import CampanaEntrada
from loregraph.modules.registry import ModuleError
from loregraph.services.kernel import CampaignHandle
from loregraph.store.iris import ID_RE

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

FORMAT = "loregraph-campana"
VERSION = 1
MAX_ZIP = 300 * 1024 * 1024
_IRI_RE = re.compile(r"<([^<>\"{}|^`\\\s]*)>")


class ResultadoImportacion(ApiModel):
    id: str
    nombre: str
    tripletas: int
    imagenes: int
    avisos: list[str] = []


class TransferService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # ----------------------------------------------------------------- exportar
    def export(self, camp: CampaignHandle) -> bytes:
        prefix = camp.iri + "/"
        graphs = [g for g in self.k.store.named_graphs() if g.startswith(prefix)]
        quads = []
        for g in graphs:
            gn = ox.NamedNode(g)
            quads.extend(ox.Quad(s, p, o, gn) for s, p, o in self.k.store.triples(graph=g))  # type: ignore[arg-type]
        nq = ox.serialize(quads, format=ox.RdfFormat.N_QUADS) if quads else b""
        meta: dict[str, Any] = {
            "formato": FORMAT,
            "version": VERSION,
            "exportado": datetime.now(UTC).isoformat(timespec="seconds"),
            "base": self.k.iris.data_base,
            "campana": {"id": camp.id, "iri": camp.iri, "nombre": camp.nombre, "descripcion": camp.descripcion,
                        "modulos": camp.declared_modules, "creada": camp.creada},
            "modulos": {m.id: m.manifest.version for m in camp.ctx.modules},
            "ajustes": self.k.campaign_settings.get(camp).model_dump(),
            "consultas": self.k.aux.list_queries(camp.id),
            "ignoradas": sorted(self.k.aux.ignored_get(camp.id)),
        }
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("loregraph.json", json.dumps(meta, ensure_ascii=False, indent=2))
            z.writestr("grafos.nq", nq)
            media_dir = self.k.media.root / camp.id
            if media_dir.is_dir():
                for f in sorted(media_dir.iterdir()):
                    if f.is_file():
                        z.write(f, f"media/{f.name}")
        return buf.getvalue()

    # ----------------------------------------------------------------- importar
    def import_(self, data: bytes, new_id: str | None = None, new_name: str | None = None) -> ResultadoImportacion:
        if len(data) > MAX_ZIP:
            raise BadRequest("El archivo es demasiado grande")
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
            meta = json.loads(z.read("loregraph.json"))
            nq = z.read("grafos.nq")
        except (zipfile.BadZipFile, KeyError, ValueError) as exc:
            raise BadRequest("No es una exportación de LoreGraph válida") from exc
        if meta.get("formato") != FORMAT:
            raise BadRequest("No es una exportación de campaña de LoreGraph")
        if int(meta.get("version", 0)) > VERSION:
            raise BadRequest("La exportación es de una versión más nueva de LoreGraph")
        c = meta["campana"]
        cid = new_id or c["id"]
        if not ID_RE.match(cid):
            raise BadRequest(f"Id de campaña no válido: {cid}")
        if self.k.campaigns.handle(cid) is not None:
            raise Conflict(f"Ya existe la campaña '{cid}': elige otro id")
        try:
            self.k.registry.resolve(c.get("modulos", []))
        except ModuleError as exc:
            raise BadRequest(f"Faltan módulos para importar: {exc}") from exc
        avisos = [
            f"El módulo {mid} es v{self.k.registry.get(mid).manifest.version} (exportado con v{v})"
            for mid, v in (meta.get("modulos") or {}).items()
            if mid in self.k.registry.modules and self.k.registry.get(mid).manifest.version != v
        ]

        old_camp, old_base = c["iri"], meta["base"]
        new_camp = self.k.iris.campaign(cid)
        new_base = self.k.iris.data_base

        def rewrite_iri(iri: str) -> str:
            if iri == old_camp or iri.startswith(old_camp + "/"):
                return new_camp + iri[len(old_camp):]
            if iri.startswith(old_base):
                return new_base + iri[len(old_base):]
            return iri

        old_media, new_media = f'"/media/{c["id"]}/', f'"/media/{cid}/'
        lines = []
        for line in nq.decode("utf-8").splitlines():
            line = _IRI_RE.sub(lambda m: f"<{rewrite_iri(m.group(1))}>", line)
            lines.append(line.replace(old_media, new_media))
        try:
            quads = list(ox.parse("\n".join(lines).encode("utf-8"), format=ox.RdfFormat.N_QUADS))
        except SyntaxError as exc:
            raise BadRequest(f"grafos.nq no es N-Quads válido: {exc}") from exc
        if any(not isinstance(q.graph_name, ox.NamedNode) or not q.graph_name.value.startswith(new_camp + "/")
               for q in quads):
            raise BadRequest("La exportación contiene grafos ajenos a la campaña")

        camp = self.k.campaigns.create(CampanaEntrada(
            id=cid, nombre=new_name or c["nombre"], descripcion=c.get("descripcion", ""), modulos=c.get("modulos", [])))
        with self.k.store.write_lock:
            self.k.store.store.extend(quads)
        # Imágenes
        n_img = 0
        media_dir = self.k.media.root / cid
        for name in z.namelist():
            if name.startswith("media/") and not name.endswith("/"):
                fname = name.split("/", 1)[1]
                if "/" in fname or "\\" in fname or fname.startswith("."):
                    continue
                media_dir.mkdir(parents=True, exist_ok=True)
                (media_dir / fname).write_bytes(z.read(name))
                n_img += 1
        # Ajustes y extras de la base de datos auxiliar
        from loregraph.services.campaign_settings import AjustesCampana

        try:
            self.k.campaign_settings.set(camp, AjustesCampana.model_validate(meta.get("ajustes") or {}))
        except Exception:  # noqa: BLE001 - ajustes antiguos o de otra versión: se ignoran
            avisos.append("No se pudieron recuperar los ajustes de la campaña")
        for q in meta.get("consultas") or []:
            self.k.aux.save_query(cid, q.get("titulo", ""), q.get("descripcion", ""), q.get("consulta", ""))
        for ident in meta.get("ignoradas") or []:
            self.k.aux.ignored_set(cid, ident, True)
        self.k.campaigns.rebuild_campaign(camp)
        return ResultadoImportacion(id=cid, nombre=camp.nombre, tripletas=len(quads), imagenes=n_img, avisos=avisos)
