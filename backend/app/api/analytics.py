from fastapi import APIRouter, Depends, HTTPException, Query
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.models import Campaign, Lead
from app.api.deps import require_roles

router = APIRouter(prefix="/api", tags=["analytics"])

def _bounded_period(from_date: date | None, to_date: date | None):
    today = datetime.now(timezone.utc).date()
    if not from_date and not to_date:
        from_date, to_date = today.replace(day=1), today
    start = from_date or to_date
    end = min(to_date or today, today)
    if start > end:
        raise HTTPException(422, "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas")

    is_current_month = start.day == 1 and start.year == today.year and start.month == today.month and end == today
    is_full_month = start.day == 1 and end.day == monthrange(end.year, end.month)[1] and (start.year, start.month) == (end.year, end.month)
    if is_current_month or is_full_month:
        previous_month_end = start - timedelta(days=1)
        previous_start = previous_month_end.replace(day=1)
        matching_day = min(end.day, monthrange(previous_start.year, previous_start.month)[1])
        previous_end = previous_start.replace(day=matching_day) if is_current_month else previous_month_end
        label = "O'tgan oyning mos davriga nisbatan" if is_current_month else "O'tgan oyga nisbatan"
    else:
        def previous_month(value):
            month_end = value.replace(day=1) - timedelta(days=1)
            return month_end.replace(day=min(value.day, month_end.day))
        previous_start, previous_end = previous_month(start), previous_month(end)
        label = "O'tgan oyning mos davriga nisbatan"
    return start, end, previous_start, previous_end, label

