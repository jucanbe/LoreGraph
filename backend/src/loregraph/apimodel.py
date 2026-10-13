"""Modelo base de la API.

En el esquema de serialización (respuestas), los campos con valor por defecto se
marcan como obligatorios: siempre se envían, así que los tipos TypeScript
generados no tienen que tratarlos como opcionales.
"""

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
