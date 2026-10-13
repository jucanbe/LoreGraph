"""Esquema de formulario derivado de SHACL (formato propio, documentado en OpenAPI)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from loregraph.apimodel import ApiModel

TipoCampo = Literal[
    "texto",
    "textoLargo",
    "textoMultilingue",
    "entero",
    "decimal",
    "booleano",
    "fecha",
    "fechaHora",
    "iri",
    "referencia",
    "enum",
    "objeto",
]


class Cardinalidad(ApiModel):
    min: int = 0
    max: int | None = Field(default=None, description="None = sin límite.")


class Restricciones(ApiModel):
    minInclusive: float | None = None
    maxInclusive: float | None = None
    minExclusive: float | None = None
    maxExclusive: float | None = None
    minLength: int | None = None
    maxLength: int | None = None
    pattern: str | None = None


class OpcionValor(ApiModel):
    """Valor permitido de un campo ``enum`` (de ``sh:in`` o de un esquema SKOS)."""

    valor: str | int | float | bool
    clave: str | None = Field(default=None, description="Clave compacta si el valor es una IRI.")
    etiqueta: str
    descripcion: str | None = None


class ClaseRef(ApiModel):
    iri: str
    clave: str
    etiqueta: str


class Grupo(ApiModel):
    id: str
    etiqueta: str
    orden: float = 0


class Campo(ApiModel):
    """Un campo del formulario: una forma de propiedad SHACL."""

    id: str = Field(description="Clave compacta de la propiedad (p. ej. 'rpg:locatedIn').")
    ruta: str = Field(description="IRI de la propiedad (sh:path).")
    etiqueta: str
    ayuda: str | None = None
    tipo: TipoCampo
    datatype: str | None = None
    cardinalidad: Cardinalidad = Field(default_factory=Cardinalidad)
    restricciones: Restricciones = Field(default_factory=Restricciones)
    grupo: str | None = None
    orden: float = 0
    modulo: str | None = None
    widget: str | None = Field(default=None, description="Pista de presentación: 'puntos', 'uri'…")
    oculto: bool = False
    valores: list[OpcionValor] | None = None
    clases: list[ClaseRef] | None = Field(default=None, description="Clases admitidas en referencias.")
    clasesCreables: list[ClaseRef] | None = Field(
        default=None,
        description="Clases principales que se pueden crear al vuelo para este campo (subclases de las admitidas).",
    )
    subformulario: Formulario | None = None
    enlaceInverso: str | None = Field(
        default=None, description="Propiedad del nodo anidado que apunta a la entidad propietaria."
    )
    valorPorDefecto: Any = None


class Formulario(ApiModel):
    """Formulario para crear o editar entidades de una o varias clases."""

    clase: str = Field(description="Clave compacta de la clase principal.")
    clases: list[ClaseRef]
    etiqueta: str
    descripcion: str | None = None
    grupos: list[Grupo]
    campos: list[Campo]
    variantes: list[ClaseRef] = Field(
        default_factory=list, description="Clases variante combinables con la principal."
    )


Campo.model_rebuild()
