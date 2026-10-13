"""CRUD de entidades, errores SHACL por campo y listado con filtros."""

from __future__ import annotations

import re

import pyoxigraph as ox
from fastapi.testclient import TestClient

from loregraph.namespaces import RPG
from loregraph.services.kernel import Kernel
from tests.conftest import Campana, crear_entidad

E = "/campanas/prueba/entidades"


def _errores(r) -> list[dict]:  # type: ignore[no-untyped-def]
    assert r.status_code == 422, r.json()
    return r.json()["errores"]


def _canon(kernel: Kernel, cid: str = "prueba") -> list[tuple]:
    return kernel.store.graph_triples(kernel.iris.canon(cid))


# ------------------------------------------------------------------ alta
def test_crear_genera_id_desde_la_etiqueta(campana: Campana, client: TestClient) -> None:
    r = client.post(E, json={"clases": ["rpg:NonPlayerCharacter"], "valores": {"rdfs:label": ["Doña Inés de Ulloa"]}})
    assert r.status_code == 201
    body = r.json()
    assert re.fullmatch(r"dona-ines-de-ulloa-[0-9a-f]{4}", body["id"])
    assert body["iri"].endswith("/campaign/prueba/entity/" + body["id"])
    assert "/campaign/prueba/change/" in body["cambio"]
    ent = client.get(f"{E}/{body['id']}").json()
    assert ent["etiqueta"] == "Doña Inés de Ulloa"
    assert ent["tipo"]["clave"] == "rpg:NonPlayerCharacter"


def test_crear_con_id_explicito_y_duplicado_409(campana: Campana, client: TestClient) -> None:
    body = {"clases": ["rpg:Place"], "valores": {"rdfs:label": ["Otro Madrid"]}, "id": "madrid"}
    r = client.post(E, json=body)
    assert r.status_code == 409
    assert "madrid" in r.json()["detalle"]


def test_id_con_formato_invalido_422(campana: Campana, client: TestClient) -> None:
    r = client.post(E, json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["X"]}, "id": "Con Espacios"})
    assert r.status_code == 422
    assert r.json()["errores"][0]["campo"] == "id"


def test_referencia_a_clase_incorrecta(campana: Campana, client: TestClient) -> None:
    r = client.post(E, json={"clases": ["rpg:PlayerCharacter"],
                             "valores": {"rdfs:label": ["X"], "rpg:locatedIn": [campana.ernesto]}})
    errs = _errores(r)
    e = next(e for e in errs if e["campo"] == "rpg:locatedIn")
    assert e["mensaje"] == "Debe ser: Lugar"
    assert e["valor"].endswith("/entity/ernesto")
    assert e["severidad"] == "violacion"


def test_referencia_clase_incorrecta_en_ingles(campana: Campana, client: TestClient) -> None:
    valores = {"rdfs:label": ["X"], "rpg:locatedIn": [campana.ernesto]}
    r = client.post(E, params={"idioma": "en"}, json={"clases": ["rpg:PlayerCharacter"], "valores": valores})
    e = next(e for e in _errores(r) if e["campo"] == "rpg:locatedIn")
    assert e["mensaje"] == "Must be: Place"


def test_falta_la_etiqueta(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:NonPlayerCharacter"], "valores": {}}))
    assert any(e["campo"] == "rdfs:label" and e["mensaje"] == "Campo obligatorio" for e in errs)


def test_demasiados_valores_en_campo_unico(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:NonPlayerCharacter"],
                                         "valores": {"rdfs:label": ["A", "B"]}}))
    assert any(e["campo"] == "rdfs:label" and "como máximo 1" in e["mensaje"] for e in errs)


def test_intensidad_fuera_de_rango_en_relacion_anidada(campana: Campana, client: TestClient) -> None:
    for valor, msg in ((5, "menor o igual que 3"), (-4, "mayor o igual que -3")):
        r = client.post(E, json={"clases": ["rpg:PlayerCharacter"], "valores": {
            "rdfs:label": ["Y"],
            "rpg:hasRelationship": [{"valores": {"rpg:target": [campana.ernesto],
                                                 "rpg:relationshipType": ["rpg:rel-ally"],
                                                 "rpg:strength": [valor]}}]}})
        errs = _errores(r)
        fuerza = next(e for e in errs if e["campo"] == "rpg:strength")
        assert msg in fuerza["mensaje"]
        assert fuerza["valor"] == str(valor)
        assert "/n/" in fuerza["foco"]


