#!/usr/bin/env python3
"""Tareas del proyecto, multiplataforma (Linux, macOS, Windows). Solo usa la biblioteca estándar.

Uso:  python tasks.py <tarea>      (o `make <tarea>` si tienes make)

Tareas:
  install   Instala dependencias de backend (uv) y frontend (npm)
  dev       Arranca backend y frontend en paralelo (Ctrl+C para parar ambos)
  backend   Solo el backend (API + MCP)
  frontend  Solo el frontend
  test      Ejecuta todos los tests (pytest + vitest + comprobación de tipos)
  seed      Carga las campañas de ejemplo (para el backend antes: el almacén es exclusivo)
  types     Regenera openapi.json y los tipos TypeScript del cliente
  lint      Ruff (backend) y ESLint/tsc (frontend)
  build     Compila el frontend para producción
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WIN = os.name == "nt"


def load_env() -> dict[str, str]:
    """Lee `.env` (formato CLAVE=valor) sin dependencias externas."""
    env = dict(os.environ)
    path = ROOT / ".env"
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def which(cmd: str) -> str:
    found = shutil.which(cmd)
    if not found:
        hints = {
            "uv": "Instala uv: https://docs.astral.sh/uv/ (Windows: winget install astral-sh.uv)",
            "npm": "Instala Node.js 20+ : https://nodejs.org (Windows: winget install OpenJS.NodeJS.LTS)",
        }
        sys.exit(f"No se encuentra '{cmd}'. {hints.get(cmd, '')}")
    return found


def run(cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    print(f"\n» {' '.join(cmd)}  ({cwd.name})", flush=True)
    result = subprocess.run([which(cmd[0]), *cmd[1:]], cwd=cwd, env=env or load_env())
    if result.returncode != 0:
        sys.exit(result.returncode)


# ------------------------------------------------------------------ tareas
def install() -> None:
    run(["uv", "sync"], BACKEND)
    run(["npm", "install"], FRONTEND)


def backend_cmd(env: dict[str, str], reload: bool = True) -> list[str]:
    host = env.get("LOREGRAPH_API_HOST", "127.0.0.1")
    port = env.get("LOREGRAPH_API_PORT", "8765")
    cmd = ["uv", "run", "uvicorn", "loregraph.main:create_app", "--factory", "--host", host, "--port", port]
    if reload:
        cmd += ["--reload", "--reload-dir", "src", "--reload-dir", "../modules"]
    return cmd


def frontend_cmd() -> list[str]:
    return ["npm", "run", "dev"]


def _pump(proc: subprocess.Popen[bytes], prefix: str) -> None:
    assert proc.stdout is not None
    for raw in iter(proc.stdout.readline, b""):
        line = raw.decode("utf-8", errors="replace").rstrip()
        print(f"{prefix} {line}", flush=True)


def dev() -> None:
    env = load_env()
    env.setdefault("PYTHONUNBUFFERED", "1")
    procs: list[subprocess.Popen[bytes]] = []
    specs = [("\033[35m[api]\033[0m", backend_cmd(env), BACKEND), ("\033[36m[web]\033[0m", frontend_cmd(), FRONTEND)]
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if IS_WIN else 0  # type: ignore[attr-defined]
    for prefix, cmd, cwd in specs:
        p = subprocess.Popen([which(cmd[0]), *cmd[1:]], cwd=cwd, env=env, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, creationflags=flags,
                             start_new_session=not IS_WIN)
        procs.append(p)
        threading.Thread(target=_pump, args=(p, prefix), daemon=True).start()
    port = env.get("LOREGRAPH_FRONTEND_PORT", "5173")
    print(f"\nInterfaz: http://localhost:{port}   API: http://localhost:{env.get('LOREGRAPH_API_PORT', '8765')}/docs"
          f"   MCP: http://localhost:{env.get('LOREGRAPH_API_PORT', '8765')}/mcp\n", flush=True)
    try:
        while all(p.poll() is None for p in procs):
            threading.Event().wait(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                try:
                    if IS_WIN:
                        subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
                    else:
                        os.killpg(p.pid, signal.SIGTERM)
                except OSError:
                    pass


def backend() -> None:
    env = load_env()
    run(backend_cmd(env), BACKEND, env)


def frontend() -> None:
    run(frontend_cmd(), FRONTEND)


def test() -> None:
    run(["uv", "run", "pytest", "-q"], BACKEND)
    run(["npm", "run", "typecheck"], FRONTEND)
    run(["npm", "run", "test", "--", "--run"], FRONTEND)


def seed() -> None:
    run(["uv", "run", "loregraph", "seed"], BACKEND)


def types() -> None:
    run(["uv", "run", "loregraph", "openapi", "-o", str(FRONTEND / "openapi.json")], BACKEND)
    run(["npm", "run", "gen:api"], FRONTEND)


def lint() -> None:
    run(["uv", "run", "ruff", "check", "src", "tests"], BACKEND)
    run(["npm", "run", "lint"], FRONTEND)


def build() -> None:
    run(["npm", "run", "build"], FRONTEND)


TASKS = {f.__name__: f for f in (install, dev, backend, frontend, test, seed, types, lint, build)}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in TASKS:
        print(__doc__)
        sys.exit(1)
    TASKS[sys.argv[1]]()
