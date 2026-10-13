"""Espacios de nombres RDF usados en todo el backend."""

from __future__ import annotations

from rdflib import Namespace
from rdflib.namespace import OWL, RDF, RDFS, SH, SKOS, XSD

RPG = Namespace("https://loregraph.example.org/ont/core#")
RPGSH = Namespace("https://loregraph.example.org/ont/core/shapes#")
SCHEMA = Namespace("https://schema.org/")
FOAF = Namespace("http://xmlns.com/foaf/0.1/")
PROV = Namespace("http://www.w3.org/ns/prov#")
TIME = Namespace("http://www.w3.org/2006/time#")
DASH = Namespace("http://datashapes.org/dash#")
DCTERMS = Namespace("http://purl.org/dc/terms/")
WD = Namespace("http://www.wikidata.org/entity/")
WDT = Namespace("http://www.wikidata.org/prop/direct/")

__all__ = [
    "BASE_PREFIXES",
    "DASH",
    "DCTERMS",
    "FOAF",
    "OWL",
    "PROV",
    "RDF",
    "RDFS",
    "RPG",
    "RPGSH",
    "SCHEMA",
    "SH",
    "SKOS",
    "TIME",
    "WD",
    "WDT",
    "XSD",
]

#: Prefijos conocidos por el núcleo. Los módulos añaden el suyo.
BASE_PREFIXES: dict[str, str] = {
    "rpg": str(RPG),
    "rpgsh": str(RPGSH),
    "rdf": str(RDF),
    "rdfs": str(RDFS),
    "owl": str(OWL),
    "xsd": str(XSD),
    "skos": str(SKOS),
    "schema": str(SCHEMA),
    "foaf": str(FOAF),
    "prov": str(PROV),
    "time": str(TIME),
    "sh": str(SH),
    "dash": str(DASH),
    "dcterms": str(DCTERMS),
    "wd": str(WD),
    "wdt": str(WDT),
}