def test_dato_de_tipo_incorrecto(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:Session"],
                                         "valores": {"rdfs:label": ["S"], "rpg:sessionNumber": ["abc"]}}))
    assert errs == [{"foco": errs[0]["foco"], "focoId": None, "campo": "rpg:sessionNumber",
                     "mensaje": "Debe ser un número entero", "severidad": "violacion", "valor": "abc"}]


def test_otros_errores_de_valor(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:Session"], "valores": {
        "rdfs:label": ["S"], "rpg:sessionNumber": [1], "rpg:sessionDate": ["31/12/2020"]}}))
    assert errs[0]["campo"] == "rpg:sessionDate" and "Fecha no válida" in errs[0]["mensaje"]
    errs = _errores(client.post(E, json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["S"], "rpg:vitalStatus": ["rpg:vital-zombi"]}}))
    assert errs[0]["campo"] == "rpg:vitalStatus" and errs[0]["mensaje"] == "Valor no permitido"
    errs = _errores(client.post(E, json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["S"], "foaf:depiction": ["no es una iri"]}}))
    assert errs[0]["campo"] == "foaf:depiction" and "IRI" in errs[0]["mensaje"]
    errs = _errores(client.post(E, json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["S"], "rpg:hasRelationship": ["no-es-objeto"]}}))
    assert errs[0]["campo"] == "rpg:hasRelationship"


def test_numero_de_sesion_negativo(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:Session"],
                                         "valores": {"rdfs:label": ["S"], "rpg:sessionNumber": [-1]}}))
    assert errs[0]["campo"] == "rpg:sessionNumber"
    assert "mayor o igual que 0" in errs[0]["mensaje"]


def test_patron_del_ancla_real(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:Place"], "valores": {
        "rdfs:label": ["L"], "rpg:correspondsTo": ["https://example.com/madrid"]}}))
    assert errs[0]["campo"] == "rpg:correspondsTo"
    assert errs[0]["mensaje"] == "Formato no válido"


def test_campo_desconocido_422(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:PlayerCharacter"],
                                         "valores": {"rdfs:label": ["Y"], "rpg:foo": ["x"]}}))
    assert errs[0]["campo"] == "rpg:foo"
    assert errs[0]["mensaje"] == "Campo desconocido para esta clase"
    # un campo de otra clase tampoco vale (rpg:sessionNumber no es de personajes)
    errs = _errores(client.post(E, json={"clases": ["rpg:PlayerCharacter"],
                                         "valores": {"rdfs:label": ["Y"], "rpg:sessionNumber": [1]}}))
    assert errs[0]["campo"] == "rpg:sessionNumber"


def test_campo_desconocido_en_objeto_anidado(campana: Campana, client: TestClient) -> None:
    errs = _errores(client.post(E, json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": ["Y"],
        "rpg:hasRelationship": [{"valores": {"rpg:target": [campana.ernesto], "rpg:relationshipType": ["rpg:rel-ally"],
                                             "rpg:color": ["rojo"]}}]}}))
    assert errs[0]["campo"] == "rpg:hasRelationship.rpg:color"


def test_clase_desconocida_o_no_entidad_400(campana: Campana, client: TestClient) -> None:
    r = client.post(E, json={"clases": ["rpg:NoExiste"], "valores": {"rdfs:label": ["X"]}})
    assert r.status_code == 400
    r = client.post(E, json={"clases": ["rpg:Relationship"], "valores": {"rdfs:label": ["X"]}})
    assert r.status_code == 400
    assert "no es una entidad" in r.json()["detalle"]
    r = client.post(E, json={"clases": ["xx:Algo"], "valores": {"rdfs:label": ["X"]}})
    assert r.status_code == 400
    r = client.post(E, json={"clases": [], "valores": {}})
    assert r.status_code == 422


