"""Errores de dominio, traducidos a respuestas HTTP por la API."""

from __future__ import annotations

from loregraph.models import ErrorValidacion


class DomainError(Exception):
    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class BadRequest(DomainError):
    status_code = 400


class UnknownPrefix(BadRequest, KeyError):
    """Clave compacta con un prefijo desconocido (400; sigue siendo un KeyError)."""

    def __str__(self) -> str:
        return self.message


class Forbidden(DomainError):
    status_code = 403


class Timeout(DomainError):
    status_code = 504


class UpstreamError(DomainError):
    status_code = 502


class ValidationFailed(DomainError):
    """Los datos no cumplen las formas SHACL o el esquema del formulario."""

    status_code = 422

    def __init__(self, errors: list[ErrorValidacion], message: str = "Los datos no son válidos") -> None:
        super().__init__(message)
        self.errors = errors
