"""Propuestas de agentes: solo escriben en grafos de propuesta hasta que un humano las aprueba."""

from __future__ import annotations

from typing import Any

import pyoxigraph as ox
import pytest
from fastapi.testclient import TestClient

from loregraph.namespaces import PROV, RPG
from loregraph.services.kernel import Kernel
from tests.conftest import WD_MADRID, Campana

P = "/campanas/prueba/propuestas"
E = "/campanas/prueba/entidades"


def _proponer(client: TestClient, **kw: Any) -> dict:
    body = {"agente": "agente-pruebas", "peticion": "petición de prueba", **kw}
    r = client.post(P, json=body)
    assert r.status_code == 200, r.json()
    return r.json()


def _ok(client: TestClient, **kw: Any) -> str:
    res = _proponer(client, **kw)
    assert res["ok"] is True, res["errores"]
    return res["propuesta"]["id"]


def _canon(kernel: Kernel) -> set[str]:
    return {str(t) for t in kernel.store.graph_triples(kernel.iris.canon("prueba"))}


def _contiene(kernel: Kernel, s: str, p: str, o: str | ox.Literal) -> bool:
    obj = o if isinstance(o, ox.Literal) else ox.NamedNode(kernel.iris.entity("prueba", o))
    return kernel.store.contains(ox.NamedNode(kernel.iris.entity("prueba", s)), ox.NamedNode(p), obj,
                                 kernel.iris.canon("prueba"))


NUEVAS = [
    {"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"],
     "valores": {"rdfs:label": ["La Bruja"], "rpg:locatedIn": ["nuevo:2"]}},
    {"ref": "nuevo:2", "clases": ["rpg:Place"], "valores": {"rdfs:label": ["La Cueva"], "rpg:locatedIn": ["madrid"]}},
]


