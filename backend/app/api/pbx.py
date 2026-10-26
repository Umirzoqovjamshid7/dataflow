import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from typing import Literal

from app.api.deps import current_user, require_roles
from app.core.db import get_db
from app.core.secrets import decrypt_secret, encrypt_secret
from app.models.models import V5ProviderConnection
from app.services.onlinepbx import authenticate, call_history, validate_domain

router = APIRouter(prefix="/api/pbx", tags=["pbx"])


class PbxConnect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    domain: str = Field(min_length=4, max_length=255)
    auth_key: str = Field(min_length=4, max_length=1000)


def tenant_id(user):
    if not user.tenant_id:
        raise HTTPException(409, "Avval Sozlamalarda ish joyini yarating")
    return user.tenant_id


def connection(db, company_id):
    return db.query(V5ProviderConnection).filter_by(tenant_id=company_id, provider="onlinepbx").first()


def status_body(row):
    if not row:
        return {"connected": False, "domain": None, "tested_at": None, "last_error": None}
    config = json.loads(decrypt_secret(row.credentials_encrypted))
    return {"connected": row.status == "connected", "domain": config["domain"], "tested_at": row.tested_at, "last_error": row.last_error}


@router.get("/status")
def pbx_status(user=Depends(current_user), db: Session = Depends(get_db)):
    return status_body(connection(db, tenant_id(user)))


@router.put("")
async def connect_pbx(data: PbxConnect, user=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    company_id = tenant_id(user)
    domain = validate_domain(data.domain)
    try:
        await authenticate(domain, data.auth_key)
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        raise HTTPException(400, f"OnlinePBX bilan ulanish amalga oshmadi: {str(exc)[:120]}") from exc
    now = datetime.now(timezone.utc)
    row = connection(db, company_id)
    encrypted = encrypt_secret(json.dumps({"domain": domain, "auth_key": data.auth_key}))
    if row:
        row.credentials_encrypted, row.status, row.tested_at, row.last_error = encrypted, "connected", now, None
    else:
        row = V5ProviderConnection(tenant_id=company_id, provider="onlinepbx", credentials_encrypted=encrypted, status="connected", tested_at=now, synced_records=0)
        db.add(row)
    db.commit()
    db.refresh(row)
    return status_body(row)


def integer(row, *keys):
    for key in keys:
        try:
            if row.get(key) not in (None, ""): return int(float(row[key]))
        except (TypeError, ValueError): pass
    return 0


def text(row, *keys):
    for key in keys:
        if row.get(key) not in (None, ""): return str(row[key])
    return ""


def call_date(row):
    value = text(row, "date", "created_at", "start", "calldate")
    if value.isdigit(): return datetime.fromtimestamp(int(value), tz=timezone.utc).date().isoformat()
    try: return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except ValueError: return value[:10] if len(value) >= 10 else "unknown"


@router.get("")
async def pbx_summary(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    direction: Literal["all", "inbound", "outbound"] = "all",
    user=Depends(current_user), db: Session = Depends(get_db),
):
    company_id = tenant_id(user)
    row = connection(db, company_id)
    if not row:
        return {"start": str(from_date) if from_date else None, "end": str(to_date) if to_date else None, "direction": direction, "total": 0, "inbound": 0, "outbound": 0, "answered": 0, "missed": 0, "answer_rate": 0, "talk_seconds": 0, "avg_talk": 0, "daily": [], "employees": [], "causes": [], "error": "OnlinePBX integratsiyasi hali ulanmagan."}
    end = to_date or datetime.now(timezone.utc).date()
    start = from_date or end - timedelta(days=29)
    if start > end or (end - start).days > 366:
        raise HTTPException(422, "Qo‘ng‘iroqlar davri 366 kundan oshmasligi kerak")
    config = json.loads(decrypt_secret(row.credentials_encrypted))
    try:
        calls = await call_history(config["domain"], config["auth_key"], start, end, direction)
        row.last_error = None
        db.commit()
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        row.last_error = str(exc)[:180]
        db.commit()
        raise HTTPException(502, f"OnlinePBX ma’lumotini olib bo‘lmadi: {str(exc)[:120]}") from exc
    daily, employees, causes = defaultdict(lambda: {"total": 0, "answered": 0}), defaultdict(lambda: {"name": "", "extension": "", "total": 0, "inbound": 0, "outbound": 0, "answered": 0, "talk": 0}), Counter()
    inbound = outbound = answered = talk = 0
    for call in calls:
        kind = text(call, "type", "direction").lower()
        if kind == "inbound": inbound += 1
        elif kind == "outbound": outbound += 1
        billsec = integer(call, "billsec", "talk_sec", "talk_duration")
        is_answered = billsec > 0 or text(call, "status", "disposition").lower() in {"answered", "answer", "success"}
        answered += int(is_answered); talk += billsec
        day = call_date(call); daily[day]["total"] += 1; daily[day]["answered"] += int(is_answered)
        extension = text(call, "user", "int_num", "extension", "internal_number", "from_user") or "—"
        employee = employees[extension]; employee["extension"] = extension; employee["name"] = text(call, "user_name", "name", "internal_name") or f"Xodim {extension}"
        employee["total"] += 1; employee["inbound"] += int(kind == "inbound"); employee["outbound"] += int(kind == "outbound"); employee["answered"] += int(is_answered); employee["talk"] += billsec
        cause = text(call, "hangup_cause", "cause", "disposition", "status") or ("Muvaffaqiyatli" if is_answered else "Javobsiz")
        causes[cause] += 1
    total = len(calls)
    return {"start": start, "end": end, "direction": direction, "total": total, "inbound": inbound, "outbound": outbound, "answered": answered, "missed": max(0, total-answered), "answer_rate": round(answered/total*100, 1) if total else 0, "talk_seconds": talk, "avg_talk": round(talk/answered, 1) if answered else 0, "daily": [{"date": day, **values} for day, values in sorted(daily.items())], "employees": list(employees.values()), "causes": [{"label": label, "count": count} for label, count in causes.most_common(10)], "error": ""}