def test_crear_no_escribe_nada_si_falla(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = len(_canon(kernel))
    client.post(E, json={"clases": ["rpg:PlayerCharacter"],
                         "valores": {"rdfs:label": ["X"], "rpg:locatedIn": ["ernesto"]}})
    assert len(_canon(kernel)) == antes


def test_validar_sin_guardar(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = len(_canon(kernel))
    r = client.post("/campanas/prueba/validar", json={"clases": ["rpg:PlayerCharacter"],
                                                    "valores": {"rdfs:label": ["X"], "rpg:locatedIn": ["ernesto"]}})
    assert r.status_code == 200
    assert r.json()[0]["campo"] == "rpg:locatedIn"
    r = client.post("/campanas/prueba/validar", json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["X"]}})
    assert r.json() == []
    r = client.post("/campanas/prueba/validar", json={"clases": ["rpg:Place"], "valores": {"zz": ["X"]}})
    assert r.json()[0]["mensaje"] == "Campo desconocido para esta clase"
    # validar una edición de una entidad existente
    r = client.post("/campanas/prueba/validar", params={"entidad": "lucia"},
                    json={"clases": ["rpg:PlayerCharacter"], "valores": {"rdfs:label": ["Lucía"]}})
    assert r.json() == []
    assert len(_canon(kernel)) == antes


# ------------------------------------------------------------------ lectura
def test_leer_entidad_inexistente_404(campana: Campana, client: TestClient) -> None:
    assert client.get(f"{E}/no-existe").status_code == 404
    assert client.get("/campanas/otra/entidades/lucia").status_code == 404


def test_entidad_de_vocabulario_solo_lectura(campana: Campana, client: TestClient) -> None:
    """Las entidades del vocabulario de un módulo (aquí un concepto SKOS del núcleo) no son editables."""
    r = client.get(f"{E}/rpg:rel-ally")
    assert r.status_code == 200
    ent = r.json()
    assert ent["editable"] is False
    assert ent["origen"] == "modulo:core"
    assert ent["etiqueta"] == "aliado"
    r = client.put(f"{E}/rpg:rel-ally", json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["x"]}})
    assert r.status_code == 403
    r = client.delete(f"{E}/rpg:rel-ally")
    assert r.status_code == 403
    # una IRI externa tampoco se puede editar ni borrar
    r = client.delete(f"{E}/http://www.wikidata.org/entity/Q2807")
    assert r.status_code in (403, 404)


# ------------------------------------------------------------------ edición
def test_put_sustituye_las_propiedades_del_formulario(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    eid = crear_entidad(client, "prueba", ["rpg:NonPlayerCharacter"], {
        "rdfs:label": ["Inés"], "skos:altLabel": ["La Monja"], "schema:description": ["Novicia"],
        "rpg:locatedIn": [campana.madrid]}, eid="ines")
    iri = kernel.iris.entity("prueba", eid)
    # una tripleta ajena al formulario (p. ej. escrita por una propuesta) debe conservarse
    extra = (ox.NamedNode(iri), ox.NamedNode(str(RPG.moduleId)), ox.Literal("dato-ajeno"))
    kernel.store.add_triples(kernel.iris.canon("prueba"), [extra])

    r = client.put(f"{E}/{eid}", json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["Inés de Ulloa"], "rpg:locatedIn": [campana.toledo]}})
    assert r.status_code == 200, r.json()
    assert r.json()["id"] == "ines"
    ent = client.get(f"{E}/{eid}").json()
    assert ent["etiqueta"] == "Inés de Ulloa"
    assert "skos:altLabel" not in ent["valores"]
    assert "schema:description" not in ent["valores"]
    assert ent["valores"]["rpg:locatedIn"][0]["id"] == "toledo"
    assert kernel.store.contains(*extra, kernel.iris.canon("prueba"))


def test_put_sustituye_relaciones_anidadas(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    viejo = [o.value for _, _, o in kernel.store.triples(
        ox.NamedNode(kernel.iris.entity("prueba", "lucia")), ox.NamedNode(str(RPG.hasRelationship)), None,
        kernel.iris.canon("prueba"))]
    assert len(viejo) == 1
    r = client.put(f"{E}/lucia", json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": ["Lucía"], "rpg:hasRelationship": [{"valores": {
            "rpg:target": [campana.faccion], "rpg:relationshipType": ["rpg:rel-ally"], "rpg:strength": [3]}}]}})
    assert r.status_code == 200, r.json()
    # el nodo anidado anterior desaparece por completo
    assert list(kernel.store.triples(ox.NamedNode(viejo[0]), None, None, kernel.iris.canon("prueba"))) == []
    ent = client.get(f"{E}/lucia").json()
    rels = [x for x in ent["relaciones"] if x["cualificada"]]
    assert len(rels) == 1 and rels[0]["otra"]["id"] == "camarilla"
    assert rels[0]["intensidad"] == 3
    assert "rpg:locatedIn" not in ent["valores"]


