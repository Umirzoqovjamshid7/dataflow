from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from fastapi.middleware.cors import CORSMiddleware
from app.core.db import Base, engine
from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.leads import router as leads_router
from app.api.admin import router as admin_router
from app.api.pbx import router as pbx_router
from app.api.plan_fact import router as plan_fact_router
from app.api.bitrix import router as bitrix_router
from app.api.databases import router as databases_router

app = FastAPI(
    title="LeadFlow SaaS API",
    version="0.1.0",
    docs_url=None if settings.ENVIRONMENT == "production" else "/docs",
    redoc_url=None if settings.ENVIRONMENT == "production" else "/redoc",
    openapi_url=None if settings.ENVIRONMENT == "production" else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(admin_router)
app.include_router(pbx_router)
app.include_router(plan_fact_router)
app.include_router(bitrix_router)
app.include_router(databases_router)

@app.get("/")
def root():
    return {"name": "LeadFlow SaaS", "status": "ok"}

@app.get("/health/ready")
def ready():
    try:
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if revision != "0008":
            return JSONResponse({"status": "migration_required"}, status_code=503)
    except SQLAlchemyError:
        return JSONResponse({"status": "database_unavailable"}, status_code=503)
    return {"status": "ok"}

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
