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

app = FastAPI(title="LeadFlow SaaS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(admin_router)

@app.get("/")
def root():
    return {"name": "LeadFlow SaaS", "status": "ok"}

@app.get("/health/ready")
def ready():
    try:
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if revision != "0004":
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
    return response