def _apply_campaign_filters(query, user, start=None, end=None, platform=None, campaign=None):
    if user.role != "super_admin":
        query = query.filter(Campaign.tenant_id == user.tenant_id)
    if start:
        query = query.filter(Campaign.date >= datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:
        query = query.filter(Campaign.date <= datetime.combine(end, time.max, tzinfo=timezone.utc))
    if platform:
        query = query.filter(func.lower(Campaign.platform) == platform.lower())
    if campaign:
        selected_query = query.session.query(Campaign).filter(Campaign.id == campaign)
        if user.role != "super_admin": selected_query = selected_query.filter(Campaign.tenant_id == user.tenant_id)
        selected = selected_query.first()
        if selected and selected.external_id:
            query = query.filter(Campaign.tenant_id == selected.tenant_id, Campaign.platform == selected.platform,
                                 Campaign.external_id == selected.external_id)
        else:
            query = query.filter(Campaign.id == campaign)
    return query

def _apply_lead_filters(query, user, start=None, end=None, platform=None, campaign_name=None):
    if user.role != "super_admin":
        query = query.filter(Lead.tenant_id == user.tenant_id)
    if start:
        query = query.filter(Lead.created_at >= datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:
        query = query.filter(Lead.created_at <= datetime.combine(end, time.max, tzinfo=timezone.utc))
    if platform:
        query = query.filter(func.lower(Lead.source) == platform.lower())
    if campaign_name:
        query = query.filter(Lead.campaign_name == campaign_name)
    return query


def kpi_contract(values, previous, daily, end):
    cards = {}
    days = [(end - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    indexed = {row["date"]: row for row in daily}
    for metric in ("spend", "leads", "cpl", "ctr", "sales", "roas"):
        current = float(values[metric]) if values[metric] is not None else None
        old = float(previous[metric]) if previous and previous[metric] is not None else None
        currency_changed = metric in {"spend", "cpl", "roas"} and previous and previous["currency"] != values["currency"]
        change = None if current is None or old is None or currency_changed or (old == 0 and current != 0) else (0 if old == 0 else round((current - old) / abs(old) * 100, 1))
        direction = "flat" if change is None or change == 0 else "up" if change > 0 else "down"
        tone = "neutral" if change is None or change == 0 or metric == "spend" else "positive" if ((change < 0) if metric == "cpl" else (change > 0)) else "negative"
        trend = []
        for day in days:
            row = indexed.get(day, {})
            value = row.get(metric, 0)
            if metric == "roas": value = row.get("revenue", 0) / row["spend"] if row.get("spend") else 0
            trend.append({"date": day, "value": round(float(value), 2) if value is not None else None})
        cards[metric] = {"current": current, "previous": old, "change_percent": change,
                         "previous_currency": previous["currency"] if previous else values["currency"],
                         "direction": direction, "tone": tone, "trend": trend}
    return cards

def _analytics_values(campaigns, lead_query):
    for row in campaigns:
        for field in ("spend", "revenue", "impressions", "clicks", "leads", "sales"):
            try: number = Decimal(str(getattr(row, field) or 0))
            except (InvalidOperation, ValueError): raise HTTPException(503, "Stored campaign metrics need validation") from None
            if not number.is_finite(): raise HTTPException(503, "Stored campaign metrics need validation")
    spend = sum((x.spend for x in campaigns), start=0)
    impressions = sum(x.impressions or 0 for x in campaigns)
    clicks = sum(x.clicks or 0 for x in campaigns)
    campaign_leads = sum(x.leads or 0 for x in campaigns)
    lead_count = lead_query.count()
    tracked_leads = campaign_leads or lead_count
    sales = sum(x.sales or 0 for x in campaigns)
    revenue = sum((x.revenue for x in campaigns), start=0)
    qualified = lead_query.filter(Lead.status.in_(["QUALIFIED", "qualified", "MEETING", "meeting"])).count()
    currencies = {row.currency or "unknown" for row in campaigns}
    mixed = len(currencies) > 1
    return {
        "spend": None if mixed else round(spend, 2),
        "currency": next(iter(currencies)) if len(currencies) == 1 else "mixed" if mixed else "unknown",
        "impressions": impressions,
        "clicks": clicks,
        "leads": tracked_leads,
        "sales": sales,
        "qualified": qualified,
        "revenue": None if mixed else round(revenue, 2),
        "ctr": round(clicks / impressions * 100, 2) if impressions else 0,
        "cpc": None if mixed else round(spend / clicks, 2) if clicks else 0,
        "cpl": None if mixed else round(spend / tracked_leads, 2) if tracked_leads else 0,
        "roas": None if mixed else round(revenue / spend, 2) if spend else 0,
    }

@router.get("/analytics/summary")
def analytics_summary(from_date: date | None = Query(default=None, alias="from"), to_date: date | None = Query(default=None, alias="to"), platform: str | None = None, campaign: int | None = None, user=Depends(require_roles("tenant_admin", "marketer", "analyst")), db: Session = Depends(get_db)):
    period = _bounded_period(from_date, to_date)
    start, end = (period[0], period[1]) if period else (None, None)
    selected_query = db.query(Campaign).filter(Campaign.id == campaign)
    if user.role != "super_admin": selected_query = selected_query.filter(Campaign.tenant_id == user.tenant_id)
    selected_campaign = selected_query.first() if campaign else None
    if campaign and not selected_campaign:
        raise HTTPException(404, "Campaign not found")
    campaign_name = selected_campaign.name if selected_campaign else None
    q = _apply_campaign_filters(db.query(Campaign), user, start, end, platform, campaign)
    lq = _apply_lead_filters(db.query(Lead), user, start, end, platform, campaign_name)
    campaigns = q.all()
    values = _analytics_values(campaigns, lq)
    daily = defaultdict(lambda: {"impressions": 0, "clicks": 0, "leads": 0, "spend": 0, "sales": 0})
    for item in campaigns:
        day = item.date.date().isoformat() if item.date else "unknown"
        daily[day]["impressions"] += item.impressions or 0
        daily[day]["clicks"] += item.clicks or 0
        daily[day]["leads"] += item.leads or 0
        daily[day]["spend"] += float(item.spend or 0)
        daily[day]["sales"] += item.sales or 0
    daily_activity = [
        {
            "date": day,
            **day_values,
            "ctr": round(day_values["clicks"] / day_values["impressions"] * 100, 2) if day_values["impressions"] else 0,
            "cpl": round(day_values["spend"] / day_values["leads"], 2) if day_values["leads"] else 0,
        }
        for day, day_values in sorted(daily.items())
    ]
    if values["currency"] == "mixed":
        for row in daily_activity:
            row["spend"], row["cpl"] = None, None
    previous = None
    comparison_label = "Taqqoslash uchun ma'lumot yo'q"
    if period:
        previous_q = _apply_campaign_filters(db.query(Campaign), user, period[2], period[3], platform, campaign)
        previous_lq = _apply_lead_filters(db.query(Lead), user, period[2], period[3], platform, campaign_name)
        previous = _analytics_values(previous_q.all(), previous_lq)
        comparison_label = period[4]

    trend_end = end or datetime.now(timezone.utc).date()
    # Trends use seven actual daily buckets, separately from the selected range.
    trend_start = trend_end - timedelta(days=6)
    trend_rows = _apply_campaign_filters(db.query(Campaign), user, trend_start, trend_end, platform, campaign).all()
    trend = []
    for i in range(7):
        day = trend_start + timedelta(days=i)
        day_campaigns = [row for row in trend_rows if row.date.date() == day]
        day_leads = _apply_lead_filters(db.query(Lead), user, day, day, platform, campaign_name)
        trend.append({"date": day.isoformat(), **_analytics_values(day_campaigns, day_leads)})
    ranked = {}
    for row in campaigns:
        identity = (row.tenant_id, row.platform, row.external_id or row.id)
        item = ranked.setdefault(identity, {"name": row.name, "platform": row.platform, "leads": 0, "sales": 0})
        item["leads"] += row.leads
        item["sales"] += row.sales
    return {
        **values,
        "top_campaigns": sorted(ranked.values(), key=lambda row: row["leads"], reverse=True)[:10],
        "platforms": [
            {"platform": name, "leads": sum(row.leads for row in campaigns if row.platform == name),
             "sales": sum(row.sales for row in campaigns if row.platform == name)}
            for name in sorted({row.platform for row in campaigns})
        ],
        "lead_source": "campaign_metrics" if any(row.leads for row in campaigns) else "lead_records",
        "funnel_rates": {"clicks": round(values["clicks"] / values["impressions"] * 100, 1) if values["impressions"] else None,
                         "leads": round(values["leads"] / values["clicks"] * 100, 1) if values["clicks"] and any(row.leads for row in campaigns) else None},
        "daily_activity": daily_activity,
        "previous": previous,
        "kpis": kpi_contract(values, previous, trend, trend_end),
        "comparison_label": comparison_label,
        "period": {"from": start, "to": end} if period else None,
        "previous_period": {"from": period[2], "to": period[3]} if period else None,
        "attribution": {"crm_to_campaign": False, "note": "CRM va reklama kampaniyasi orasidagi bog'lanish tasdiqlanmagan"},
    }

@router.get("/analytics/campaigns")
def analytics_campaigns(from_date: date | None = Query(default=None, alias="from"), to_date: date | None = Query(default=None, alias="to"), platform: str | None = None, campaign: int | None = None, offset: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=500), user=Depends(require_roles("tenant_admin", "marketer", "analyst")), db: Session = Depends(get_db)):
    period = _bounded_period(from_date, to_date)
    start, end = (period[0], period[1]) if period else (None, None)
    q = _apply_campaign_filters(db.query(Campaign), user, start, end, platform, campaign)
    rows = q.order_by(Campaign.date.desc(), Campaign.id.desc()).offset(offset).limit(limit).all()
    result = []
    for x in rows:
        result.append({
            "id": x.id,
            "external_id": x.external_id,
            "date": x.date,
            "name": x.name,
            "platform": x.platform,
            "currency": x.currency or "unknown",
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
