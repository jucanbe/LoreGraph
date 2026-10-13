"""Herramientas para agentes, definidas una sola vez.

Se exponen por MCP (agentes externos) y por PydanticAI (agentes internos). Las
salidas son compactas y legibles («Etiqueta (id)») para que funcionen bien con
modelos locales de contexto pequeño.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from loregraph.errors import DomainError, ValidationFailed
from loregraph.models import ConsultaSparql, EntidadPropuesta, PropuestaEntrada, TripletaEntrada, Valor
from loregraph.services.kernel import Kernel

#: Caracteres aproximados por token (para ajustar la salida al contexto del modelo).
CHARS_PER_TOKEN = 3.5


def _ref(label: str, ident: str | None) -> str:
    return f"{label} ({ident})" if ident and ident != label else label


def _valor_txt(v: Valor) -> str:
    if v.tipo == "iri":
        return _ref(v.etiqueta, v.id or v.clave or v.valor)
    if v.tipo == "objeto":
        parts = []
        for c in v.campos or []:
            parts.append(f"{c.etiqueta}: " + ", ".join(_valor_txt(x) for x in c.valores))
        return "{" + "; ".join(parts) + "}"
    return str(v.valor)


class KGTools:
    """Fachada de herramientas sobre el núcleo. Cada método devuelve datos JSON-serializables."""

    def __init__(self, kernel: Kernel, agent_name: str = "agente", lang: str = "es", max_chars: int | None = None) -> None:
        self.k = kernel
        self.agent_name = agent_name
        self.lang = lang
        self.max_chars = max_chars or int(kernel.settings.llm_context_tokens * CHARS_PER_TOKEN * 0.4)

    # ------------------------------------------------------------ utilidades
    def _fit(self, data: Any) -> Any:
        """Recorta listas largas para que la salida quepa en el presupuesto de caracteres."""
        text = json.dumps(data, ensure_ascii=False)
        if len(text) <= self.max_chars:
            return data
        if isinstance(data, dict):
            for key in ("resultados", "filas", "elementos", "relaciones", "propuestas", "creencias"):
                if isinstance(data.get(key), list):
                    items = data[key]
                    data["truncado"] = True  # antes de recortar: la marca también cuenta
                    while items and len(json.dumps(data, ensure_ascii=False)) > self.max_chars:
                        items.pop()
                    return data
        if isinstance(data, list):
            while data and len(json.dumps(data, ensure_ascii=False)) > self.max_chars:
                data.pop()
        return data

    def _error(self, exc: DomainError) -> dict[str, Any]:
        out: dict[str, Any] = {"error": exc.message}
        if isinstance(exc, ValidationFailed):
            out["errores"] = [e.model_dump(exclude_none=True) for e in exc.errors]
        return out

    # -------------------------------------------------------------- lectura
    def listar_campanas(self) -> list[dict[str, Any]]:
        """Lista las campañas: id, nombre, sistema de juego y módulos."""
        return [
            {"id": c.id, "nombre": c.nombre, "sistema": c.sistema, "modulos": c.modulos, "entidades": c.numEntidades}
            for c in self.k.campaigns.list(self.lang)
        ]

    def listar_tipos(self, campana: str) -> dict[str, Any]:
        """Tipos de entidad de la campaña (clave compacta, nombre y número de entidades) y prefijos."""
        try:
            camp = self.k.campaign(campana)
            info = self.k.campaigns.info(camp, self.lang)
        except DomainError as exc:
            return self._error(exc)
        return {
            "tipos": [
                {"clase": t.clase.clave, "nombre": t.clase.etiqueta, "entidades": t.recuento,
                 "variantes": [v.clave for v in t.variantes]}
                for t in info.tipos
            ],
            "prefijos": info.prefijos,
        }

    def esquema_clase(self, campana: str, clase: str, variantes: list[str] | None = None) -> dict[str, Any]:
        """Campos admitidos por una clase (para proponer entidades): clave, tipo, cardinalidad y valores permitidos."""
        try:
            camp = self.k.campaign(campana)
            form = self.k.entities.form(camp, [clase, *(variantes or [])], self.lang)
        except DomainError as exc:
            return self._error(exc)

        def campo(c: Any) -> dict[str, Any]:
            d: dict[str, Any] = {"clave": c.id, "nombre": c.etiqueta, "tipo": c.tipo}
            if c.cardinalidad.min:
                d["obligatorio"] = True
            if c.cardinalidad.max == 1:
                d["unico"] = True
            if c.valores:
                d["valores"] = [v.clave or v.valor for v in c.valores]
            if c.clases:
                d["clases"] = [x.clave for x in c.clases]
            r = c.restricciones
            for k in ("minInclusive", "maxInclusive"):
                if getattr(r, k) is not None:
                    d[k] = getattr(r, k)
            if c.subformulario:
                d["campos"] = [campo(x) for x in c.subformulario.campos if not x.oculto]
            return d

        return {"clase": form.clase, "nombre": form.etiqueta,
                "campos": [campo(c) for c in form.campos if not c.oculto],
                "variantes": [v.clave for v in form.variantes]}

    def buscar_entidades(self, campana: str, texto: str, clase: str | None = None, limite: int = 10) -> dict[str, Any]:
        """Busca entidades por texto (insensible a acentos). Devuelve «Nombre (id)», tipo y descripción breve."""
        try:
            camp = self.k.campaign(campana)
            lista = self.k.entities.list(camp, clase, texto, "relevancia", max(1, min(limite, 50)), 0, self.lang)
        except DomainError as exc:
            return self._error(exc)
        return self._fit({
            "total": lista.pagina.total,
            "resultados": [
                {"entidad": _ref(e.etiqueta, e.id), "tipo": e.tipo.etiqueta if e.tipo else None,
                 "descripcion": (e.descripcion or "")[:160]}
                for e in lista.elementos
            ],
        })

    def describir_entidad(self, campana: str, entidad: str) -> dict[str, Any]:
        """Ficha compacta de una entidad: tipo, propiedades y relaciones (entrantes y salientes)."""
        try:
            camp = self.k.campaign(campana)
            ent = self.k.entities.get(camp, entidad, self.lang)
        except DomainError as exc:
            return self._error(exc)
        props: dict[str, list[str]] = {}
        for key, vals in ent.valores.items():
            if key in ("rdfs:label",):
                continue
            props[key] = [_valor_txt(v) for v in vals]
        rels = []
        for r in ent.relaciones:
            arrow = "→" if r.direccion == "saliente" else "←"
            name = r.tipoRelacion.etiqueta if r.tipoRelacion else r.propiedad.etiqueta
            extra = []
            if r.intensidad is not None:
                extra.append(f"{r.intensidad:+d}")
            if r.desde:
                extra.append(f"desde {r.desde.etiqueta}")
            if r.hasta:
                extra.append(f"hasta {r.hasta.etiqueta}")
            suffix = f" [{', '.join(extra)}]" if extra else ""
            rels.append(f"{arrow} {name}: {_ref(r.otra.etiqueta, r.otra.id)}{suffix}")
        return self._fit({
            "id": ent.id, "nombre": ent.etiqueta,
            "tipo": ent.tipo.clave if ent.tipo else None,
            "clases": [c.clave for c in ent.clases],
            "propiedades": props,
            "relaciones": rels,
        })

    def consultar_sparql(self, campana: str, consulta: str, limite: int = 50) -> dict[str, Any]:
        """Consulta SPARQL de solo lectura sobre la campaña. Los prefijos (rpg:, rdfs:, skos:, módulos…) ya están declarados."""
        try:
            camp = self.k.campaign(campana)
            res = self.k.sparql.run(camp, ConsultaSparql(consulta=consulta, limite=max(1, min(limite, 200))), self.lang)
        except DomainError as exc:
            return self._error(exc)
        if res.tipo == "ask":
            return {"resultado": res.booleano}
        if res.tipo == "construct":
            return self._fit({"filas": [
                f"{_ref(t.sujeto.etiqueta, t.sujeto.id or t.sujeto.clave)} {t.predicado.clave or t.predicado.valor} "
                f"{_ref(t.objeto.etiqueta, t.objeto.id or t.objeto.clave)}" for t in res.tripletas
            ], "truncado": res.truncado})
        rows = [
            {k: (_ref(v.etiqueta, v.id or v.clave) if v.tipo == "iri" else v.valor) for k, v in fila.items()}
            for fila in res.filas
        ]
        return self._fit({"variables": res.variables, "filas": rows, "truncado": res.truncado})

    def consultar_mundo_real(
        self,
        recurso: str | None = None,
        consulta: str | None = None,
        destino: Literal["wikidata", "dbpedia"] = "wikidata",
        campana: str | None = None,
        entidad: str | None = None,
    ) -> dict[str, Any]:
        """Datos reales de Wikidata/DBpedia: describe un recurso (IRI), las anclas de una entidad, o ejecuta
        un SELECT en el endpoint remoto. Los datos reales NUNCA deben afirmarse sobre entidades ficticias."""
        try:
            if entidad and campana:
                camp = self.k.campaign(campana)
                res = self.k.realworld.for_entity(camp, entidad, self.lang)
                return self._fit({"anclas": [a.model_dump(exclude_none=True) for a in res.anclas]})
            if recurso:
                return self.k.realworld.describe(recurso, "rpg:realWorldAnchor", self.lang).model_dump(exclude_none=True)
            if consulta:
                camp = self.k.campaign(campana) if campana else self._any_campaign()
                r = self.k.sparql.run(camp, ConsultaSparql(consulta=consulta, destino=destino, limite=50), self.lang)
                return self._fit({"variables": r.variables,
                                  "filas": [{k: v.valor for k, v in f.items()} for f in r.filas]})
        except DomainError as exc:
            return self._error(exc)
        return {"error": "Indica 'recurso', 'consulta' o 'campana'+'entidad'"}

    def _any_campaign(self):  # type: ignore[no-untyped-def]
        ids = self.k.campaigns.ids()
        if not ids:
            raise DomainError("No hay campañas")
        return self.k.campaign(ids[0])

    def contexto_sistema(self, campana: str, max_caracteres: int | None = None) -> dict[str, Any]:
        """Lore, estadísticas (con rangos y significado), reglas clave, tono y glosario del sistema de juego
        de la campaña. Léelo antes de crear contenido si no conoces el sistema."""
        try:
            camp = self.k.campaign(campana)
            ctx = self.k.llm_context.build(camp, self.lang, max_caracteres)
        except DomainError as exc:
            return self._error(exc)
        return {"texto": ctx.texto, "recortado": ctx.recortado}

    def revisar_coherencia(self, campana: str, entidad: str | None = None) -> dict[str, Any]:
        """Incoherencias del mundo (muertos que reaparecen, objetos con dos dueños, ciclos…), opcionalmente
        solo las de una entidad. Útil antes y después de proponer cambios."""
        try:
            camp = self.k.campaign(campana)
            iri = self.k.entities.resolve(camp, entidad) if entidad else None
            inf = self.k.coherence.check(camp, self.lang, False, iri)
        except DomainError as exc:
            return self._error(exc)
        return self._fit({"errores": inf.errores, "avisos": inf.avisos, "resultados": [
            {"severidad": i.severidad, "titulo": i.titulo, "entidad": _ref(i.entidad.etiqueta, i.entidad.id),
             "detalle": " ".join(i.mensajes)[:240],
             "relacionadas": [_ref(r.etiqueta, r.id) for r in i.relacionadas]}
            for i in inf.incoherencias
        ]})

    def leer_instrucciones(self, campana: str) -> dict[str, Any]:
        """Instrucciones específicas de los módulos de la campaña para agentes (vocabulario y convenciones)."""
        try:
            camp = self.k.campaign(campana)
        except DomainError as exc:
            return self._error(exc)
        return {m.id: m.prompts for m in camp.ctx.modules if m.prompts}

    # ------------------------------------------------------------ propuestas
    def proponer_triples(
        self,
        campana: str,
        peticion: str,
        entidades: list[dict[str, Any]] | None = None,
        anadir: list[dict[str, Any]] | None = None,
        eliminar: list[dict[str, Any]] | None = None,
        turtle: str | None = None,
        resumen: str | None = None,
        destino: str = "canon",
    ) -> dict[str, Any]:
        """Propone cambios. NUNCA escribe en el canon: crea una propuesta pendiente de revisión humana.

        - entidades: [{"ref": "nuevo:1" | id existente, "clases": ["rpg:NonPlayerCharacter"],
                      "valores": {"rdfs:label": ["Nombre"], "rpg:locatedIn": ["id-lugar"]}}]
        - anadir / eliminar: [{"s": id, "p": "rpg:memberOf", "o": id}] (o literal con "literal": true)
        - turtle: tripletas opcionales en Turtle (prefijos ya declarados)
        Si hay errores de validación se devuelven para que los corrijas y lo intentes de nuevo.
        """
        try:
            camp = self.k.campaign(campana)
            entrada = PropuestaEntrada(
                agente=self.agent_name, peticion=peticion, resumen=resumen, destino=destino,
                entidades=[EntidadPropuesta.model_validate(e) for e in entidades or []],
                anadir=[TripletaEntrada.model_validate(t) for t in anadir or []],
                eliminar=[TripletaEntrada.model_validate(t) for t in eliminar or []],
                turtle=turtle,
            )
            res = self.k.proposals.create(camp, entrada, "agente", self.lang)
        except DomainError as exc:
            return self._error(exc)
        except ValueError as exc:  # errores de formato de Pydantic
            return {"error": f"Formato no válido: {exc}"}
        if not res.ok:
            return {"ok": False, "errores": [e.model_dump(exclude_none=True) for e in res.errores],
                    "consejo": "Corrige los errores y vuelve a llamar a proponer_triples."}
        p = res.propuesta
        assert p is not None
        return {"ok": True, "propuesta": p.id, "estado": p.estado, "anadidas": p.numAnadidas,
                "eliminadas": p.numEliminadas, "nota": "Pendiente de revisión humana."}

    def listar_propuestas(self, campana: str, estado: str | None = "pendiente") -> dict[str, Any]:
        """Propuestas de la campaña (por defecto, las pendientes)."""
        try:
            camp = self.k.campaign(campana)
            items = self.k.proposals.list(camp, estado if estado in ("pendiente", "aprobada", "rechazada") else None,
                                          self.lang)
        except DomainError as exc:
            return self._error(exc)
        return self._fit({"propuestas": [
            {"id": p.id, "estado": p.estado, "agente": p.agente, "peticion": p.peticion[:200],
             "anadidas": p.numAnadidas, "eliminadas": p.numEliminadas, "fecha": p.creada}
            for p in items
        ]})


#: Herramientas de solo lectura y de propuesta (las que puede usar cualquier agente).
TOOL_NAMES = [
    "listar_campanas",
    "listar_tipos",
    "esquema_clase",
    "buscar_entidades",
    "describir_entidad",
    "consultar_sparql",
    "consultar_mundo_real",
    "contexto_sistema",
    "revisar_coherencia",
    "leer_instrucciones",
    "proponer_triples",
    "listar_propuestas",
]
