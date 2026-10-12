from datetime import datetime, timezone
from decimal import Decimal

from app.models.models import Campaign, Lead


def test_analytics_comparison_and_daily_metrics(fixture):
    client, factory, tokens, ids = fixture
    with factory() as db:
        db.add_all([
            Campaign(
                tenant_id=ids["a"], platform="facebook", name="Kuzgi kampaniya",
                spend=Decimal("100.00"), impressions=1000, clicks=100, leads=20,
                sales=4, revenue=Decimal("300.00"), date=datetime(2026, 10, 12, tzinfo=timezone.utc),
            ),
            Campaign(
                tenant_id=ids["a"], platform="facebook", name="Oldingi kampaniya",
                spend=Decimal("80.00"), impressions=800, clicks=80, leads=10,
                sales=5, revenue=Decimal("200.00"), date=datetime(2026, 9, 12, tzinfo=timezone.utc),
            ),
            Lead(
                tenant_id=ids["a"], name="Qualified", phone="+998901112233",
                source="facebook", campaign_name="Kuzgi kampaniya", status="QUALIFIED",
                created_at=datetime(2026, 10, 12, tzinfo=timezone.utc),
            ),
        ])
        db.commit()

    response = client.get(
        "/api/analytics/summary?from=2026-10-01&to=2026-10-12&platform=facebook",
        headers=tokens["tenant_admin"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["spend"] == 100
    assert data["ctr"] == 10
    assert data["cpl"] == 5
    assert data["previous"]["spend"] == 80
    assert data["previous"]["leads"] == 10
    assert data["comparison_label"] == "O'tgan oyning mos davriga nisbatan"
    assert data["daily_activity"] == [{
        "date": "2026-10-12", "impressions": 1000, "clicks": 100,
        "leads": 20, "spend": 100.0, "sales": 4, "ctr": 10.0, "cpl": 5.0,
    }]
    assert data["attribution"]["crm_to_campaign"] is False


def test_analytics_rejects_invalid_period(fixture):
    client, _, tokens, _ = fixture
    response = client.get(
        "/api/analytics/summary?from=2026-10-12&to=2026-10-01",
        headers=tokens["tenant_admin"],
    )
    assert response.status_code == 422
