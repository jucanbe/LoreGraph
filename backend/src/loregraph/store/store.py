"""Envoltorio sobre el almacén pyoxigraph con operaciones atómicas por grafo."""

from __future__ import annotations

import threading
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

import pyoxigraph as ox

from loregraph.store.terms import OxSubject, OxTerm

Triple = tuple[OxTerm, OxTerm, OxTerm]


class GraphStore:
    """Almacén RDF persistente (o en memoria si ``path`` es None).

    Las escrituras se serializan con un cerrojo y se aplican como una única
    actualización SPARQL, que oxigraph ejecuta de forma transaccional.
    """

    def __init__(self, path: Path | None = None) -> None:
        if path is not None:
            path.mkdir(parents=True, exist_ok=True)
            self.store = ox.Store(str(path))
        else:
            self.store = ox.Store()
        self.write_lock = threading.RLock()

    # ------------------------------------------------------------------ lectura
    def query(
        self,
        sparql: str,
        default_graph: list[str] | None = None,
        named_graphs: list[str] | None = None,
        union: bool = False,
        prefixes: dict[str, str] | None = None,
    ) -> Any:
        kwargs: dict[str, Any] = {}
        if union:
            kwargs["use_default_graph_as_union"] = True
        elif default_graph is not None:
            kwargs["default_graph"] = [ox.NamedNode(g) for g in default_graph] or [ox.DefaultGraph()]
        if named_graphs is not None:
            kwargs["named_graphs"] = [ox.NamedNode(g) for g in named_graphs]
        if prefixes:
            kwargs["prefixes"] = prefixes
        return self.store.query(sparql, **kwargs)

    def select(self, sparql: str, **kwargs: Any) -> list[dict[str, OxTerm]]:
        """Ejecuta un SELECT y devuelve las soluciones como diccionarios."""
        res = self.query(sparql, **kwargs)
        names = [v.value for v in res.variables]
        out: list[dict[str, OxTerm]] = []
        for sol in res:
            row = {}
            for n in names:
                val = sol[n]
                if val is not None:
                    row[n] = val
            out.append(row)
        return out

    def triples(
        self,
        s: OxSubject | None = None,
        p: ox.NamedNode | None = None,
        o: OxTerm | None = None,
        graph: str | None = None,
    ) -> Iterator[Triple]:
        g = ox.NamedNode(graph) if graph else None
        for q in self.store.quads_for_pattern(s, p, o, g):
            yield (q.subject, q.predicate, q.object)

    def graph_triples(self, graph: str) -> list[Triple]:
        return list(self.triples(graph=graph))

    def has_graph(self, graph: str) -> bool:
        return ox.NamedNode(graph) in set(self.store.named_graphs())

    def named_graphs(self) -> list[str]:
        return [g.value for g in self.store.named_graphs() if isinstance(g, ox.NamedNode)]

    def contains(self, s: OxTerm, p: OxTerm, o: OxTerm, graph: str) -> bool:
        return ox.Quad(s, p, o, ox.NamedNode(graph)) in self.store  # type: ignore[arg-type]

    # ---------------------------------------------------------------- escritura
    def apply(self, removes: dict[str, Iterable[Triple]], adds: dict[str, Iterable[Triple]]) -> None:
        """Elimina y añade tripletas (por grafo) en una sola transacción."""
        parts: list[str] = []
        rem = _graph_blocks(removes)
        add = _graph_blocks(adds)
        if rem:
            parts.append(f"DELETE DATA {{ {rem} }}")
        if add:
            parts.append(f"INSERT DATA {{ {add} }}")
        if not parts:
            return
        with self.write_lock:
            self.store.update(" ;\n".join(parts))

    def replace_graph(self, graph: str, triples: Iterable[Triple]) -> None:
        g = ox.NamedNode(graph)
        with self.write_lock:
            if self.has_graph(graph):
                self.store.remove_graph(g)
            self.store.extend(ox.Quad(s, p, o, g) for s, p, o in triples)  # type: ignore[arg-type]

    def add_triples(self, graph: str, triples: Iterable[Triple]) -> None:
        g = ox.NamedNode(graph)
        with self.write_lock:
            self.store.extend(ox.Quad(s, p, o, g) for s, p, o in triples)  # type: ignore[arg-type]

    def drop_graph(self, graph: str) -> None:
        with self.write_lock:
            if self.has_graph(graph):
                self.store.remove_graph(ox.NamedNode(graph))

    def update(self, sparql_update: str) -> None:
        with self.write_lock:
            self.store.update(sparql_update)

    def load_turtle(self, data: str | bytes, graph: str, replace: bool = True) -> None:
        triples = [
            (q.subject, q.predicate, q.object)
            for q in ox.parse(data if isinstance(data, bytes) else data.encode(), format=ox.RdfFormat.TURTLE)
        ]
        if replace:
            self.replace_graph(graph, triples)
        else:
            self.add_triples(graph, triples)

    def close(self) -> None:
        """Libera el almacén (y el bloqueo de RocksDB) para poder reabrirlo en el mismo proceso."""
        import gc

        self.flush()
        self.store = None  # type: ignore[assignment]
        gc.collect()

    def flush(self) -> None:
        try:
            self.store.flush()
        except AttributeError:  # pragma: no cover - versiones sin flush
            pass


def _graph_blocks(by_graph: dict[str, Iterable[Triple]]) -> str:
    blocks = []
    for g, triples in by_graph.items():
        body = " ".join(f"{s} {p} {o} ." for s, p, o in triples)
        if body:
            blocks.append(f"GRAPH <{g}> {{ {body} }}")
    return " ".join(blocks)
