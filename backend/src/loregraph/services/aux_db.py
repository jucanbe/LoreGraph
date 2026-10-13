"""Base de datos auxiliar SQLite: índice de búsqueda (FTS5), metadatos de entidades,
caché de consultas federadas y consultas SPARQL guardadas.

Todo lo que hay aquí es derivable del almacén RDF (salvo las consultas guardadas)
y se puede reconstruir en cualquier momento.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_WORD_RE = re.compile(r"\w+", re.UNICODE)


@dataclass
class SearchHit:
    iri: str
    campana: str
    clases: list[str]
    etiqueta: str
    descripcion: str
    puntuacion: float


class AuxDB:
    def __init__(self, path: Path | None) -> None:
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path) if path else ":memory:", check_same_thread=False)
        self.lock = threading.RLock()
        with self.lock:
            self.conn.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE VIRTUAL TABLE IF NOT EXISTS busqueda USING fts5(
                    iri UNINDEXED, campana UNINDEXED, clases UNINDEXED,
                    etiqueta, alias, descripcion,
                    tokenize = "unicode61 remove_diacritics 2"
                );
                CREATE TABLE IF NOT EXISTS entidad_meta (
                    iri TEXT PRIMARY KEY, campana TEXT NOT NULL,
                    creada REAL, modificada REAL
                );
                CREATE INDEX IF NOT EXISTS entidad_meta_camp ON entidad_meta(campana, modificada);
                CREATE TABLE IF NOT EXISTS cache (
                    clave TEXT PRIMARY KEY, valor TEXT NOT NULL, expira REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS campana_ajustes (
                    campana TEXT PRIMARY KEY, valor TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS incoherencias_ignoradas (
                    campana TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (campana, id)
                );
                CREATE TABLE IF NOT EXISTS ajustes (
                    clave TEXT PRIMARY KEY, valor TEXT NOT NULL, modificado REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS consultas (
                    id TEXT PRIMARY KEY, campana TEXT NOT NULL, titulo TEXT NOT NULL,
                    descripcion TEXT, consulta TEXT NOT NULL, creada REAL NOT NULL
                );
                """
            )

    # ---------------------------------------------------------------- búsqueda
    def index_entity(
        self, iri: str, campana: str, clases: list[str], etiqueta: str, alias: list[str], descripcion: str
    ) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM busqueda WHERE iri = ? AND campana = ?", (iri, campana))
            self.conn.execute(
                "INSERT INTO busqueda (iri, campana, clases, etiqueta, alias, descripcion) VALUES (?,?,?,?,?,?)",
                (iri, campana, " ".join(clases), etiqueta, " ".join(alias), descripcion or ""),
            )
            self.conn.commit()

    def unindex_entity(self, iri: str, campana: str) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM busqueda WHERE iri = ? AND campana = ?", (iri, campana))
            self.conn.execute("DELETE FROM entidad_meta WHERE iri = ?", (iri,))
            self.conn.commit()

    def clear_campaign(self, campana: str) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM busqueda WHERE campana = ?", (campana,))
            self.conn.execute("DELETE FROM entidad_meta WHERE campana = ?", (campana,))
            self.conn.execute("DELETE FROM consultas WHERE campana = ?", (campana,))
            self.conn.execute("DELETE FROM campana_ajustes WHERE campana = ?", (campana,))
            self.conn.execute("DELETE FROM incoherencias_ignoradas WHERE campana = ?", (campana,))
            self.conn.commit()

    def search(self, q: str, campanas: list[str] | None = None, limit: int = 20) -> list[SearchHit]:
        words = _WORD_RE.findall(q)
        if not words:
            return []
        match = " ".join(f'"{w}"*' for w in words)
        sql = (
            "SELECT iri, campana, clases, etiqueta, descripcion, "
            "bm25(busqueda, 0, 0, 0, 10.0, 5.0, 1.0) AS rank FROM busqueda WHERE busqueda MATCH ?"
        )
        params: list[Any] = [match]
        if campanas:
            sql += f" AND campana IN ({','.join('?' * len(campanas))})"
            params.extend(campanas)
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)
        with self.lock:
            rows = self.conn.execute(sql, params).fetchall()
        return [
            SearchHit(iri=r[0], campana=r[1], clases=r[2].split() if r[2] else [], etiqueta=r[3],
                      descripcion=r[4] or "", puntuacion=-float(r[5]))
            for r in rows
        ]

    # ------------------------------------------------------------- metadatos
    def touch(self, iri: str, campana: str, when: float | None = None) -> None:
        now = when or time.time()
        with self.lock:
            self.conn.execute(
                "INSERT INTO entidad_meta (iri, campana, creada, modificada) VALUES (?,?,?,?) "
                "ON CONFLICT(iri) DO UPDATE SET modificada = MAX(COALESCE(modificada, 0), excluded.modificada), "
                "creada = MIN(COALESCE(creada, excluded.creada), excluded.creada)",
                (iri, campana, now, now),
            )
            self.conn.commit()

    def recent(self, campana: str, limit: int = 10) -> list[tuple[str, float]]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT iri, modificada FROM entidad_meta WHERE campana = ? ORDER BY modificada DESC LIMIT ?",
                (campana, limit),
            ).fetchall()
        return [(r[0], r[1]) for r in rows]

    def meta(self, iris: list[str]) -> dict[str, tuple[float | None, float | None]]:
        if not iris:
            return {}
        out: dict[str, tuple[float | None, float | None]] = {}
        with self.lock:
            for i in range(0, len(iris), 500):
                chunk = iris[i:i + 500]
                rows = self.conn.execute(
                    f"SELECT iri, creada, modificada FROM entidad_meta WHERE iri IN ({','.join('?' * len(chunk))})",
                    chunk,
                ).fetchall()
                out.update({r[0]: (r[1], r[2]) for r in rows})
        return out

    # ------------------------------------------------------------------ caché
    def cache_get(self, key: str) -> Any | None:
        with self.lock:
            row = self.conn.execute("SELECT valor, expira FROM cache WHERE clave = ?", (key,)).fetchone()
        if row is None or row[1] < time.time():
            return None
        return json.loads(row[0])

    def cache_set(self, key: str, value: Any, ttl_s: float) -> None:
        with self.lock:
            self.conn.execute(
                "INSERT OR REPLACE INTO cache (clave, valor, expira) VALUES (?,?,?)",
                (key, json.dumps(value, ensure_ascii=False), time.time() + ttl_s),
            )
            self.conn.commit()

    def cache_clear(self) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM cache")
            self.conn.commit()

    # ---------------------------------------------------- ajustes de campaña
    def campaign_settings_get(self, campana: str) -> dict[str, Any] | None:
        with self.lock:
            row = self.conn.execute("SELECT valor FROM campana_ajustes WHERE campana = ?", (campana,)).fetchone()
        return json.loads(row[0]) if row else None

    def campaign_settings_set(self, campana: str, value: dict[str, Any]) -> None:
        with self.lock:
            self.conn.execute("INSERT OR REPLACE INTO campana_ajustes (campana, valor) VALUES (?,?)",
                              (campana, json.dumps(value, ensure_ascii=False)))
            self.conn.commit()

    def ignored_get(self, campana: str) -> set[str]:
        with self.lock:
            rows = self.conn.execute("SELECT id FROM incoherencias_ignoradas WHERE campana = ?", (campana,)).fetchall()
        return {r[0] for r in rows}

    def ignored_set(self, campana: str, ident: str, ignored: bool) -> None:
        with self.lock:
            if ignored:
                self.conn.execute("INSERT OR IGNORE INTO incoherencias_ignoradas (campana, id) VALUES (?,?)",
                                  (campana, ident))
            else:
                self.conn.execute("DELETE FROM incoherencias_ignoradas WHERE campana = ? AND id = ?", (campana, ident))
            self.conn.commit()

    # ---------------------------------------------------------------- ajustes
    def settings_get(self) -> dict[str, Any]:
        with self.lock:
            rows = self.conn.execute("SELECT clave, valor FROM ajustes").fetchall()
        return {r[0]: json.loads(r[1]) for r in rows}

    def settings_set(self, values: dict[str, Any]) -> None:
        with self.lock:
            for k, v in values.items():
                self.conn.execute(
                    "INSERT OR REPLACE INTO ajustes (clave, valor, modificado) VALUES (?,?,?)",
                    (k, json.dumps(v, ensure_ascii=False), time.time()),
                )
            self.conn.commit()

    def settings_delete(self, keys: list[str]) -> None:
        with self.lock:
            for k in keys:
                self.conn.execute("DELETE FROM ajustes WHERE clave = ?", (k,))
            self.conn.commit()

    # ---------------------------------------------------- consultas guardadas
    def save_query(self, campana: str, titulo: str, descripcion: str, consulta: str) -> str:
        qid = uuid.uuid4().hex[:12]
        with self.lock:
            self.conn.execute(
                "INSERT INTO consultas (id, campana, titulo, descripcion, consulta, creada) VALUES (?,?,?,?,?,?)",
                (qid, campana, titulo, descripcion, consulta, time.time()),
            )
            self.conn.commit()
        return qid

    def list_queries(self, campana: str) -> list[dict[str, Any]]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT id, titulo, descripcion, consulta FROM consultas WHERE campana = ? ORDER BY creada",
                (campana,),
            ).fetchall()
        return [{"id": r[0], "titulo": r[1], "descripcion": r[2] or "", "consulta": r[3]} for r in rows]

    def delete_query(self, campana: str, qid: str) -> bool:
        with self.lock:
            cur = self.conn.execute("DELETE FROM consultas WHERE campana = ? AND id = ?", (campana, qid))
            self.conn.commit()
        return cur.rowcount > 0

    def close(self) -> None:
        with self.lock:
            self.conn.close()
