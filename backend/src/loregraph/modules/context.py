"""Contexto para modelos de lenguaje que declara cada módulo (`context.yaml`).

Los modelos pequeños no tienen por qué conocer la ambientación ni las reglas de
un sistema de juego. Cada módulo puede describir, con sus propias palabras:

* ``resumen``: la ambientación y el tono general del juego.
* ``glosario``: términos propios y su significado.
* ``estadisticas``: qué significa cada estadística y cómo leer su escala. Los
  rangos y valores permitidos se obtienen automáticamente de las formas SHACL;
  aquí solo se añade la explicación.
* ``reglas``: mecánicas clave resumidas (sin copiar texto de manuales).
* ``tono`` y ``evitar``: guía de estilo y errores típicos que hay que evitar.

Los textos admiten un idioma (cadena) o varios (``{es: …, en: …}``).
"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from loregraph.apimodel import ApiModel

Texto = str | dict[str, str]


def pick(texto: Texto | None, lang: str) -> str:
    """Texto en el idioma pedido (o el primero disponible)."""
    if texto is None:
        return ""
    if isinstance(texto, str):
        return texto
    return texto.get(lang) or texto.get("es") or texto.get("en") or next(iter(texto.values()), "")


class EntradaGlosario(ApiModel):
    termino: str
    definicion: Texto
    clave: str | None = Field(default=None, description="Término de la ontología relacionado (p. ej. 'vtm:hunger').")


class NotaEstadistica(ApiModel):
    clave: str = Field(description="Clave compacta de la propiedad (p. ej. 'vtm:hunger').")
    explicacion: Texto
    escala: Texto | None = Field(default=None, description="Cómo leer los valores (p. ej. '1 = flojo… 5 = legendario').")


class ContextoModulo(ApiModel):
    """Contenido de `context.yaml`."""

    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    resumen: Texto = ""
    glosario: list[EntradaGlosario] = Field(default_factory=list)
    estadisticas: list[NotaEstadistica] = Field(default_factory=list)
    reglas: list[Texto] = Field(default_factory=list)
    tono: Texto | None = None
    evitar: list[Texto] = Field(default_factory=list)
