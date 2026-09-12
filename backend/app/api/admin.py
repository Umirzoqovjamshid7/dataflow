from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Literal
from app.core.audit import audit
from app.core.security import hash_password
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.models import Tenant, User, Campaign, Lead
from app.schemas.schemas import TenantCreate, CampaignCreate
from app.api.deps import super_admin, require_roles

router = APIRouter(prefix="/api", tags=["admin"])

@router.get("/admin/summary")
def admin_summary(actor=Depends(super_admin), db: Session = Depends(get_db)):
    total = db.query(Tenant).count()
    active = db.query(Tenant).filter(Tenant.active == True).count()
    spend, sales, revenue = db.query(func.coalesce(func.sum(Campaign.spend), 0), func.coalesce(func.sum(Campaign.sales), 0), func.coalesce(func.sum(Campaign.revenue), 0)).one()
    return {"total_clients": total, "active_clients": active, "inactive_clients": total-active, "total_leads": db.query(Lead).count(), "total_ad_spend": spend, "total_sales": sales, "total_revenue": revenue, "metric_source": "legacy_campaign_totals"}

@router.get("/admin/tenants")
def tenants(_: object = Depends(super_admin), db: Session = Depends(get_db)):
    rows = db.query(Tenant).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "active": t.active,
            "users": db.query(User).filter(User.tenant_id == t.id).count(),
            "leads": db.query(Lead).filter(Lead.tenant_id == t.id).count(),
        } for t in rows
    ]

@router.post("/admin/tenants")
def create_tenant(data: TenantCreate, request: Request, actor=Depends(super_admin), db: Session = Depends(get_db)):
    row = Tenant(name=data.name, slug=data.slug)
    db.add(row)
    try:
        db.flush()
        audit(db, request, "client_creation", actor, f"tenant:{row.id}", row.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Company name or slug already exists")
    db.refresh(row)
    return row

class TenantUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    active: bool

@router.patch("/admin/tenants/{tenant_id}")
def update_tenant(tenant_id: int, data: TenantUpdate, request: Request, actor=Depends(super_admin), db: Session = Depends(get_db)):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(404, "Company not found")
    tenant.active = data.active
    audit(db, request, "client_activate" if data.active else "client_disable", actor, f"tenant:{tenant_id}", tenant_id)
    db.commit()
    return {"id": tenant.id, "active": tenant.active}

class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=180)
    password: str = Field(min_length=14, max_length=128)
    role: Literal["tenant_admin", "marketer", "sales_manager", "analyst"]

class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["tenant_admin", "marketer", "sales_manager", "analyst"]
    active: bool

@router.patch("/admin/tenants/{tenant_id}/users/{user_id}")
def update_user(tenant_id: int, user_id: int, data: UserUpdate, request: Request, actor=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    user_company(actor, tenant_id, db)
    # Serialize team mutations for this tenant on PostgreSQL.
    db.query(Tenant).filter(Tenant.id == tenant_id).with_for_update().one()
    user = db.query(User).filter(User.tenant_id == tenant_id, User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == actor.id:
        raise HTTPException(409, "Cannot change your own role or activation")
    if user.role == "tenant_admin" and user.active and (data.role != "tenant_admin" or not data.active):
        admins = db.query(User).filter(User.tenant_id == tenant_id, User.role == "tenant_admin", User.active == True).count()
        if admins <= 1:
            raise HTTPException(409, "Cannot remove the last active company administrator")
    if user.role != data.role:
        audit(db, request, "role_change", actor, f"user:{user.id}", tenant_id)
    if user.active != data.active:
        audit(db, request, "user_activate" if data.active else "user_disable", actor, f"user:{user.id}", tenant_id)
    user.role, user.active = data.role, data.active
    db.commit()
    return {"id": user.id, "role": user.role, "active": user.active}

def user_company(actor, tenant_id, db):
    if actor.role != "super_admin" and actor.tenant_id != tenant_id:
        raise HTTPException(404, "Company not found")
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(404, "Company not found")
    return tenant

@router.get("/admin/tenants/{tenant_id}/users")
def list_users(tenant_id: int, actor=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    user_company(actor, tenant_id, db)
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "active": u.active} for u in db.query(User).filter(User.tenant_id == tenant_id).all()]

@router.post("/admin/tenants/{tenant_id}/users", status_code=201)
def create_user(tenant_id: int, data: UserCreate, request: Request, actor=Depends(require_roles("tenant_admin")), db: Session = Depends(get_db)):
    tenant = user_company(actor, tenant_id, db)
    if not tenant.active:
        raise HTTPException(409, "Company disabled")
    user = User(tenant_id=tenant_id, email=str(data.email).lower(), full_name=data.full_name, role=data.role, password_hash=hash_password(data.password))
    db.add(user)
    try:
        db.flush()
        audit(db, request, "user_creation", actor, f"user:{user.id}", tenant_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already registered")
    return {"id": user.id, "email": user.email, "role": user.role}

@router.post("/admin/campaigns")
def create_campaign(data: CampaignCreate, _: object = Depends(super_admin), db: Session = Depends(get_db)):
    tenant = db.get(Tenant, data.tenant_id)
    if not tenant or not tenant.active:
        raise HTTPException(404, "Active company not found")
    row = Campaign(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/analytics/summary")
def analytics_summary(user=Depends(require_roles("tenant_admin", "marketer", "analyst")), db: Session = Depends(get_db)):
    q = db.query(Campaign)
    lq = db.query(Lead)
    if user.role != "super_admin":
        q = q.filter(Campaign.tenant_id == user.tenant_id)
        lq = lq.filter(Lead.tenant_id == user.tenant_id)

    campaigns = q.all()
    lead_count = lq.count()

    spend = sum(x.spend for x in campaigns)
    impressions = sum(x.impressions for x in campaigns)
    clicks = sum(x.clicks for x in campaigns)
    tracked_leads = sum(x.leads for x in campaigns) or lead_count
    sales = sum(x.sales for x in campaigns)
    revenue = sum(x.revenue for x in campaigns)

    return {
        "spend": round(spend, 2),
        "impressions": impressions,
        "clicks": clicks,
        "leads": tracked_leads,
        "sales": sales,
        "revenue": round(revenue, 2),
        "ctr": round(clicks / impressions * 100, 2) if impressions else 0,
        "cpc": round(spend / clicks, 2) if clicks else 0,
        "cpl": round(spend / tracked_leads, 2) if tracked_leads else 0,
        "roas": round(revenue / spend, 2) if spend else 0,
    }

@router.get("/analytics/campaigns")
def analytics_campaigns(user=Depends(require_roles("tenant_admin", "marketer", "analyst")), db: Session = Depends(get_db)):
    q = db.query(Campaign)
    if user.role != "super_admin":
        q = q.filter(Campaign.tenant_id == user.tenant_id)
    rows = q.order_by(Campaign.date.desc()).limit(200).all()
    result = []
    for x in rows:
        result.append({
            "id": x.id,
            "name": x.name,
            "platform": x.platform,
            "spend": x.spend,
            "impressions": x.impressions,
            "clicks": x.clicks,
            "leads": x.leads,
            "sales": x.sales,
            "revenue": x.revenue,
            "ctr": round(x.clicks / x.impressions * 100, 2) if x.impressions else 0,
            "cpl": round(x.spend / x.leads, 2) if x.leads else 0,
            "roas": round(x.revenue / x.spend, 2) if x.spend else 0,
        })
    return result