# --------------------------------------------------------------------- crear
def test_crear_con_entidades_nuevas_no_toca_el_canon(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = _canon(kernel)
    res = _proponer(client, entidades=NUEVAS, resumen="Una bruja en una cueva")
    assert res["ok"] is True, res["errores"]
    prop = res["propuesta"]
    assert prop["estado"] == "pendiente"
    assert prop["tipoAgente"] == "agente"
    assert prop["agente"] == "agente-pruebas"
    assert prop["destino"] == "canon"
    assert prop["resumen"] == "Una bruja en una cueva"
    assert prop["numAnadidas"] == 6 and prop["numEliminadas"] == 0
    assert {e["etiqueta"] for e in prop["entidades"]} == {"La Bruja", "La Cueva"}
    assert _canon(kernel) == antes
    assert client.get(E, params={"q": "bruja"}).json()["pagina"]["total"] == 0
    # las tripletas viven en el grafo de la propuesta
    assert kernel.store.has_graph(kernel.iris.proposal_graph("prueba", prop["id"]))


def test_detalle_con_diff_legible(campana: Campana, client: TestClient) -> None:
    pid = _ok(client, entidades=NUEVAS)
    det = client.get(f"{P}/{pid}").json()
    assert det["errores"] == []
    filas = {(t["sujeto"]["etiqueta"], t["predicado"]["etiqueta"], t["objeto"]["etiqueta"]) for t in det["anadidas"]}
    assert ("La Bruja", "ubicado en", "La Cueva") in filas
    assert ("La Cueva", "ubicado en", "Madrid") in filas
    assert ("La Bruja", "tipo", "PNJ") in filas
    assert ("La Bruja", "nombre", "La Bruja") in filas
    # orden: por sujeto y con rdf:type primero
    sujetos = [t["sujeto"]["valor"] for t in det["anadidas"]]
    assert sujetos == sorted(sujetos)
    assert det["eliminadas"] == []


def test_anadir_y_eliminar_tripletas(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    pid = _ok(client,
              anadir=[{"s": "toledo", "p": "rpg:locatedIn", "o": "madrid"},
                      {"s": "toledo", "p": "schema:description", "o": "Ciudad imperial", "literal": True}],
              eliminar=[{"s": "madrid", "p": "rpg:correspondsTo", "o": WD_MADRID}])
    det = client.get(f"{P}/{pid}").json()
    assert det["numAnadidas"] == 2 and det["numEliminadas"] == 1
    assert det["eliminadas"][0]["predicado"]["clave"] == "rpg:correspondsTo"
    assert det["eliminadas"][0]["sujeto"]["etiqueta"] == "Madrid"
    editable = client.get(f"{P}/{pid}/editable").json()
    assert len(editable["anadir"]) == 2 and len(editable["eliminar"]) == 1
    assert any(t["literal"] and t["o"] == "Ciudad imperial" for t in editable["anadir"])

    r = client.post(f"{P}/{pid}/aprobar", json={})
    assert r.status_code == 200, r.json()
    assert _contiene(kernel, "toledo", str(RPG.locatedIn), "madrid")
    assert not kernel.store.contains(ox.NamedNode(kernel.iris.entity("prueba", "madrid")),
                                     ox.NamedNode(str(RPG.correspondsTo)), ox.NamedNode(WD_MADRID),
                                     kernel.iris.canon("prueba"))


def test_turtle(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    pid = _ok(client, turtle='<entity/toledo> schema:description "Desde Turtle" ; rpg:locatedIn <entity/madrid> .')
    client.post(f"{P}/{pid}/aprobar", json={})
    assert _contiene(kernel, "toledo", "https://schema.org/description", ox.Literal("Desde Turtle"))


def test_turtle_no_valido(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, turtle="esto no es turtle")
    assert res["ok"] is False
    assert res["errores"][0]["mensaje"].startswith("Turtle no válido")


def test_propuesta_vacia(campana: Campana, client: TestClient) -> None:
    res = _proponer(client)
    assert res["ok"] is False
    assert res["errores"][0]["mensaje"] == "La propuesta está vacía"


def test_destino_no_valido_400(campana: Campana, client: TestClient) -> None:
    r = client.post(P, json={"agente": "a", "peticion": "p", "destino": "otro",
                             "anadir": [{"s": "toledo", "p": "rdfs:label", "o": "x", "literal": True}]})
    assert r.status_code == 400


# ----------------------------------------------------------------- errores
def test_error_shacl_entidad_sin_nombre(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = _canon(kernel)
    res = _proponer(client, entidades=[{"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"], "valores": {}}])
    assert res["ok"] is False
    assert any(e["campo"] == "rdfs:label" and e["mensaje"] == "Campo obligatorio" for e in res["errores"])
    assert client.get(P).json() == []
    assert _canon(kernel) == antes


def test_error_shacl_en_tripleta_suelta(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, anadir=[{"s": "toledo", "p": "rpg:locatedIn", "o": "ernesto"}])
    assert res["ok"] is False
    assert res["errores"][0]["campo"] == "rpg:locatedIn"
    assert res["errores"][0]["mensaje"] == "Debe ser: Lugar"
    res = _proponer(client, anadir=[{"s": "toledo", "p": "rpg:locatedIn", "o": "madrid"},
                                    {"s": "toledo", "p": "rpg:locatedIn", "o": "toledo"}])
    assert any("como máximo 1" in e["mensaje"] for e in res["errores"])


def test_entidad_nueva_sin_clases_o_con_clase_desconocida(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, entidades=[{"ref": "nuevo:1", "valores": {"rdfs:label": ["X"]}}])
    assert res["ok"] is False and "necesita 'clases'" in res["errores"][0]["mensaje"]
    res = _proponer(client, entidades=[{"ref": "nuevo:1", "clases": ["rpg:Inventada"],
                                        "valores": {"rdfs:label": ["X"]}}])
    assert res["ok"] is False and "Clase desconocida" in res["errores"][0]["mensaje"]
    res = _proponer(client, entidades=[{"ref": "nuevo:1", "clases": ["rpg:Place"], "valores": {"rpg:foo": ["X"]}}])
    assert res["ok"] is False and res["errores"][0]["campo"] == "rpg:foo"


def test_predicado_con_prefijo_desconocido(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, anadir=[{"s": "toledo", "p": "foo:bar", "o": "x", "literal": True}])
    assert res["ok"] is False
    assert res["errores"][0]["mensaje"] == "Predicado no válido: foo:bar"
    res = _proponer(client, anadir=[{"s": "toledo", "p": "rdfs:label", "o": "zz:nada"},
                                    {"s": "zz:nada", "p": "rdfs:label", "o": "x"}])
    assert res["ok"] is False
    assert {e["mensaje"] for e in res["errores"]} >= {"Sujeto no válido: zz:nada"}


def test_predicado_inexistente_en_rpg_rechazado(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, anadir=[{"s": "toledo", "p": "rpg:inventada", "o": "x", "literal": True}])
    assert res["ok"] is False


@pytest.mark.parametrize("anadir", [
    [{"s": WD_MADRID, "p": "rdfs:label", "o": "Madrid real", "literal": True}],
    [{"s": "rpg:Place", "p": "rdfs:label", "o": "Sitio", "literal": True}],
    [{"s": "https://loregraph.example.org/data/campaign/otra/entity/x", "p": "rdfs:label", "o": "X", "literal": True}],
])
def test_sujeto_fuera_de_la_campana_rechazado(campana: Campana, client: TestClient, anadir: list) -> None:
    res = _proponer(client, anadir=anadir)
    assert res["ok"] is False
    assert any("Solo se pueden afirmar hechos sobre entidades de esta campaña" in e["mensaje"] for e in res["errores"])


def test_sujeto_externo_en_turtle_rechazado(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, turtle=f'<{WD_MADRID}> rdfs:label "Madrid" .')
    assert res["ok"] is False
    assert "Solo se pueden afirmar hechos" in res["errores"][0]["mensaje"]


def test_eliminar_tripleta_inexistente(campana: Campana, client: TestClient) -> None:
    res = _proponer(client, eliminar=[{"s": "toledo", "p": "rpg:locatedIn", "o": "madrid"}])
    assert res["ok"] is False
    assert res["errores"][0]["mensaje"] == "La tripleta a eliminar no existe"


def test_errores_en_ingles(campana: Campana, client: TestClient) -> None:
    r = client.post(P, params={"idioma": "en"}, json={"agente": "a", "peticion": "p"})
    assert r.json()["errores"][0]["mensaje"] == "The proposal is empty"


def test_propuesta_sobre_entidad_con_referencias_existentes(campana: Campana, client: TestClient) -> None:
    """Regresión: la validación incluye los tipos de lo que ya referencia la entidad (Lucía → Madrid, sesión 1…)."""
    res = _proponer(client, anadir=[{"s": "lucia", "p": "rpg:knows", "o": "ernesto"}])
    assert res["ok"] is True, res["errores"]


# --------------------------------------------------------------- aprobar
def test_aprobar_aplica_al_canon_con_procedencia(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    pid = _ok(client, entidades=NUEVAS)
    det_antes = client.get(f"{P}/{pid}").json()
    r = client.post(f"{P}/{pid}/aprobar", json={"nota": "bien"}, headers={"X-Usuario": "dm-ana"})
    assert r.status_code == 200, r.json()
    res = r.json()
    assert res["estado"] == "aprobada"
    assert res["notaRevision"] == "bien"
    assert res["revisada"]
    # aplicada al canon
    bruja = client.get(E, params={"q": "bruja"}).json()["elementos"]
    assert len(bruja) == 1
    ficha = client.get(f"{E}/{bruja[0]['id']}").json()
    assert ficha["valores"]["rpg:locatedIn"][0]["etiqueta"] == "La Cueva"
    # procedencia: el cambio usa la propuesta y conserva la petición
    hist = client.get(f"{E}/{bruja[0]['id']}/procedencia").json()
    assert hist[0]["propuesta"] == pid
    assert hist[0]["peticion"] == "petición de prueba"
    assert hist[0]["agente"]["nombre"] == "dm-ana"
    prop_iri = kernel.iris.proposal("prueba", pid)
    rows = kernel.store.select(f"SELECT ?ch WHERE {{ ?ch <{PROV.used}> <{prop_iri}> }}",
                               default_graph=[kernel.iris.provenance("prueba")])
    assert len(rows) == 1
    # el grafo de la propuesta desaparece, pero el detalle sigue mostrando lo añadido
    assert not kernel.store.has_graph(kernel.iris.proposal_graph("prueba", pid))
    det = client.get(f"{P}/{pid}").json()
    assert det["estado"] == "aprobada"
    assert det["numAnadidas"] == det_antes["numAnadidas"] == len(det["anadidas"])
    assert {t["sujeto"]["etiqueta"] for t in det["anadidas"]} == {"La Bruja", "La Cueva"}
    assert len(client.get(f"{P}/{pid}/editable").json()["anadir"]) == det["numAnadidas"]


def test_editar_y_aprobar(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    pid = _ok(client, anadir=[{"s": "toledo", "p": "schema:description", "o": "Texto del agente", "literal": True}])
    r = client.post(f"{P}/{pid}/aprobar", json={"anadir": [
        {"s": "toledo", "p": "schema:description", "o": "Texto corregido por el DM", "literal": True}]})
    assert r.status_code == 200, r.json()
    assert _contiene(kernel, "toledo", "https://schema.org/description", ox.Literal("Texto corregido por el DM"))
    assert not _contiene(kernel, "toledo", "https://schema.org/description", ox.Literal("Texto del agente"))


def test_editar_con_tripletas_no_validas_422(campana: Campana, client: TestClient) -> None:
    pid = _ok(client, anadir=[{"s": "toledo", "p": "schema:description", "o": "x", "literal": True}])
    r = client.post(f"{P}/{pid}/aprobar", json={"anadir": [{"s": "toledo", "p": "zz:mal", "o": "x"}]})
    assert r.status_code == 422
    r = client.post(f"{P}/{pid}/aprobar", json={"anadir": [{"s": "toledo", "p": "rpg:locatedIn", "o": "ernesto"}]})
    assert r.status_code == 422
    assert r.json()["errores"][0]["mensaje"] == "Debe ser: Lugar"
    assert client.get(f"{P}/{pid}").json()["estado"] == "pendiente"


def test_rechazar(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = _canon(kernel)
    pid = _ok(client, entidades=NUEVAS)
    r = client.post(f"{P}/{pid}/rechazar", json={"nota": "no encaja"})
    assert r.status_code == 200
    assert r.json()["estado"] == "rechazada"
    assert r.json()["notaRevision"] == "no encaja"
    assert _canon(kernel) == antes
    assert client.post(f"{P}/{pid}/rechazar", json={}).status_code == 409
    assert client.post(f"{P}/{pid}/aprobar", json={}).status_code == 409


def test_doble_aprobacion_409(campana: Campana, client: TestClient) -> None:
    pid = _ok(client, anadir=[{"s": "toledo", "p": "schema:description", "o": "x", "literal": True}])
    assert client.post(f"{P}/{pid}/aprobar", json={}).status_code == 200
    r = client.post(f"{P}/{pid}/aprobar", json={})
    assert r.status_code == 409
    assert "aprobada" in r.json()["detalle"]


def test_propuesta_inexistente_404(campana: Campana, client: TestClient) -> None:
    assert client.get(f"{P}/nada").status_code == 404
    assert client.post(f"{P}/nada/aprobar", json={}).status_code == 404
    assert client.post(f"{P}/nada/rechazar", json={}).status_code == 404


def test_aprobar_en_lote_con_un_fallo(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    quitar = [{"s": "madrid", "p": "rpg:correspondsTo", "o": WD_MADRID}]
    a = _ok(client, eliminar=quitar)
    b = _ok(client, eliminar=quitar)  # dejará de ser aplicable cuando se apruebe la primera
    c = _ok(client, anadir=[{"s": "toledo", "p": "schema:description", "o": "x", "literal": True}])
    r = client.post(f"{P}/aprobar-lote", json={"ids": [a, b, c, "inexistente"], "nota": "lote"})
    assert r.status_code == 200
    res = r.json()
    assert res["aprobadas"] == [a, c]
    assert set(res["fallidas"]) == {b, "inexistente"}
    assert res["fallidas"][b][0]["mensaje"] == "La tripleta a eliminar no existe"
    assert client.get(f"{P}/{b}").json()["estado"] == "pendiente"
    assert client.post(f"{P}/aprobar-lote", json={"ids": []}).status_code == 422


def test_detalle_de_pendiente_revalida_contra_el_canon(campana: Campana, client: TestClient) -> None:
    quitar = [{"s": "madrid", "p": "rpg:correspondsTo", "o": WD_MADRID}]
    a = _ok(client, eliminar=quitar)
    b = _ok(client, eliminar=quitar)
    client.post(f"{P}/{a}/aprobar", json={})
    det = client.get(f"{P}/{b}").json()
    assert det["errores"][0]["mensaje"] == "La tripleta a eliminar no existe"


def test_listado_y_panel(campana: Campana, client: TestClient) -> None:
    a = _ok(client, anadir=[{"s": "toledo", "p": "schema:description", "o": "a", "literal": True}])
    b = _ok(client, anadir=[{"s": "madrid", "p": "schema:description", "o": "b", "literal": True}])
    assert client.get("/campanas/prueba/panel").json()["propuestasPendientes"] == 2
    assert {p["id"] for p in client.get(P).json()} == {a, b}
    client.post(f"{P}/{a}/aprobar", json={})
    assert client.get("/campanas/prueba/panel").json()["propuestasPendientes"] == 1
    assert [p["id"] for p in client.get(P, params={"estado": "pendiente"}).json()] == [b]
    assert [p["id"] for p in client.get(P, params={"estado": "aprobada"}).json()] == [a]
    assert client.get(P, params={"estado": "rechazada"}).json() == []
    assert client.get(P, params={"estado": "otro"}).status_code == 422


def test_propuesta_al_conocimiento_de_un_personaje(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = _canon(kernel)
    pid = _ok(client, destino="conocimiento/lucia",
              anadir=[{"s": "ernesto", "p": "rpg:locatedIn", "o": "madrid"}])
    prop = client.get(f"{P}/{pid}").json()
    assert prop["destino"] == "conocimiento/lucia"
    kgraph = kernel.iris.knowledge("prueba", "lucia")
    assert kernel.store.graph_triples(kgraph) == []
    assert client.post(f"{P}/{pid}/aprobar", json={}).status_code == 200
    assert len(kernel.store.graph_triples(kgraph)) == 1
    assert _canon(kernel) == antes
    creencias = client.get("/campanas/prueba/conocimiento/lucia").json()["creencias"]
    assert creencias[0]["estado"] == "falso"


def test_propuesta_al_conocimiento_de_un_no_personaje_400(campana: Campana, client: TestClient) -> None:
    r = client.post(P, json={"agente": "a", "peticion": "p", "destino": "conocimiento/madrid",
                             "anadir": [{"s": "ernesto", "p": "rpg:locatedIn", "o": "madrid"}]})
    assert r.status_code == 400


def test_referencia_temporal_desde_tripletas_sueltas(campana: Campana, client: TestClient) -> None:
    """Las claves temporales también valen en ``anadir``."""
    pid = _ok(client, entidades=[{"ref": "nuevo:1", "clases": ["rpg:Item"], "valores": {"rdfs:label": ["Daga"]}}],
              anadir=[{"s": "nuevo:1", "p": "rpg:locatedIn", "o": "toledo"}])
    det = client.get(f"{P}/{pid}").json()
    assert ("Daga", "Toledo") in {(t["sujeto"]["etiqueta"], t["objeto"]["etiqueta"]) for t in det["anadidas"]}


def test_mover_un_personaje_con_propuesta(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    """Eliminar y añadir en la misma propuesta (rpg:locatedIn es funcional)."""
    pid = _ok(client, eliminar=[{"s": "lucia", "p": "rpg:locatedIn", "o": "madrid"}],
              anadir=[{"s": "lucia", "p": "rpg:locatedIn", "o": "toledo"}])
    assert client.post(f"{P}/{pid}/aprobar", json={}).status_code == 200
    assert _contiene(kernel, "lucia", str(RPG.locatedIn), "toledo")
    assert not _contiene(kernel, "lucia", str(RPG.locatedIn), "madrid")
    hist = client.get(f"{E}/lucia/procedencia").json()
    assert hist[0]["propuesta"] == pid
    assert [t["objeto"]["etiqueta"] for t in hist[0]["eliminadas"]] == ["Madrid"]


def test_aprobar_falla_si_el_canon_cambio(campana: Campana, client: TestClient) -> None:
    pid = _ok(client, anadir=[{"s": "toledo", "p": "rpg:locatedIn", "o": "madrid"}])
    # mientras tanto, Madrid deja de ser un lugar
    client.put(f"{E}/madrid", json={"clases": ["rpg:Item"], "valores": {"rdfs:label": ["Madrid"]}})
    r = client.post(f"{P}/{pid}/aprobar", json={})
    assert r.status_code == 422
    assert r.json()["errores"][0]["mensaje"] == "Debe ser: Lugar"
    assert client.get(f"{P}/{pid}").json()["estado"] == "pendiente"
