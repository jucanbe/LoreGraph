"""Conversión entre términos de pyoxigraph, rdflib y JSON."""

from __future__ import annotations

from typing import Any

import pyoxigraph as ox
from rdflib import BNode, Graph, URIRef
from rdflib import Literal as RLiteral
from rdflib.term import Node

XSD = "http://www.w3.org/2001/XMLSchema#"
XSD_STRING = XSD + "string"
RDF_LANGSTRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"

OxTerm = ox.NamedNode | ox.BlankNode | ox.Literal
OxSubject = ox.NamedNode | ox.BlankNode


def nn(iri: str) -> ox.NamedNode:
    return ox.NamedNode(iri)


def lit(value: Any, datatype: str | None = None, lang: str | None = None) -> ox.Literal:
    """Crea un literal de pyoxigraph a partir de un valor Python."""
    if lang:
        return ox.Literal(str(value), language=lang)
    if datatype:
        if isinstance(value, bool):
            value = "true" if value else "false"
        return ox.Literal(str(value), datatype=ox.NamedNode(datatype))
    if isinstance(value, bool):
        return ox.Literal("true" if value else "false", datatype=ox.NamedNode(XSD + "boolean"))
    if isinstance(value, int):
        return ox.Literal(str(value), datatype=ox.NamedNode(XSD + "integer"))
    if isinstance(value, float):
        return ox.Literal(repr(value), datatype=ox.NamedNode(XSD + "decimal"))
    return ox.Literal(str(value))


def literal_python_value(term: ox.Literal) -> Any:
    """Valor Python de un literal (enteros, decimales y booleanos tipados)."""
    dt = term.datatype.value if term.datatype else XSD_STRING
    v = term.value
    try:
        if dt in (XSD + "integer", XSD + "int", XSD + "long", XSD + "short",
                  XSD + "nonNegativeInteger", XSD + "positiveInteger"):
            return int(v)
        if dt in (XSD + "decimal", XSD + "double", XSD + "float"):
            return float(v)
        if dt == XSD + "boolean":
            return v in ("true", "1")
    except ValueError:
        return v
    return v


def to_rdflib(term: OxTerm) -> Node:
    if isinstance(term, ox.NamedNode):
        return URIRef(term.value)
    if isinstance(term, ox.BlankNode):
        return BNode(term.value)
    if isinstance(term, ox.Literal):
        if term.language:
            return RLiteral(term.value, lang=term.language)
        dt = term.datatype.value if term.datatype else None
        if dt in (None, XSD_STRING):
            return RLiteral(term.value)
        return RLiteral(term.value, datatype=URIRef(dt))
    raise TypeError(f"Término no soportado: {term!r}")


def from_rdflib(term: Node) -> OxTerm:
    if isinstance(term, URIRef):
        return ox.NamedNode(str(term))
    if isinstance(term, BNode):
        return ox.BlankNode(str(term))
    if isinstance(term, RLiteral):
        if term.language:
            return ox.Literal(str(term), language=term.language)
        if term.datatype is not None and str(term.datatype) != XSD_STRING:
            return ox.Literal(str(term), datatype=ox.NamedNode(str(term.datatype)))
        return ox.Literal(str(term))
    raise TypeError(f"Término no soportado: {term!r}")


def triples_to_rdflib(triples: list[tuple[OxTerm, OxTerm, OxTerm]], graph: Graph | None = None) -> Graph:
    g = graph if graph is not None else Graph()
    for s, p, o in triples:
        g.add((to_rdflib(s), to_rdflib(p), to_rdflib(o)))  # type: ignore[arg-type]
    return g


def term_key(term: OxTerm) -> str:
    """Clave estable (N-Triples) para comparar o deduplicar términos."""
    return str(term)
