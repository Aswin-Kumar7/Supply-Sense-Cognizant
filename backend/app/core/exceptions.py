"""
Centralized exception handling for the API.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from app.core.logging import logger


class SupplySenseException(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(SupplySenseException):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} with id '{resource_id}' not found",
            status_code=404,
        )


class ValidationError(SupplySenseException):
    def __init__(self, message: str):
        super().__init__(message=message, status_code=422)


async def supplysense_exception_handler(
    request: Request, exc: SupplySenseException
) -> JSONResponse:
    logger.error(f"API Error: {exc.message} | Path: {request.url.path}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "path": str(request.url.path)},
    )
