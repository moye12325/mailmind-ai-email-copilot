from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router


app = FastAPI(title="MailMind Backend")
app.include_router(auth_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        return JSONResponse(status_code=exc.status_code, content={"error": detail})
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "INVALID_REQUEST",
                "message": str(detail),
                "retryable": False,
                "details": {},
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "INVALID_REQUEST",
                "message": "Invalid request.",
                "retryable": False,
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "mailmind-backend"}