def test_put_conserva_iri_de_nodo_anidado_indicada(campana: Campana, client: TestClient) -> None:
    ent = client.get(f"{E}/lucia").json()
    nodo = ent["valores"]["rpg:hasRelationship"][0]["valor"]
    r = client.put(f"{E}/lucia", json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": ["Lucía"], "rpg:hasRelationship": [{"iri": nodo, "valores": {
            "rpg:target": [campana.ernesto], "rpg:relationshipType": ["rpg:rel-debt"], "rpg:strength": [-1]}}]}})
    assert r.status_code == 200
    ent = client.get(f"{E}/lucia").json()
    assert ent["valores"]["rpg:hasRelationship"][0]["valor"] == nodo
    assert next(x for x in ent["relaciones"] if x["cualificada"])["intensidad"] == -1


def test_put_invalido_no_cambia_nada(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = sorted(map(str, _canon(kernel)))
    r = client.put(f"{E}/lucia", json={"clases": ["rpg:PlayerCharacter"],
                                       "valores": {"rdfs:label": ["Lucía"], "rpg:locatedIn": [campana.ernesto]}})
    assert r.status_code == 422
    assert sorted(map(str, _canon(kernel))) == antes


def test_put_inexistente_404(campana: Campana, client: TestClient) -> None:
    r = client.put(f"{E}/fantasma", json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["x"]}})
    assert r.status_code == 404


def test_put_puede_cambiar_de_clase(campana: Campana, client: TestClient) -> None:
    r = client.put(f"{E}/ernesto", json={"clases": ["rpg:PlayerCharacter"], "valores": {"rdfs:label": ["Ernesto"]}})
    assert r.status_code == 200
    ent = client.get(f"{E}/ernesto").json()
    assert [c["clave"] for c in ent["clases"]] == ["rpg:PlayerCharacter"]


