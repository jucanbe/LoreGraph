"""Servidor MCP: expone el grafo a agentes externos (Claude Code, Claude Desktop, etc.).

Se monta dentro de la aplicación FastAPI (Streamable HTTP en ``/mcp``) porque el
almacén solo admite un proceso escritor. Los agentes nunca escriben en el canon:
``proponer_triples`` crea propuestas que un humano aprueba o rechaza.
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from mcp.server.mcpserver import Context, MCPServer
from mcp.types import ToolAnnotations

from loregraph.services.kernel import Kernel
from loregraph.tools.core import KGTools

INSTRUCTIONS = """\
Gestor de campañas de rol basado en un grafo de conocimiento RDF.
- Empieza con listar_campanas y listar_tipos. Si no conoces el sistema de juego, lee contexto_sistema
  (lore, estadísticas y reglas) y leer_instrucciones (convenciones para proponer datos).
- Para leer: buscar_entidades, describir_entidad, consultar_sparql (solo lectura; prefijos ya declarados).
- Para escribir: proponer_triples. NUNCA escribes en el canon: se crea una propuesta que revisa un humano.
- Antes de proponer entidades nuevas, consulta esquema_clase para conocer los campos válidos.
- consultar_mundo_real trae datos de Wikidata/DBpedia. Los hechos reales nunca se afirman sobre
  entidades ficticias: enlaza con rpg:inspiredBy o rpg:correspondsTo, jamás con owl:sameAs.
