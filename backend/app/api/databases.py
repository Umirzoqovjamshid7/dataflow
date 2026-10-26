import asyncio
import json
from datetime import datetime, timezone
from ipaddress import ip_address

import psycopg2
import pymssql
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from typing import Literal

from app.api.deps import current_user, require_roles
from app.core.db import get_db
from app.core.secrets import decrypt_secret, encrypt_secret
from app.models.models import V5ProviderConnection

router = APIRouter(prefix="/api/integrations/databases", tags=["database-integrations"])


class DatabaseConnect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    database: str = Field(min_length=1, max_length=180)
    username: str = Field(min_length=1, max_length=180)
    password: str = Field(min_length=1, max_length=1000)
    encrypted: bool = True


def company_id(user):
    if not user.tenant_id:
        raise HTTPException(409, "Avval Sozlamalarda ish joyini yarating")
    return user.tenant_id


def checked_host(host: str) -> str:
    value = host.strip().lower()
    if value in {"localhost", "localhost.localdomain", "0.0.0.0", "::1"}:
        raise ValueError("Mahalliy database manzili taqiqlangan")
    try:
        address = ip_address(value)
    except ValueError:
        address = None
    if address and (address.is_loopback or address.is_link_local or address.is_unspecified):
        raise ValueError("Database manzili taqiqlangan")
    return value


def find_connection(db, tenant_id, provider):
    return db.query(V5ProviderConnection).filter_by(tenant_id=tenant_id, provider=provider).first()


def public_status(row):
    if not row:
        return {"connected": False, "host": None, "database": None, "tested_at": None, "last_error": None}
    config = json.loads(decrypt_secret(row.credentials_encrypted))
    return {"connected": row.status == "connected", "host": config["host"], "database": config["database"], "tested_at": row.tested_at, "last_error": row.last_error}


def test_database(provider: str, config: dict):
    if provider == "postgresql":
        connection = psycopg2.connect(host=config["host"], port=config["port"], dbname=config["database"], user=config["username"], password=config["password"], connect_timeout=8, sslmode="require" if config["encrypted"] else "prefer", application_name="DataFlow connection test")
    else:
        connection = pymssql.connect(server=f'{config["host"]}:{config["port"]}', user=config["username"], password=config["password"], database=config["database"], login_timeout=8, timeout=8, encryption="require" if config["encrypted"] else "request", read_only=True, appname="DataFlow connection test")
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
    finally:
        connection.close()


@router.get("/{provider}/status")
def database_status(provider: Literal["postgresql", "mssql"], user=Depends(current_user), db: Session = Depends(get_db)):
    return public_status(find_connection(db, company_id(user), provider))


@router.put("/{provider}")
async def connect_database(provider: Literal["postgresql", "mssql"], data: DatabaseConnect, user=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    tenant_id = company_id(user)
    config = data.model_dump()
    try:
        config["host"] = checked_host(config["host"])
        await asyncio.wait_for(asyncio.to_thread(test_database, provider, config), timeout=12)
    except Exception as exc:
        raise HTTPException(400, f"Database ulanishi amalga oshmadi: {str(exc)[:140]}") from exc
    row = find_connection(db, tenant_id, provider)
    now = datetime.now(timezone.utc)
    encrypted = encrypt_secret(json.dumps(config))
    if row:
        row.credentials_encrypted, row.status, row.tested_at, row.last_error = encrypted, "connected", now, None
    else:
        row = V5ProviderConnection(tenant_id=tenant_id, provider=provider, credentials_encrypted=encrypted, status="connected", tested_at=now, synced_records=0)
        db.add(row)
    db.commit()
    db.refresh(row)
    return public_status(row)
