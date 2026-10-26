import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import current_user, require_roles
from app.core.db import get_db
from app.core.secrets import decrypt_secret, encrypt_secret
from app.models.models import Lead, V5ExternalRecord, V5ProviderConnection
from app.services.bitrix import get_deals, get_funnels, get_stages, get_users, portal_from_webhook, validate_bitrix_webhook

router = APIRouter(prefix="/api/integrations/bitrix", tags=["bitrix"])


class BitrixProbe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    webhook_url: str = Field(min_length=20, max_length=1000)


class BitrixConnect(BitrixProbe):
    funnel_id: int = Field(default=0, ge=0)


def company_id(user) -> int:
    if not user.tenant_id:
        raise HTTPException(409, "Avval Sozlamalarda ish joyini yarating va kompaniya akkaunti bilan kiring")
    return user.tenant_id


def find_connection(db: Session, tenant_id: int):
    return db.query(V5ProviderConnection).filter_by(tenant_id=tenant_id, provider="bitrix").first()


def public_status(row):
    if not row:
        return {"connected": False, "status": "not_connected", "portal": None, "funnel_id": None, "tested_at": None, "last_sync_at": None, "synced_records": 0, "last_error": None}
    config = json.loads(decrypt_secret(row.credentials_encrypted))
    return {"connected": row.status in {"connected", "synced"}, "status": row.status, "portal": portal_from_webhook(config["webhook_url"]), "funnel_id": config.get("funnel_id", 0), "tested_at": row.tested_at, "last_sync_at": row.last_sync_at, "synced_records": row.synced_records, "last_error": row.last_error}


async def probe_funnels(webhook: str):
    try:
        return await get_funnels(validate_bitrix_webhook(webhook))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(400, f"Bitrix bilan ulanish amalga oshmadi: {str(exc)[:120]}") from exc


@router.get("/status")
def status(user=Depends(current_user), db: Session = Depends(get_db)):
    return public_status(find_connection(db, company_id(user)))


@router.post("/probe")
async def probe(data: BitrixProbe, user=Depends(require_roles("tenant_admin"))):
    company_id(user)
    return {"funnels": await probe_funnels(data.webhook_url)}


@router.put("")
async def connect(data: BitrixConnect, user=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    tenant_id = company_id(user)
    funnels = await probe_funnels(data.webhook_url)
    if not any(item["id"] == data.funnel_id for item in funnels):
        raise HTTPException(422, "Tanlangan Bitrix voronkasi topilmadi")
    now = datetime.now(timezone.utc)
    row = find_connection(db, tenant_id)
    encrypted = encrypt_secret(json.dumps({"webhook_url": validate_bitrix_webhook(data.webhook_url), "funnel_id": data.funnel_id}))
    if row:
        row.credentials_encrypted, row.status, row.tested_at, row.last_error = encrypted, "connected", now, None
    else:
        row = V5ProviderConnection(tenant_id=tenant_id, provider="bitrix", credentials_encrypted=encrypted, status="connected", tested_at=now, synced_records=0)
        db.add(row)
    db.commit()
    db.refresh(row)
    return public_status(row)


def parse_time(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else datetime.now(timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def map_status(deal, stage):
    semantic = str(deal.get("stageSemanticId") or (stage or {}).get("SEMANTICS") or "").upper()
    if semantic == "S": return "won"
    if semantic == "F": return "lost"
    return "new" if str((stage or {}).get("SORT", "")) in {"10", "20"} else "contacted"


@router.post("/sync")
async def sync(user=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    tenant_id = company_id(user)
    row = find_connection(db, tenant_id)
    if not row:
        raise HTTPException(409, "Bitrix hali ulanmagan")
    config = json.loads(decrypt_secret(row.credentials_encrypted))
    webhook, funnel_id = config["webhook_url"], int(config.get("funnel_id", 0))
    row.operation_started_at, row.status, row.last_error = datetime.now(timezone.utc), "syncing", None
    db.commit()
    try:
        funnels = await get_funnels(webhook)
        funnel_name = next((item["name"] for item in funnels if item["id"] == funnel_id), f"Bitrix voronka {funnel_id}")
        stages, users, deals = await get_stages(webhook, funnel_id), await get_users(webhook), await get_deals(webhook, funnel_id)
        now = datetime.now(timezone.utc)
        for deal in deals:
            external_id = str(deal.get("id"))
            raw = db.query(V5ExternalRecord).filter_by(tenant_id=tenant_id, provider="bitrix", kind="deal", external_id=external_id).first()
            payload = json.dumps(deal, ensure_ascii=False)
            if raw: raw.data_json, raw.updated_at = payload, now
            else: db.add(V5ExternalRecord(tenant_id=tenant_id, provider="bitrix", kind="deal", external_id=external_id, data_json=payload, updated_at=now))
            lead = db.query(Lead).filter_by(tenant_id=tenant_id, crm="bitrix", external_id=external_id).first()
            if not lead:
                lead = Lead(tenant_id=tenant_id, crm="bitrix", external_id=external_id, name="", phone=f"bitrix:{external_id}")
                db.add(lead)
            try: amount = Decimal(str(deal.get("opportunity") or 0))
            except InvalidOperation: amount = Decimal("0")
            lead.name = str(deal.get("title") or f"Bitrix bitim #{external_id}")[:180]
            lead.source, lead.campaign_name = str(deal.get("sourceId") or "Bitrix24")[:80], funnel_name[:255]
            lead.status = map_status(deal, stages.get(str(deal.get("stageId"))))
            lead.amount, lead.currency = amount, str(deal.get("currencyId") or "")[:3] or None
            lead.assigned_to, lead.created_at = users.get(str(deal.get("assignedById"))), parse_time(deal.get("createdTime"))
        row.status, row.last_sync_at, row.synced_records, row.operation_started_at = "synced", now, len(deals), None
        db.commit()
        return {"success": True, "synced_records": len(deals), "last_sync_at": now}
    except (httpx.HTTPError, RuntimeError, ValueError, IntegrityError) as exc:
        db.rollback()
        row = find_connection(db, tenant_id)
        row.status, row.last_error, row.operation_started_at = "error", str(exc)[:180], None
        db.commit()
        raise HTTPException(502, f"Bitrix sinxronlash xatosi: {str(exc)[:120]}") from exc