"""

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False)


def _client_name(ctx: Context | None) -> str:
    try:
        params = ctx.session.client_params  # type: ignore[union-attr]
        info = getattr(params, "clientInfo", None) or getattr(params, "client_info", None)
        name = getattr(info, "name", None)
        if name:
            return f"mcp:{name}"
    except Exception:  # noqa: BLE001 - sin sesión (p. ej. llamadas directas en tests)
        pass
    return "mcp:agente"


def create_mcp(kernel: Kernel) -> MCPServer:
    mcp = MCPServer(name="loregraph", title="Gestor de campañas de rol (RDF)", instructions=INSTRUCTIONS,
                    version="0.1.0")

    def tools(ctx: Context | None = None) -> KGTools:
        return KGTools(kernel, agent_name=_client_name(ctx))

    async def run(fn: Any, *args: Any, **kwargs: Any) -> Any:
        return await asyncio.to_thread(fn, *args, **kwargs)

    @mcp.tool(annotations=READ_ONLY)
    async def listar_campanas() -> list[dict[str, Any]]:
        """Lista las campañas: id, nombre, sistema de juego y módulos."""
        return await run(tools().listar_campanas)

    @mcp.tool(annotations=READ_ONLY)
    async def listar_tipos(campana: str) -> dict[str, Any]:
        """Tipos de entidad de una campaña (clave compacta, nombre, recuento) y prefijos."""
        return await run(tools().listar_tipos, campana)

    @mcp.tool(annotations=READ_ONLY)
    async def esquema_clase(campana: str, clase: str, variantes: list[str] | None = None) -> dict[str, Any]:
        """Campos válidos de una clase (p. ej. 'rpg:NonPlayerCharacter' con variante 'vtm:Vampire')."""
        return await run(tools().esquema_clase, campana, clase, variantes)

    @mcp.tool(annotations=READ_ONLY)
    async def buscar_entidades(campana: str, texto: str, clase: str | None = None, limite: int = 10) -> dict[str, Any]:
        """Busca entidades por texto (insensible a acentos). Devuelve «Nombre (id)»."""
        return await run(tools().buscar_entidades, campana, texto, clase, limite)

    @mcp.tool(annotations=READ_ONLY)
    async def describir_entidad(campana: str, entidad: str) -> dict[str, Any]:
        """Ficha compacta de una entidad (por id): propiedades y relaciones."""
        return await run(tools().describir_entidad, campana, entidad)

    @mcp.tool(annotations=READ_ONLY)
    async def consultar_sparql(campana: str, consulta: str, limite: int = 50) -> dict[str, Any]:
        """Consulta SPARQL de solo lectura (SELECT/ASK/CONSTRUCT) sobre la campaña, con límite de resultados."""
        return await run(tools().consultar_sparql, campana, consulta, limite)

    @mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True))
    async def consultar_mundo_real(
        recurso: str | None = None,
        consulta: str | None = None,
        destino: Literal["wikidata", "dbpedia"] = "wikidata",
        campana: str | None = None,
        entidad: str | None = None,
    ) -> dict[str, Any]:
        """Datos de Wikidata/DBpedia: describe un recurso, las anclas reales de una entidad o ejecuta un SELECT remoto."""
        return await run(tools().consultar_mundo_real, recurso, consulta, destino, campana, entidad)

    @mcp.tool(annotations=READ_ONLY)
    async def contexto_sistema(campana: str, max_caracteres: int | None = None) -> dict[str, Any]:
        """Lore, estadísticas (rangos y significado), reglas clave, tono y glosario del sistema de juego.
        Léelo antes de crear contenido si no conoces el sistema."""
        return await run(tools().contexto_sistema, campana, max_caracteres)

    @mcp.resource("loregraph://campanas/{campana}/contexto", name="contexto-campana", mime_type="text/markdown",
                  description="Contexto del sistema de juego de una campaña (lore, estadísticas, reglas, glosario).")
    async def recurso_contexto(campana: str) -> str:
        res = await run(tools().contexto_sistema, campana, None)
        return str(res.get("texto") or res.get("error", ""))

    @mcp.tool(annotations=READ_ONLY)
    async def revisar_coherencia(campana: str, entidad: str | None = None) -> dict[str, Any]:
        """Incoherencias del mundo (muertos que reaparecen, objetos con dos dueños, ciclos…)."""
        return await run(tools().revisar_coherencia, campana, entidad)

    @mcp.tool(annotations=READ_ONLY)
    async def leer_instrucciones(campana: str) -> dict[str, Any]:
        """Instrucciones de los módulos de juego de la campaña (vocabulario, convenciones, ejemplos)."""
        return await run(tools().leer_instrucciones, campana)

    @mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False,
                                          openWorldHint=False))
    async def proponer_triples(
        campana: str,
        peticion: str,
        entidades: list[dict[str, Any]] | None = None,
        anadir: list[dict[str, Any]] | None = None,
        eliminar: list[dict[str, Any]] | None = None,
        turtle: str | None = None,
        resumen: str | None = None,
        destino: str = "canon",
        ctx: Context | None = None,
    ) -> dict[str, Any]:
        """Propone cambios al grafo; SOLO escribe en el grafo de propuestas (revisión humana).

        peticion: la petición del usuario que motiva la propuesta (obligatoria).
        entidades: [{"ref": "nuevo:1" o id existente, "clases": ["rpg:NonPlayerCharacter"],
                     "valores": {"rdfs:label": ["Nombre"], "rpg:locatedIn": ["id-lugar"]}}]
        anadir/eliminar: [{"s": "id", "p": "rpg:memberOf", "o": "id"}] o literales con "literal": true.
        destino: "canon" o "conocimiento/<id de personaje>" (creencias o rumores de un personaje).
        """
        return await run(tools(ctx).proponer_triples, campana, peticion, entidades, anadir, eliminar, turtle,
                         resumen, destino)

    @mcp.tool(annotations=READ_ONLY)
    async def listar_propuestas(campana: str, estado: str | None = "pendiente") -> dict[str, Any]:
        """Propuestas de la campaña y su estado (pendiente, aprobada, rechazada)."""
        return await run(tools().listar_propuestas, campana, estado)

    # Prompts de los módulos como prompts MCP
    for mod in kernel.registry.modules.values():
        for name, text in mod.prompts.items():
            _register_prompt(mcp, f"{mod.id}-{name}", text)

    return mcp


def _register_prompt(mcp: MCPServer, name: str, text: str) -> None:
    def prompt() -> str:
        return text

    prompt.__name__ = name.replace("-", "_")
    mcp.prompt(name=name, description=text.splitlines()[0].lstrip("# ") if text else name)(prompt)
