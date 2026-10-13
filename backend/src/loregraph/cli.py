"""Línea de órdenes: ``loregraph seed``, ``openapi``, ``reindex``, ``agente`` y ``mcp-stdio``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from loregraph.config import REPO_ROOT, get_settings


def _kernel():  # type: ignore[no-untyped-def]
    from loregraph.services.kernel import Kernel

    try:
        return Kernel(get_settings())
    except OSError as exc:
        sys.exit(
            f"No se pudo abrir el almacén ({exc}).\n"
            "Si el backend está arrancado, detenlo primero: el almacén solo admite un proceso a la vez."
        )


def cmd_openapi(args: argparse.Namespace) -> None:
    from loregraph.main import create_app
    from loregraph.services.kernel import Kernel

    app = create_app(get_settings(), Kernel(get_settings(), in_memory=True), with_mcp=False)
    spec = app.openapi()
    text = json.dumps(spec, ensure_ascii=False, indent=2)
    if args.salida:
        Path(args.salida).write_text(text + "\n", encoding="utf-8")
        print(f"OpenAPI escrito en {args.salida}")
    else:
        sys.stdout.write(text)


def cmd_seed(args: argparse.Namespace) -> None:
    from loregraph.seed import seed_examples

    k = _kernel()
    try:
        done = seed_examples(k, only=args.campana, replace=not args.conservar)
        for cid, n in done:
            print(f"Campaña '{cid}': {n} tripletas cargadas")
        if not done:
            print("No se encontraron campañas de ejemplo en los módulos.")
    finally:
        k.close()


def cmd_reindex(_: argparse.Namespace) -> None:
    k = _kernel()
    try:
        k.campaigns.rebuild_indexes()
        print("Índices reconstruidos.")
    finally:
        k.close()


def cmd_agente(args: argparse.Namespace) -> None:
    from loregraph.agents.assistant import run_agent

    k = _kernel()
    try:
        camp = k.campaign(args.campana)
        res = run_agent(k, camp, args.peticion)
        print(res.respuesta)
        if res.propuestas:
            print("\nPropuestas creadas (pendientes de revisión):", ", ".join(res.propuestas))
    finally:
        k.close()


def cmd_mcp_stdio(_: argparse.Namespace) -> None:
    """Servidor MCP por stdio (para clientes sin HTTP). No usar con la API arrancada: el almacén es exclusivo."""
    from loregraph.mcp.server import create_mcp

    k = _kernel()
    k.campaigns.rebuild_indexes()
    create_mcp(k).run("stdio")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="loregraph", description="Gestor de campañas de rol sobre RDF")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("openapi", help="Exporta el esquema OpenAPI")
    p.add_argument("-o", "--salida", default=str(REPO_ROOT / "frontend" / "openapi.json"))
    p.set_defaults(func=cmd_openapi)

    p = sub.add_parser("seed", help="Carga las campañas de ejemplo de los módulos")
    p.add_argument("--campana", help="Solo esta campaña")
    p.add_argument("--conservar", action="store_true", help="No borrar la campaña si ya existe")
    p.set_defaults(func=cmd_seed)

    p = sub.add_parser("reindex", help="Reconstruye reglas derivadas e índice de búsqueda")
    p.set_defaults(func=cmd_reindex)

    p = sub.add_parser("agente", help="Pide algo al asistente local (PydanticAI)")
    p.add_argument("campana")
    p.add_argument("peticion")
    p.set_defaults(func=cmd_agente)

    p = sub.add_parser("mcp-stdio", help="Servidor MCP por stdio")
    p.set_defaults(func=cmd_mcp_stdio)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
