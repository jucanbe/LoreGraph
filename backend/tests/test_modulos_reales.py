"""Pruebas de integración con los módulos reales del repositorio (vtm5, dnd5e)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from loregraph.config import REPO_ROOT, Settings
from loregraph.main import create_app
from loregraph.seed import seed_examples, validate_campaign
from loregraph.services.kernel import Kernel


@pytest.fixture(scope="module")
def kernel_real(tmp_path_factory: pytest.TempPathFactory) -> Kernel:
    s = Settings(_env_file=None, modules_dir=REPO_ROOT / "modules", data_dir=tmp_path_factory.mktemp("datos"),
                 federation_enabled=False)
    k = Kernel(s, in_memory=True)
    seed_examples(k)
    return k


@pytest.fixture(scope="module")
def cliente(kernel_real: Kernel) -> Iterator[TestClient]:
    with TestClient(create_app(kernel_real.settings, kernel_real, with_mcp=False)) as c:
        yield c


@pytest.mark.parametrize("cid", ["noches-de-madrid", "costa-ceniza"])
def test_campanas_de_ejemplo_validas(kernel_real: Kernel, cid: str) -> None:
    assert validate_campaign(kernel_real, kernel_real.campaign(cid)) == []


def test_vinculo_de_sangre_con_tipo_oculto(cliente: TestClient) -> None:
    """El tipo de relación oculto (sh:defaultValue) debe validarse con el tipo de su concepto."""
    cuerpo = {
        "clases": ["rpg:NonPlayerCharacter", "vtm:Vampire"],
        "valores": {
            "rdfs:label": ["Ghoul de prueba"],
            "vtm:hasBloodBond": [{"valores": {"rpg:target": ["isabel-sandoval"], "vtm:bondLevel": [2]}}],
        },
    }
    r = cliente.post("/campanas/noches-de-madrid/entidades", json=cuerpo)
    assert r.status_code == 201, r.json()
    e = cliente.get(f"/campanas/noches-de-madrid/entidades/{r.json()['id']}").json()
    vinculos = [x for x in e["relaciones"] if x["cualificada"]]
    assert vinculos and vinculos[0]["tipoRelacion"]["clave"] == "vtm:rel-blood-bond"


def test_reeditar_ficha_completa_conserva_validez(cliente: TestClient) -> None:
    """Reenviar los valores de una ficha existente (como hace el formulario) no debe fallar."""
    cid = "noches-de-madrid"
    form = cliente.get(f"/campanas/{cid}/formularios/rpg:PlayerCharacter", params={"variante": "vtm:Vampire"}).json()
    ent = cliente.get(f"/campanas/{cid}/entidades/teo-almagro").json()
    campos = {c["id"]: c for c in form["campos"] if not c["oculto"]}

    def a_entrada(campo: dict, v: dict) -> object:
        if campo["tipo"] == "objeto":
            sub = {c["id"]: c for c in campo["subformulario"]["campos"] if not c["oculto"]}
            return {"iri": v["valor"], "valores": {
                cv["id"]: [a_entrada(sub[cv["id"]], x) for x in cv["valores"]] for cv in v["campos"] if cv["id"] in sub
            }}
        if campo["tipo"] == "referencia":
            return v["id"] or v["valor"]
        return v["valor"]

    valores = {k: [a_entrada(campos[k], v) for v in vs] for k, vs in ent["valores"].items() if k in campos}
    valores["vtm:hunger"] = [3]
    r = cliente.put(f"/campanas/{cid}/entidades/teo-almagro",
                    json={"clases": ["rpg:PlayerCharacter", "vtm:Vampire"], "valores": valores})
    assert r.status_code == 200, r.json()
    assert cliente.get(f"/campanas/{cid}/entidades/teo-almagro").json()["valores"]["vtm:hunger"][0]["valor"] == 3


def test_conceptos_sin_id_navegable(cliente: TestClient) -> None:
    e = cliente.get("/campanas/noches-de-madrid/entidades/teo-almagro").json()
    vital = e["valores"]["rpg:vitalStatus"][0]
    assert vital["id"] is None and vital["clave"] == "rpg:vital-alive"
    clan = e["valores"]["vtm:clan"][0]
    assert clan["id"] == "vtm:clan-toreador"


def test_generador_respeta_estadisticas_vtm5(kernel_real: Kernel) -> None:
    from loregraph.agents.generator import build_output_spec

    camp = kernel_real.campaign("noches-de-madrid")
    form = kernel_real.entities.form(camp, ["rpg:NonPlayerCharacter", "vtm:Vampire"], "es")
    spec = build_output_spec(kernel_real, camp, form, "es", 1, True)
    ficha = spec.model.model_json_schema()["$defs"]["Ficha"]["properties"]
    hambre = ficha["hunger"]["anyOf"][0]
    assert (hambre["minimum"], hambre["maximum"]) == (0, 5)
    gen = ficha["generation"]["anyOf"][0]
    assert (gen["minimum"], gen["maximum"]) == (3, 16)
    # disciplinas: objeto anidado con su nivel acotado
    disc = next(s for s in spec.slots if s.sub and any(x.campo.restricciones.maxInclusive == 5 for x in s.sub))
    assert disc.campo.subformulario is not None
