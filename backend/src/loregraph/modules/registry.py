"""Descubrimiento, validación y resolución de dependencias de módulos."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from packaging.specifiers import InvalidSpecifier, SpecifierSet
from packaging.version import InvalidVersion, Version

from loregraph.modules.context import ContextoModulo
from loregraph.modules.manifest import Manifest

log = logging.getLogger(__name__)

CORE_DIR = Path(__file__).resolve().parent.parent / "ontology"
CORE_ID = "core"


class ModuleError(ValueError):
    """Error al cargar o resolver módulos."""


@dataclass
class Rule:
    nombre: str
    consulta: str


@dataclass
class ExampleQuery:
    id: str
    titulo: str
    descripcion: str
    consulta: str
    modulo: str


@dataclass
class Check:
    """Comprobación de coherencia (`checks/*.rq`): un SELECT con ?entidad y, opcionalmente,
    ?mensaje y ?relacionada. Cabeceras: titulo, titulo_en, descripcion, severidad (error|aviso)."""

    id: str
    titulo: dict[str, str]
    descripcion: str
    severidad: str
    consulta: str
    modulo: str


@dataclass
class Module:
    manifest: Manifest
    path: Path
    ontology: str = ""
    shapes: str = ""
    vocabulary: list[str] = field(default_factory=list)
    rules: list[Rule] = field(default_factory=list)
    prompts: dict[str, str] = field(default_factory=dict)
    queries: list[ExampleQuery] = field(default_factory=list)
    checks: list[Check] = field(default_factory=list)
    context: ContextoModulo = field(default_factory=ContextoModulo)

    @property
    def id(self) -> str:
        return self.manifest.id

    @property
    def assets_path(self) -> Path:
        return self.path / "assets"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def parse_query_header(text: str) -> dict[str, str]:
    """Lee las cabeceras ``# clave: valor`` del principio de un archivo .rq."""
    meta: dict[str, str] = {}
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("#"):
            if s:
                break
            continue
        body = s.lstrip("#").strip()
        if ":" in body:
            k, v = body.split(":", 1)
            meta[k.strip().lower()] = v.strip()
    return meta


def load_module(path: Path, data_base: str) -> Module:
    """Carga un módulo desde su carpeta."""
    manifest_path = path / "manifest.yaml"
    if not manifest_path.is_file():
        raise ModuleError(f"No hay manifest.yaml en {path}")
    try:
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        manifest = Manifest.model_validate(raw)
        Version(manifest.version)
    except (yaml.YAMLError, ValueError, InvalidVersion) as exc:
        raise ModuleError(f"Manifiesto inválido en {manifest_path}: {exc}") from exc

    mod = Module(manifest=manifest, path=path)
    mod.ontology = _read(path / manifest.ontologia)
    mod.shapes = _read(path / manifest.formas).replace("__DATA_BASE__", data_base)
    mod.vocabulary = [t for t in (_read(path / v) for v in manifest.vocabulario) if t]

    context_path = path / manifest.contexto
    if context_path.is_file():
        try:
            raw_ctx = yaml.safe_load(context_path.read_text(encoding="utf-8")) or {}
            mod.context = ContextoModulo.model_validate(raw_ctx)
        except (yaml.YAMLError, ValueError) as exc:
            raise ModuleError(f"Contexto inválido en {context_path}: {exc}") from exc

    rules_dir = path / "rules"
    if rules_dir.is_dir():
        for f in sorted(rules_dir.glob("*.rq")):
            mod.rules.append(Rule(nombre=f.stem, consulta=f.read_text(encoding="utf-8")))

    prompts_dir = path / "prompts"
    if prompts_dir.is_dir():
        for f in sorted(prompts_dir.glob("*.md")):
            mod.prompts[f.stem] = f.read_text(encoding="utf-8")

    checks_dir = path / "checks"
    if checks_dir.is_dir():
        for f in sorted(checks_dir.glob("*.rq")):
            text = f.read_text(encoding="utf-8")
            meta = parse_query_header(text)
            sev = meta.get("severidad", "aviso")
            mod.checks.append(Check(
                id=f"{manifest.id}:{f.stem}",
                titulo={"es": meta.get("titulo", f.stem), "en": meta.get("titulo_en", meta.get("titulo", f.stem))},
                descripcion=meta.get("descripcion", ""),
                severidad=sev if sev in ("error", "aviso") else "aviso",
                consulta=text,
                modulo=manifest.id,
            ))

    queries_dir = path / "queries"
    if queries_dir.is_dir():
        for f in sorted(queries_dir.glob("*.rq")):
            text = f.read_text(encoding="utf-8")
            meta = parse_query_header(text)
            mod.queries.append(
                ExampleQuery(
                    id=f"{manifest.id}:{f.stem}",
                    titulo=meta.get("titulo", f.stem),
                    descripcion=meta.get("descripcion", ""),
                    consulta=text,
                    modulo=manifest.id,
                )
            )
    return mod


class ModuleRegistry:
    """Registro de módulos disponibles (núcleo + carpeta de módulos)."""

    def __init__(self, modules_dir: Path, data_base: str) -> None:
        self.modules_dir = modules_dir
        self.data_base = data_base
        self.modules: dict[str, Module] = {}
        self._lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        with self._lock:
            mods: dict[str, Module] = {CORE_ID: load_module(CORE_DIR, self.data_base)}
            if self.modules_dir.is_dir():
                for d in sorted(p for p in self.modules_dir.iterdir() if p.is_dir()):
                    if not (d / "manifest.yaml").is_file():
                        continue
                    try:
                        m = load_module(d, self.data_base)
                    except ModuleError as exc:
                        log.error("Módulo ignorado: %s", exc)
                        continue
                    if m.id in mods:
                        log.error("Módulo duplicado '%s' en %s; se ignora", m.id, d)
                        continue
                    mods[m.id] = m
            self.modules = mods

    def get(self, module_id: str) -> Module:
        try:
            return self.modules[module_id]
        except KeyError:
            raise ModuleError(f"Módulo desconocido: '{module_id}'") from None

    def resolve(self, ids: list[str]) -> list[Module]:
        """Devuelve los módulos pedidos más sus dependencias, en orden topológico.

        El núcleo siempre va primero. Lanza ``ModuleError`` si falta un módulo,
        una versión no satisface un requisito o hay dependencias circulares.
        """
        ordered: list[Module] = []
        state: dict[str, int] = {}  # 1 = visitando, 2 = hecho

        def visit(mid: str, chain: tuple[str, ...]) -> None:
            if state.get(mid) == 2:
                return
            if state.get(mid) == 1:
                raise ModuleError("Dependencia circular: " + " → ".join((*chain, mid)))
            mod = self.get(mid)
            state[mid] = 1
            for dep, spec in mod.manifest.depende_de.items():
                dep_mod = self.get(dep)
                try:
                    ok = Version(dep_mod.manifest.version) in SpecifierSet(spec or "")
                except InvalidSpecifier as exc:
                    raise ModuleError(f"Especificador inválido '{spec}' en {mid}") from exc
                if not ok:
                    raise ModuleError(
                        f"'{mid}' requiere {dep} {spec}, disponible {dep_mod.manifest.version}"
                    )
                visit(dep, (*chain, mid))
            state[mid] = 2
            ordered.append(mod)

        visit(CORE_ID, ())
        for mid in ids:
            visit(mid, ())
        return ordered
