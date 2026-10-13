"""Registro de módulos (descubrimiento, dependencias), variantes, temas y recursos estáticos.

Usa módulos mínimos creados en carpetas temporales; nunca los de ``modules/``.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from loregraph.main import create_app
from loregraph.modules.registry import ModuleError, ModuleRegistry, parse_query_header
from loregraph.services.kernel import Kernel
from tests.conftest import RemotoFalso, escribir_modulo, make_settings

BASE = "https://loregraph.example.org/data/"
TEMA_A = {"radio": "0.1rem", "claro": {"background": "#000001"}, "oscuro": {"background": "#000002"}}
TEMA_B = {"radio": "0.2rem", "claro": {"background": "#0000b1"}, "oscuro": {"background": "#0000b2"}}


# ------------------------------------------------------------ registro puro
def test_descubrimiento_e_ignorados(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    mods = tmp_path / "mods"
    escribir_modulo(mods, "alfa")
    escribir_modulo(mods, "beta", depende_de={"core": ">=0.1", "alfa": ">=0.1"})
    (mods / "roto").mkdir()
    (mods / "roto" / "manifest.yaml").write_text("id: roto\nnombre: [no: valido\n", encoding="utf-8")
    (mods / "incompleto").mkdir()
    (mods / "incompleto" / "manifest.yaml").write_text("id: incompleto\n", encoding="utf-8")
    escribir_modulo(mods, "extra", extra_manifest="campo_raro: 1\n")  # extra="forbid"
    escribir_modulo(mods, "version-mala", version="no-es-version")
    (mods / "sin-manifiesto").mkdir()
    (mods / "suelto.txt").write_text("x", encoding="utf-8")
    dup = escribir_modulo(mods, "zzz-duplicado")
    (dup / "manifest.yaml").write_text((dup / "manifest.yaml").read_text(encoding="utf-8")
                                       .replace("id: zzz-duplicado", "id: alfa"), encoding="utf-8")
    reg = ModuleRegistry(mods, BASE)
    assert set(reg.modules) == {"core", "alfa", "beta"}
    assert "Módulo ignorado" in caplog.text
    assert "duplicado" in caplog.text
    core = reg.get("core")
    assert core.manifest.categoria == "nucleo"
    assert [q.id for q in core.queries][0] == "core:01-personajes-faccion"
    assert {r.nombre for r in core.rules} == {"current-relationships", "knows-symmetric"}
    # __DATA_BASE__ se sustituye en las formas
    assert "__DATA_BASE__" not in core.shapes and BASE in core.shapes


def test_carpeta_de_modulos_inexistente(tmp_path: Path) -> None:
    reg = ModuleRegistry(tmp_path / "no-existe", BASE)
    assert list(reg.modules) == ["core"]


def test_resolucion_en_orden_topologico(tmp_path: Path) -> None:
    escribir_modulo(tmp_path, "alfa")
    escribir_modulo(tmp_path, "beta", depende_de={"alfa": ">=0.1"})
    escribir_modulo(tmp_path, "gamma", depende_de={"beta": "", "core": ">=0.1"})
    reg = ModuleRegistry(tmp_path, BASE)
    assert [m.id for m in reg.resolve(["gamma"])] == ["core", "alfa", "beta", "gamma"]
    assert [m.id for m in reg.resolve(["beta", "alfa"])] == ["core", "alfa", "beta"]
    assert [m.id for m in reg.resolve([])] == ["core"]


def test_dependencia_inexistente(tmp_path: Path) -> None:
    escribir_modulo(tmp_path, "huerfano", depende_de={"fantasma": ">=1"})
    reg = ModuleRegistry(tmp_path, BASE)
    with pytest.raises(ModuleError, match="fantasma"):
        reg.resolve(["huerfano"])
    with pytest.raises(ModuleError, match="desconocido"):
        reg.resolve(["no-existe"])


def test_version_incompatible(tmp_path: Path) -> None:
    escribir_modulo(tmp_path, "alfa", version="0.1.0")
    escribir_modulo(tmp_path, "beta", depende_de={"alfa": ">=1.0"})
    escribir_modulo(tmp_path, "gamma", depende_de={"alfa": "~~raro"})
    reg = ModuleRegistry(tmp_path, BASE)
    with pytest.raises(ModuleError, match="requiere alfa >=1.0"):
        reg.resolve(["beta"])
    with pytest.raises(ModuleError, match="Especificador"):
        reg.resolve(["gamma"])


def test_dependencias_circulares(tmp_path: Path) -> None:
    escribir_modulo(tmp_path, "ciclo-a", depende_de={"ciclo-b": ""})
    escribir_modulo(tmp_path, "ciclo-b", depende_de={"ciclo-a": ""})
    reg = ModuleRegistry(tmp_path, BASE)
    with pytest.raises(ModuleError, match="circular"):
        reg.resolve(["ciclo-a"])


def test_cabecera_de_consultas() -> None:
    meta = parse_query_header("# titulo: Uno\n#descripcion: Dos: tres\n\nPREFIX x: <y>\n# ignorado: si\n")
    assert meta == {"titulo": "Uno", "descripcion": "Dos: tres"}


# ------------------------------------------------------ núcleo con módulos
@pytest.fixture
def mods_dir(tmp_path: Path) -> Path:
    d = tmp_path / "mods"
    escribir_modulo(d, "alfa", tema=TEMA_A)
    escribir_modulo(d, "beta", tema=TEMA_B)
    escribir_modulo(d, "gris")  # sin tema
    a = d / "alfa" / "assets"
    a.mkdir()
    (a / "fuente.txt").write_text("hola", encoding="utf-8")
    secreto = d / "alfa" / "assets-privado"
    secreto.mkdir()
    (secreto / "secreto.txt").write_text("no debería verse", encoding="utf-8")
    return d


@pytest.fixture
def cli_mod(tmp_path: Path, mods_dir: Path, remoto: RemotoFalso) -> Iterator[TestClient]:
    s = make_settings(tmp_path, modules_dir=mods_dir)
    k = Kernel(s, in_memory=True)
    k.http_transport = httpx.MockTransport(remoto)  # type: ignore[attr-defined]
    with TestClient(create_app(s, k, with_mcp=False)) as c:
        yield c


def test_listado_de_modulos(cli_mod: TestClient) -> None:
    mods = cli_mod.get("/modulos").json()
    assert mods[0]["id"] == "core" and mods[0]["categoria"] == "nucleo"
    assert {m["id"] for m in mods} == {"core", "alfa", "beta", "gris"}
    alfa = next(m for m in mods if m["id"] == "alfa")
    assert alfa["nombre"] == "Módulo alfa"
    assert alfa["prefijo"] == "alfa"
    assert alfa["tema"]["radio"] == "0.1rem"
    assert cli_mod.get("/modulos", params={"idioma": "en"}).json()[0]["nombre"] == "Core"
    assert cli_mod.get("/salud").json()["modulos"] == ["alfa", "beta", "core", "gris"]


def test_campana_con_modulo_desconocido_400(cli_mod: TestClient) -> None:
    r = cli_mod.post("/campanas", json={"nombre": "X", "modulos": ["no-existe"]})
    assert r.status_code == 400
    assert "no-existe" in r.json()["detalle"]
    r = cli_mod.put("/campanas/x", json={"nombre": "X", "modulos": []})
    assert r.status_code == 404


def test_variantes_en_formulario_y_tipos(cli_mod: TestClient) -> None:
    r = cli_mod.post("/campanas", json={"nombre": "Con alfa", "id": "con-alfa", "modulos": ["alfa"]})
    assert r.status_code == 201
    assert r.json()["modulos"] == ["alfa"]
    assert r.json()["sistema"] == "Módulo alfa"
    info = cli_mod.get("/campanas/con-alfa").json()
    tipos = {t["clase"]["clave"]: t for t in info["tipos"]}
    assert [v["clave"] for v in tipos["rpg:NonPlayerCharacter"]["variantes"]] == ["alfa:Monster"]
    assert [v["clave"] for v in tipos["rpg:PlayerCharacter"]["variantes"]] == ["alfa:Monster"]
    assert tipos["rpg:Place"]["variantes"] == []
    assert info["prefijos"]["alfa"] == "https://rpg-modules.example.net/alfa/ont#"
    form = cli_mod.get("/campanas/con-alfa/formularios/rpg:NonPlayerCharacter").json()
    assert [v["clave"] for v in form["variantes"]] == ["alfa:Monster"]
    assert "alfa:ferocity" not in {c["id"] for c in form["campos"]}
    form = cli_mod.get("/campanas/con-alfa/formularios/rpg:NonPlayerCharacter",
                       params={"variante": "alfa:Monster"}).json()
    fer = next(c for c in form["campos"] if c["id"] == "alfa:ferocity")
    assert fer["modulo"] == "alfa" and fer["restricciones"]["maxInclusive"] == 5
    assert form["etiqueta"] == "PNJ · Monstruo alfa"
    # una campaña sin el módulo no conoce la variante
    cli_mod.post("/campanas", json={"nombre": "Sin", "id": "sin"})
    assert cli_mod.get("/campanas/sin/formularios/rpg:NonPlayerCharacter").json()["variantes"] == []
    assert cli_mod.get("/campanas/sin/formularios/alfa:Monster").status_code == 400


def test_entidad_con_variante_valida_las_formas_del_modulo(cli_mod: TestClient) -> None:
    cli_mod.post("/campanas", json={"nombre": "Con alfa", "id": "con-alfa", "modulos": ["alfa"]})
    E = "/campanas/con-alfa/entidades"
    r = cli_mod.post(E, json={"clases": ["rpg:NonPlayerCharacter", "alfa:Monster"],
                              "valores": {"rdfs:label": ["Gárgola"], "alfa:ferocity": [9]}})
    assert r.status_code == 422
    assert r.json()["errores"][0]["campo"] == "alfa:ferocity"
    r = cli_mod.post(E, json={"clases": ["rpg:NonPlayerCharacter", "alfa:Monster"],
                              "valores": {"rdfs:label": ["Gárgola"], "alfa:ferocity": [4]}, "id": "gargola"})
    assert r.status_code == 201
    ent = cli_mod.get(f"{E}/gargola").json()
    assert [c["clave"] for c in ent["clases"]] == ["rpg:NonPlayerCharacter", "alfa:Monster"]
    assert ent["valores"]["alfa:ferocity"][0]["valor"] == 4
    nodo = next(n for n in cli_mod.get("/campanas/con-alfa/grafo").json()["nodos"] if n["id"] == "gargola")
    assert nodo["tipo"] == "rpg:NonPlayerCharacter"
    assert set(nodo["clases"]) == {"rpg:NonPlayerCharacter", "alfa:Monster"}


def test_seleccion_de_tema(cli_mod: TestClient) -> None:
    def tema(mods: list[str]) -> dict:
        cid = "t-" + ("-".join(mods) or "nucleo")
        cli_mod.post("/campanas", json={"nombre": cid, "id": cid, "modulos": mods})
        return cli_mod.get(f"/campanas/{cid}").json()["tema"]

    assert tema([])["modulo"] == "core"
    t = tema(["alfa"])
    assert t["modulo"] == "alfa" and t["urlBaseAssets"] == "/modulos/alfa/assets/"
    assert t["tema"]["claro"]["background"] == "#000001"
    assert tema(["gris"])["modulo"] == "core"  # sin tema propio: el del núcleo
    assert tema(["beta", "alfa"])["modulo"] == "beta"  # el último módulo con tema en el orden de resolución
    panel = cli_mod.get("/campanas/t-alfa/panel").json()
    assert panel["tema"]["modulo"] == "alfa"


def test_editar_modulos_de_una_campana(cli_mod: TestClient) -> None:
    cli_mod.post("/campanas", json={"nombre": "C", "id": "c"})
    r = cli_mod.put("/campanas/c", json={"nombre": "C2", "descripcion": "d", "modulos": ["alfa"]})
    assert r.status_code == 200
    assert r.json()["nombre"] == "C2" and r.json()["modulos"] == ["alfa"]
    assert cli_mod.get("/campanas/c/formularios/alfa:Monster").status_code == 200
    assert cli_mod.put("/campanas/c", json={"nombre": "C", "modulos": ["nada"]}).status_code == 400


def test_recursos_estaticos(cli_mod: TestClient) -> None:
    r = cli_mod.get("/modulos/alfa/assets/fuente.txt")
    assert r.status_code == 200 and r.text == "hola"
    assert cli_mod.get("/modulos/alfa/assets/no-existe.txt").status_code == 404
    assert cli_mod.get("/modulos/nada/assets/fuente.txt").status_code == 404
    assert cli_mod.get("/modulos/core/assets/x.txt").status_code == 404


@pytest.mark.parametrize("ruta", [
    "/modulos/alfa/assets/../manifest.yaml",
    "/modulos/alfa/assets/..%2Fmanifest.yaml",
    "/modulos/alfa/assets/%2E%2E/manifest.yaml",
    "/modulos/alfa/assets/..%2F..%2Fbeta%2Fmanifest.yaml",
])
def test_recursos_estaticos_sin_salir_de_assets(cli_mod: TestClient, ruta: str) -> None:
    r = cli_mod.get(ruta)
    assert r.status_code == 404
    assert "id:" not in r.text


def test_recursos_estaticos_carpeta_hermana_con_prefijo(cli_mod: TestClient) -> None:
    r = cli_mod.get("/modulos/alfa/assets/..%2Fassets-privado%2Fsecreto.txt")
    assert r.status_code == 404


def test_campana_conserva_modulos_que_desaparecen(tmp_path: Path, remoto: RemotoFalso) -> None:
    """Si un módulo deja de estar disponible, la campaña se abre solo con el núcleo (sin fallar)."""
    import shutil

    d = tmp_path / "mods"
    escribir_modulo(d, "alfa")
    s = make_settings(tmp_path, modules_dir=d)
    k = Kernel(s, in_memory=True)
    with TestClient(create_app(s, k, with_mcp=False)) as c:
        c.post("/campanas", json={"nombre": "C", "id": "c", "modulos": ["alfa"]})
        shutil.rmtree(d / "alfa")
        k.reload_modules()
        k.campaigns.invalidate()
        info = c.get("/campanas/c").json()
        assert info["campana"]["modulos"] == ["alfa"]  # declarados
        assert "alfa" not in info["prefijos"]
        assert c.get("/campanas/c/formularios/rpg:Place").status_code == 200
