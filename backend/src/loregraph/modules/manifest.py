"""Modelo del manifiesto (`manifest.yaml`) de un módulo."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from loregraph.apimodel import ApiModel


class EstiloTipo(ApiModel):
    """Aspecto de los nodos de una clase en la vista de grafo."""

    color: str | None = None
    forma: str | None = Field(
        default=None,
        description="Forma de Cytoscape: ellipse, round-rectangle, diamond, hexagon, triangle, star, tag…",
    )
    icono: str | None = Field(default=None, description="Nombre de icono de lucide (p. ej. 'user').")


class EstiloRelacion(ApiModel):
    """Aspecto de las aristas de una propiedad o tipo de relación."""

    color: str | None = None
    linea: Literal["solid", "dashed", "dotted"] | None = None
    ancho: float | None = None


class ArchivoFuente(ApiModel):
    familia: str
    archivo: str = Field(description="Ruta relativa a la carpeta assets/ del módulo.")
    peso: str = "400"
    estilo: str = "normal"


class Fuentes(ApiModel):
    titulos: str | None = Field(default=None, description="Pila CSS font-family de los títulos.")
    texto: str | None = Field(default=None, description="Pila CSS font-family del texto.")
    archivos: list[ArchivoFuente] = Field(default_factory=list)
    google: list[str] = Field(
        default_factory=list,
        description="Familias de Google Fonts (formato css2, p. ej. 'Cinzel:wght@400;700'); opcional.",
    )


class Tema(ApiModel):
    """Tema visual: variables CSS (tokens de shadcn/ui) para modo claro y oscuro."""

    claro: dict[str, str] = Field(default_factory=dict)
    oscuro: dict[str, str] = Field(default_factory=dict)
    fuentes: Fuentes = Field(default_factory=Fuentes)
    radio: str | None = None


class Manifest(ApiModel):
    """Manifiesto de un módulo de juego o del núcleo."""

    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    nombre: dict[str, str]
    descripcion: dict[str, str] = Field(default_factory=dict)
    version: str
    categoria: Literal["nucleo", "sistema", "extension"] = "sistema"
    iri: str = Field(description="Espacio de nombres de la ontología del módulo.")
    prefijo: str
    licencia: str | None = None
    depende_de: dict[str, str] = Field(
        default_factory=dict, description="Módulo → especificador de versión (p. ej. '>=0.1')."
    )
    ontologia: str = "ontology.ttl"
    formas: str = "shapes.ttl"
    vocabulario: list[str] = Field(default_factory=lambda: ["vocabulary.ttl"])
    contexto: str = Field(default="context.yaml", description="Contexto para modelos de lenguaje (lore, estadísticas…).")
    prefijos: dict[str, str] = Field(default_factory=dict)
    clases_principales: list[str] = Field(default_factory=list)
    estilos_tipos: dict[str, EstiloTipo] = Field(default_factory=dict)
    estilos_relaciones: dict[str, EstiloRelacion] = Field(default_factory=dict)
    tema: Tema | None = None
