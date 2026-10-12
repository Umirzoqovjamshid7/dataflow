from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from app.api.deps import require_roles
from app.api.integrations import company_user
from app.core.db import get_db
from app.core.audit import audit
from app.models.models import BusinessPlan, Tenant
from app.services.business import business_snapshot, plan_snapshot

router = APIRouter(prefix="/api/business", tags=["business"])


def business_user(user=Depends(require_roles("tenant_admin", "marketer", "analyst"))):
    if not user.tenant_id: raise HTTPException(403, "Company account required")
    return user


def valid_month(month):
    try:
        parsed = datetime.strptime(month, "%Y-%m")
        if parsed.strftime("%Y-%m") != month: raise ValueError()
    except ValueError: raise HTTPException(422, "Month must be YYYY-MM") from None
    return month


@router.get("/summary")
def summary(user=Depends(business_user), db: Session = Depends(get_db)):
    return business_snapshot(db, user.tenant_id)


@router.get("/plans")
def plans(month: str | None = None, user=Depends(business_user), db: Session = Depends(get_db)):
    month = valid_month(month or datetime.now(timezone.utc).strftime("%Y-%m"))
    return plan_snapshot(db, user.tenant_id, month)


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    month: str
    metric: Literal["spend", "leads", "sales"]
    target: Decimal = Field(ge=0, le=Decimal("9999999999999999.99"), max_digits=18, decimal_places=2)


@router.post("/plans")
def save_plan(data: PlanInput, request: Request, user=Depends(company_user), db: Session = Depends(get_db)):
    valid_month(data.month)
    db.query(Tenant).filter_by(id=user.tenant_id).with_for_update().one()
    row = db.query(BusinessPlan).filter_by(tenant_id=user.tenant_id, month=data.month, metric=data.metric).first()
    if not row:
        row = BusinessPlan(tenant_id=user.tenant_id, month=data.month, metric=data.metric, target=data.target)
        db.add(row)
    else: row.target = data.target
    audit(db, request, "business_plan_saved", user, f"plan:{data.month}:{data.metric}", user.tenant_id)
    db.commit()
    return plan_snapshot(db, user.tenant_id, data.month)
