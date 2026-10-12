import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import require_roles
from app.core.db import get_db
from app.core.audit import audit
from app.core.rate_limit import limit
from app.models.models import ProviderConnection, ExternalRecord, Campaign, Tenant, SyncJob
from app.services.credentials import encrypt_credentials, decrypt_credentials
from app.services.providers import validate_credentials, test_connection, ProviderError

router = APIRouter(prefix="/api/integrations", tags=["integrations"])
Provider = Literal["bitrix", "meta", "amocrm", "onlinepbx", "openai"]


def company_user(user=Depends(require_roles("tenant_admin"))):
    if not user.tenant_id:
        raise HTTPException(403, "Sign in to a company account to configure integrations")
    return user


def scoped_connection(db, user, provider):
    row = db.query(ProviderConnection).filter_by(tenant_id=user.tenant_id, provider=provider).first()
    if not row: raise HTTPException(404, "Provider is not configured for this company")
    return row


def public_status(row):
    return {"provider": row.provider, "status": row.status, "tested_at": row.tested_at,
            "last_sync_at": row.last_sync_at, "last_error": row.last_error,
            "synced_records": row.synced_records}


class ConnectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credentials: dict[str, str]


class SyncInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: date
    end: date


@router.get("")
def list_connections(user=Depends(company_user), db: Session = Depends(get_db)):
    return [public_status(row) for row in db.query(ProviderConnection).filter_by(tenant_id=user.tenant_id).all()]


@router.post("/{provider}")
def save_connection(provider: Provider, data: ConnectionInput, request: Request, user=Depends(company_user), db: Session = Depends(get_db)):
    limit(db, request, f"integration-save:{user.tenant_id}", maximum=20)
    try: credentials = validate_credentials(provider, data.credentials)
    except (ValueError, TypeError): raise HTTPException(422, "Provider credentials or official account URL are invalid") from None
    encrypted = encrypt_credentials(user.tenant_id, provider, credentials)
    # Serialize tenant connection mutations, including concurrent first-time saves.
    db.query(Tenant).filter_by(id=user.tenant_id).with_for_update().one()
    row = db.query(ProviderConnection).filter_by(tenant_id=user.tenant_id, provider=provider).first()
    if row and row.status in {"queued", "syncing", "testing"}: raise HTTPException(409, "Provider operation is already in progress")
    if not row:
        row = ProviderConnection(tenant_id=user.tenant_id, provider=provider, credentials_encrypted=encrypted)
        db.add(row)
    else: row.credentials_encrypted = encrypted
    row.status, row.tested_at, row.last_error = "configured", None, None
    audit(db, request, "integration_configured", user, f"provider:{provider}", user.tenant_id)
    try: db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Connection was updated concurrently; retry") from None
    return public_status(row)


def claim(db, row, state):
    # Compare-and-set works across processes; no in-memory lock.
    updated = db.query(ProviderConnection).filter(ProviderConnection.id == row.id,
        ProviderConnection.status.notin_(["queued", "syncing", "testing"])).update({"status": state, "operation_started_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
    if not updated: raise HTTPException(409, "Provider operation is already in progress")
    db.refresh(row)


@router.post("/{provider}/test")
async def check_connection(provider: Provider, request: Request, user=Depends(company_user), db: Session = Depends(get_db)):
    limit(db, request, f"integration-test:{user.tenant_id}", maximum=10)
    row = scoped_connection(db, user, provider)
    credentials = decrypt_credentials(row)
    claim(db, row, "testing")
    try:
        import asyncio
        await asyncio.wait_for(test_connection(provider, credentials), timeout=60)
        row.status, row.tested_at, row.last_error = "connected", datetime.now(timezone.utc), None
    except ProviderError as exc:
        row.status, row.last_error = "error", str(exc)
        db.commit()
        raise HTTPException(502, row.last_error) from None
    except Exception:
        row.status, row.last_error = "error", "Provider operation failed; retry later"
        db.commit()
        raise HTTPException(502, row.last_error) from None
    db.commit()
    return public_status(row)


def finite_decimal(value):
    try: result = Decimal(str(value or 0))
    except (InvalidOperation, ValueError): raise ProviderError("Provider returned invalid numeric data") from None
    if not result.is_finite() or result < 0 or result > Decimal("9999999999999999"):
        raise ProviderError("Provider returned invalid numeric data")
    return result.quantize(Decimal("0.01"))


def upsert_records(db, row, records):
    # Last occurrence wins if overlapping provider pages repeat an external ID.
    unique = {(item["kind"], item["external_id"]): item for item in records}
    for item in unique.values():
        existing = db.query(ExternalRecord).filter_by(tenant_id=row.tenant_id, provider=row.provider,
            kind=item["kind"], external_id=item["external_id"]).first()
        data = item["data"]
        if item["kind"] == "campaign":
            mapped = json.loads(existing.data_json).get("campaign_row_id") if existing else None
            campaign = db.query(Campaign).filter_by(id=mapped, tenant_id=row.tenant_id).first() if mapped else None
            if not campaign:
                campaign = Campaign(tenant_id=row.tenant_id, platform="facebook", name=data.get("campaign_name") or "Unnamed campaign")
                db.add(campaign)
            campaign.external_id = str(data["campaign_id"])
            campaign.name = str(data.get("campaign_name") or "Unnamed campaign")[:255]
            campaign.date = datetime.fromisoformat(data["date_start"]).replace(tzinfo=timezone.utc)
            campaign.spend = finite_decimal(data.get("spend"))
            currency = data.get("account_currency")
            if not isinstance(currency, str) or len(currency) != 3 or not currency.isalpha():
                raise ProviderError("Meta account currency is missing or invalid")
            campaign.currency = currency.upper()
            campaign.impressions = int(finite_decimal(data.get("impressions")))
            campaign.clicks = int(finite_decimal(data.get("clicks")))
            if campaign.impressions > 2147483647 or campaign.clicks > 2147483647:
                raise ProviderError("Provider count exceeds the supported range")
            # Count one canonical lead action, never sum overlapping Meta action types.
            actions = {action["action_type"]: action.get("value", 0) for action in data.get("actions", [])}
            campaign.leads = int(finite_decimal(actions.get("lead", actions.get("onsite_conversion.lead_grouped", 0))))
            # Meta action counts do not establish CRM sales or revenue attribution.
            if campaign.sales is None: campaign.sales = 0
            if campaign.revenue is None: campaign.revenue = 0
            db.flush()
            data = {**data, "campaign_row_id": campaign.id}
        if not existing:
            existing = ExternalRecord(tenant_id=row.tenant_id, provider=row.provider, kind=item["kind"], external_id=item["external_id"], data_json="{}")
            db.add(existing)
        existing.data_json = json.dumps(data, ensure_ascii=False, allow_nan=False)
        existing.updated_at = datetime.now(timezone.utc)
    db.flush()


@router.post("/{provider}/sync", status_code=202)
async def synchronize(provider: Provider, data: SyncInput, request: Request, user=Depends(company_user), db: Session = Depends(get_db)):
    if provider == "openai": raise HTTPException(422, "AI uses analytics tools, not data synchronization")
    if data.start > data.end or (data.end - data.start).days > 30 or data.end > datetime.now(timezone.utc).date():
        raise HTTPException(422, "Choose a past or current period of at most 31 days")
    limit(db, request, f"integration-sync:{user.tenant_id}", maximum=3)
    row = scoped_connection(db, user, provider)
    decrypt_credentials(row)  # Reject unusable server configuration before queueing.
    updated = db.query(ProviderConnection).filter(ProviderConnection.id == row.id,
        ProviderConnection.status.notin_(["queued", "syncing", "testing"])).update(
            {"status": "queued", "last_error": None, "operation_started_at": datetime.now(timezone.utc)}, synchronize_session=False)
    if not updated:
        db.rollback()
        raise HTTPException(409, "Provider operation is already in progress")
    job = SyncJob(connection_id=row.id, tenant_id=user.tenant_id, start_date=data.start, end_date=data.end)
    db.add(job)
    audit(db, request, "integration_sync_queued", user, f"provider:{provider}", user.tenant_id)
    db.commit()
    db.refresh(row)
    return {**public_status(row), "job_id": job.id}
