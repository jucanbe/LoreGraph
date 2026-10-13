"""Aplicación FastAPI: API REST + servidor MCP en el mismo proceso."""

from __future__ import annotations

import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from loregraph.api import routes_agent, routes_campaigns, routes_general, routes_graph, routes_media, routes_settings
from loregraph.config import Settings, get_settings
from loregraph.errors import DomainError, ValidationFailed
from loregraph.services.kernel import Kernel

log = logging.getLogger("loregraph")

DESCRIPTION = """\
API del gestor de campañas de rol basado en grafos de conocimiento RDF.

* Todo el mundo de la campaña es RDF (pyoxigraph), con grafos con nombre para el canon,
  las propuestas de agentes y el conocimiento de cada personaje.
* Los formularios se generan desde formas SHACL de los módulos activos.
* Los agentes acceden por MCP en `/mcp` y solo pueden **proponer** cambios.
"""


def _operation_id(route: APIRoute) -> str:
    return route.name


def create_app(settings: Settings | None = None, kernel: Kernel | None = None, with_mcp: bool = True) -> FastAPI:
    settings = settings or get_settings()
    own_kernel = kernel is None
    kernel = kernel or Kernel(settings)
    mcp = None
    if with_mcp:
        from loregraph.mcp.server import create_mcp

        mcp = create_mcp(kernel)
        mcp_app = mcp.streamable_http_app(streamable_http_path="/mcp", host=settings.api_host)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        kernel.campaigns.rebuild_indexes()
        if mcp is not None:
            async with mcp.session_manager.run():
                yield
        else:
            yield
        if own_kernel:  # un núcleo inyectado (tests, CLI) lo cierra quien lo creó
            kernel.close()

    app = FastAPI(
        title="LoreGraph — Gestor de campañas de rol",
        version="0.1.0",
        description=DESCRIPTION,
        lifespan=lifespan,
        generate_unique_id_function=_operation_id,
    )
    app.state.kernel = kernel
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ValidationFailed)
    async def _validation(_: Request, exc: ValidationFailed) -> JSONResponse:
        return JSONResponse(status_code=422, content={
            "detalle": exc.message, "errores": [e.model_dump() for e in exc.errors]})

    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detalle": exc.message, "errores": []})

    @app.exception_handler(RequestValidationError)
    async def _req_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errores = [
            {"campo": ".".join(str(x) for x in e.get("loc", [])[1:]) or None, "mensaje": e.get("msg", ""),
             "severidad": "violacion"}
            for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detalle": "Petición no válida", "errores": errores})

    app.include_router(routes_general.router)
    app.include_router(routes_campaigns.router)
    app.include_router(routes_graph.router)
    app.include_router(routes_agent.router)
    app.include_router(routes_settings.router)
    app.include_router(routes_media.router)
    if mcp is not None:
        app.mount("/", mcp_app)
    return app


def run() -> None:
    """Punto de entrada de ``loregraph-api``."""
    import uvicorn

    settings = get_settings()
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("loregraph.main:create_app", factory=True, host=settings.api_host, port=settings.api_port, reload=False)
