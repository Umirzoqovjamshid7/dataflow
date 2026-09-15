from fastapi import APIRouter, Depends, Header, HTTPException, Request, Query
from datetime import date, datetime, time, timezone
from app.core.rate_limit import limit
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.models import Lead, Tenant
from app.schemas.schemas import LeadCreate
from app.api.deps import require_roles, tenant_query

router = APIRouter(prefix="/api/leads", tags=["leads"])

@router.post("/public")
def create_public_lead(
    data: LeadCreate,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    limit(db, request, "public-lead", maximum=30)
    tenant = db.query(Tenant).filter(Tenant.slug == data.tenant_slug, Tenant.active == True).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if idempotency_key is not None:
        idempotency_key = idempotency_key.strip()
        if not 8 <= len(idempotency_key) <= 128:
            raise HTTPException(422, "Idempotency-Key must be between 8 and 128 characters")
        existing = db.query(Lead).filter(
            Lead.tenant_id == tenant.id,
            Lead.idempotency_key == idempotency_key,
        ).first()
        if existing:
            return {"success": True, "lead_id": existing.id, "duplicate": True}

    lead = Lead(
        tenant_id=tenant.id,
        name=data.name,
        phone=data.phone,
        email=data.email,
        source=data.source,
        campaign_name=data.campaign_name,
        idempotency_key=idempotency_key,
    )
    db.add(lead)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if idempotency_key:
            existing = db.query(Lead).filter(
                Lead.tenant_id == tenant.id,
                Lead.idempotency_key == idempotency_key,
            ).first()
            if existing:
                return {"success": True, "lead_id": existing.id, "duplicate": True}
        raise HTTPException(409, "Lead could not be created")
    db.refresh(lead)
    return {"success": True, "lead_id": lead.id}

@router.get("")
def list_leads(from_date: date | None = Query(default=None, alias="from"), to_date: date | None = Query(default=None, alias="to"), platform: str | None = None, user=Depends(require_roles("tenant_admin", "sales_manager")), db: Session = Depends(get_db)):
    q = tenant_query(db, Lead, user)
    if from_date: q = q.filter(Lead.created_at >= datetime.combine(from_date, time.min, tzinfo=timezone.utc))
    if to_date: q = q.filter(Lead.created_at <= datetime.combine(to_date, time.max, tzinfo=timezone.utc))
    if platform: q = q.filter(Lead.source == platform)
    return q.order_by(Lead.created_at.desc()).limit(500).all()

@router.get("/{lead_id}")
def get_lead(lead_id: int, user=Depends(require_roles("tenant_admin", "sales_manager")), db: Session = Depends(get_db)):
    lead = tenant_query(db, Lead, user).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead
