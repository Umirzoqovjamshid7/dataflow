from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.rate_limit import limit
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.models import Lead, Tenant
from app.schemas.schemas import LeadCreate
from app.api.deps import require_roles, tenant_query

router = APIRouter(prefix="/api/leads", tags=["leads"])

@router.post("/public")
def create_public_lead(data: LeadCreate, request: Request, db: Session = Depends(get_db)):
    limit(db, request, "public-lead", maximum=30)
    tenant = db.query(Tenant).filter(Tenant.slug == data.tenant_slug, Tenant.active == True).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    lead = Lead(
        tenant_id=tenant.id,
        name=data.name,
        phone=data.phone,
        email=data.email,
        source=data.source,
        campaign_name=data.campaign_name,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return {"success": True, "lead_id": lead.id}

@router.get("")
def list_leads(user=Depends(require_roles("tenant_admin", "sales_manager")), db: Session = Depends(get_db)):
    q = tenant_query(db, Lead, user)
    return q.order_by(Lead.created_at.desc()).limit(500).all()

@router.get("/{lead_id}")
def get_lead(lead_id: int, user=Depends(require_roles("tenant_admin", "sales_manager")), db: Session = Depends(get_db)):
    lead = tenant_query(db, Lead, user).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead
