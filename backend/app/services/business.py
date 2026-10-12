import json
from datetime import datetime, timezone
from collections import Counter, defaultdict
from decimal import Decimal
from sqlalchemy.orm import Session
from app.models.models import ExternalRecord, BusinessPlan, Campaign


def business_snapshot(db: Session, tenant_id: int):
    """Aggregate-only facade used by UI and AI; no credentials, phones or email."""
    records = db.query(ExternalRecord).filter_by(tenant_id=tenant_id).all()
    deals, calls, employees, leads = [], [], [], []
    for row in records:
        data = json.loads(row.data_json)
        item = {"provider": row.provider, **data}
        {"deal": deals, "call": calls, "employee": employees, "lead": leads}.get(row.kind, []).append(item)
    won = [row for row in deals if row.get("STAGE_SEMANTIC_ID") == "S" or (row["provider"] == "amocrm" and row.get("status_id") == 142)]
    revenue = defaultdict(Decimal)
    for row in won:
        # No currency conversion or cross-currency addition is inferred.
        currency = row.get("CURRENCY_ID") or "unknown"
        value = Decimal(str(row.get("OPPORTUNITY", row.get("price", 0)) or 0))
        if value.is_finite(): revenue[currency] += value
    stages = Counter(str(row.get("STAGE_ID", row.get("status_id", "unknown"))) for row in deals)
    assigned = Counter(str(row.get("ASSIGNED_BY_ID", row.get("responsible_user_id", "unassigned"))) for row in deals)
    talk_seconds = 0
    answered = 0
    for row in calls:
        try: seconds = max(0, int(row.get("user_talk_time", row.get("billsec", 0)) or 0))
        except (ValueError, TypeError): seconds = 0
        talk_seconds += seconds
        answered += seconds > 0
    return {"crm": {"leads": len(leads), "deals": len(deals), "stages": dict(stages)},
            "sales": {"won": len(won), "revenue_by_currency": {key: float(value) for key, value in revenue.items()},
                      "attribution_confirmed": False},
            "employees": {"count": len(employees), "assigned_deals_by_user_id": dict(assigned)},
            "calls": {"total": len(calls), "answered": answered, "unanswered": len(calls) - answered,
                      "talk_seconds": talk_seconds},
            "source": "tenant_scoped_imports", "records": len(records)}


def plan_snapshot(db, tenant_id, month):
    start = datetime.strptime(month, "%Y-%m").replace(tzinfo=timezone.utc)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    campaigns = db.query(Campaign).filter(Campaign.tenant_id == tenant_id, Campaign.date >= start, Campaign.date < end).all()
    facts = {"spend": float(sum((row.spend for row in campaigns), Decimal(0))),
             "leads": sum(row.leads for row in campaigns), "sales": sum(row.sales for row in campaigns)}
    if len({row.currency or "unknown" for row in campaigns}) > 1: facts["spend"] = None
    rows = db.query(BusinessPlan).filter_by(tenant_id=tenant_id, month=month).all()
    return {"month": month, "basis": "campaign_metrics_without_crm_attribution", "plans": [
        {"metric": row.metric, "target": float(row.target), "fact": facts[row.metric],
         "completion_percent": round(facts[row.metric] / float(row.target) * 100, 1) if row.target and facts[row.metric] is not None else None}
        for row in rows]}