# ------------------------------------------------------------------ borrado
def test_borrar_elimina_referencias_entrantes(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    r = client.delete(f"{E}/madrid")
    assert r.status_code == 200
    assert "/change/" in r.json()["cambio"]
    assert client.get(f"{E}/madrid").status_code == 404
    lucia = client.get(f"{E}/lucia").json()
    assert "rpg:locatedIn" not in lucia["valores"]
    madrid_iri = kernel.iris.entity("prueba", "madrid")
    canon = kernel.iris.canon("prueba")
    assert list(kernel.store.triples(None, None, ox.NamedNode(madrid_iri), canon)) == []
    assert list(kernel.store.triples(ox.NamedNode(madrid_iri), None, None, canon)) == []


def test_borrar_elimina_relaciones_cualificadas_que_apuntaban(campana: Campana, client: TestClient,
                                                              kernel: Kernel) -> None:
    canon = kernel.iris.canon("prueba")
    lucia = ox.NamedNode(kernel.iris.entity("prueba", "lucia"))
    nodo = next(kernel.store.triples(lucia, ox.NamedNode(str(RPG.hasRelationship)), None, canon))[2]
    assert client.delete(f"{E}/ernesto").status_code == 200
    assert list(kernel.store.triples(nodo, None, None, canon)) == []  # type: ignore[arg-type]
    assert list(kernel.store.triples(lucia, ox.NamedNode(str(RPG.hasRelationship)), None, canon)) == []
    ent = client.get(f"{E}/lucia").json()
    assert not [x for x in ent["relaciones"] if x["cualificada"]]
    # el atajo derivado también desaparece
    derivado = kernel.iris.derived("prueba")
    assert list(kernel.store.triples(lucia, ox.NamedNode(str(RPG.relatedTo)), None, derivado)) == []
    # la ficha resultante sigue siendo válida
    from loregraph.seed import validate_campaign

    assert validate_campaign(kernel, kernel.campaign("prueba")) == []


def test_borrar_entidad_con_relaciones_propias(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    canon = kernel.iris.canon("prueba")
    assert client.delete(f"{E}/lucia").status_code == 200
    restos = [t for t in kernel.store.graph_triples(canon)
              if "/entity/lucia" in str(t[0]) or "/entity/lucia" in str(t[2])]
    assert restos == []


def test_borrar_inexistente_404(campana: Campana, client: TestClient) -> None:
    assert client.delete(f"{E}/fantasma").status_code == 404


# ------------------------------------------------------------------ listado
def test_listado_por_defecto_ordenado_por_nombre(campana: Campana, client: TestClient) -> None:
    lista = client.get(E).json()
    etiquetas = [e["etiqueta"] for e in lista["elementos"]]
    assert lista["pagina"] == {"total": 9, "limite": 50, "desplazamiento": 0}
    assert etiquetas == sorted(etiquetas, key=str.lower)
    assert "Lucía" in etiquetas and "Sesión 1" in etiquetas


def test_listado_por_clase_incluye_subclases(campana: Campana, client: TestClient) -> None:
    ids = {e["id"] for e in client.get(E, params={"clase": "rpg:Character"}).json()["elementos"]}
    assert ids == {"lucia", "ernesto"}
    ids = {e["id"] for e in client.get(E, params={"clase": "rpg:Place"}).json()["elementos"]}
    assert ids == {"madrid", "toledo"}


def test_listado_busqueda_insensible_a_acentos(campana: Campana, client: TestClient) -> None:
    lista = client.get(E, params={"q": "lucia"}).json()
    assert [e["etiqueta"] for e in lista["elementos"]] == ["Lucía"]
    lista = client.get(E, params={"q": "SESIÓN", "orden": "relevancia"}).json()
    assert lista["pagina"]["total"] == 3
    assert client.get(E, params={"q": "zzzz"}).json()["pagina"]["total"] == 0


def test_listado_orden_reciente(campana: Campana, client: TestClient) -> None:
    elementos = client.get(E, params={"orden": "reciente"}).json()["elementos"]
    assert elementos[0]["id"] == "lucia"
    assert elementos[0]["modificada"] is not None
    client.put(f"{E}/toledo", json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["Toledo la Vieja"]}})
    elementos = client.get(E, params={"orden": "reciente"}).json()["elementos"]
    assert elementos[0]["id"] == "toledo"


def test_listado_paginado(campana: Campana, client: TestClient) -> None:
    todos = [e["id"] for e in client.get(E).json()["elementos"]]
    p = client.get(E, params={"limite": 2, "desplazamiento": 2}).json()
    assert p["pagina"] == {"total": 9, "limite": 2, "desplazamiento": 2}
    assert [e["id"] for e in p["elementos"]] == todos[2:4]
    assert client.get(E, params={"limite": 0}).status_code == 422
    assert client.get(E, params={"desplazamiento": 100}).json()["elementos"] == []


def test_listado_con_filtro_de_propiedad(campana: Campana, client: TestClient) -> None:
    lista = client.get(E, params={"filtro": "rpg:memberOf=primogenitura"}).json()
    assert [e["id"] for e in lista["elementos"]] == ["ernesto"]
    lista = client.get(E, params=[("filtro", "rpg:memberOf=camarilla")]).json()
    assert [e["id"] for e in lista["elementos"]] == ["primogenitura"]
    lista = client.get(E, params=[("filtro", "rpg:locatedIn=madrid"), ("clase", "rpg:Character")]).json()
    assert [e["id"] for e in lista["elementos"]] == ["lucia"]
    assert client.get(E, params={"filtro": "sin-igual"}).status_code == 400
    assert client.get(E, params={"filtro": "zz:x=madrid"}).status_code == 400


def test_listado_incluye_descripcion(campana: Campana, client: TestClient) -> None:
    lista = client.get(E, params={"clase": "rpg:NonPlayerCharacter"}).json()
    assert lista["elementos"][0]["descripcion"] == "Prestamista de la corte"
    assert lista["elementos"][0]["editable"] is True
