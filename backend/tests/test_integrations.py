from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook

from app.models.models import V5BusinessPlan, V5ProviderConnection
from app.core.secrets import decrypt_secret, encrypt_secret


def test_bitrix_status_is_tenant_scoped_and_secret_is_encrypted(fixture):
    client, factory, tokens, ids = fixture
    secret = '{"webhook_url":"https://example.bitrix24.com/rest/1/secret","funnel_id":0}'
    encrypted = encrypt_secret(secret)
    assert secret not in encrypted
    with factory() as db:
        db.add(V5ProviderConnection(tenant_id=ids["a"], provider="bitrix", credentials_encrypted=encrypted, status="connected", synced_records=3))
        db.commit()
    response = client.get("/api/integrations/bitrix/status", headers=tokens["analyst"])
    assert response.status_code == 200
    assert response.json()["portal"] == "https://example.bitrix24.com"
    assert "secret" not in response.text
    assert decrypt_secret(encrypted) == secret


def test_plan_can_be_saved_by_company_admin(fixture):
    client, factory, tokens, ids = fixture
    response = client.put("/api/plan-fact", json={"month": "2026-10", "sales": 12, "revenue": 45000000}, headers=tokens["tenant_admin"])
    assert response.status_code == 200
    with factory() as db:
        rows = db.query(V5BusinessPlan).filter_by(tenant_id=ids["a"], month="2026-10").all()
        assert {row.metric: row.target for row in rows} == {"sales": Decimal("12.00"), "revenue": Decimal("45000000.00")}
    assert client.put("/api/plan-fact", json={"month": "2026-10", "sales": 1, "revenue": 1}, headers=tokens["analyst"]).status_code == 403


def test_plan_fact_rejects_unbounded_ranges(fixture):
    client, _, tokens, _ = fixture
    response = client.get("/api/plan-fact?from=2020-01-01&to=2026-10-01", headers=tokens["analyst"])
    assert response.status_code == 422


def test_plan_excel_rejects_non_finite_and_over_precise_values(fixture):
    client, _, tokens, _ = fixture
    for invalid in ("NaN", "Infinity", "1.001"):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["month", "project", "sales_plan", "revenue_plan"])
        sheet.append(["2026-10", "Invalid", invalid, 10])
        output = BytesIO()
        workbook.save(output)
        response = client.post(
            "/api/plan-fact/import",
            files={"file": ("plan.xlsx", output.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=tokens["tenant_admin"],
        )
        assert response.status_code == 422


def test_super_admin_must_create_workspace_before_integrating(fixture):
    client, _, tokens, _ = fixture
    response = client.get("/api/integrations/bitrix/status", headers=tokens["super_admin"])
    assert response.status_code == 409


def test_pbx_without_connection_is_explicitly_empty(fixture):
    client, _, tokens, _ = fixture
    response = client.get("/api/pbx?from=2026-10-01&to=2026-10-13", headers=tokens["analyst"])
    assert response.status_code == 200
    assert response.json()["total"] == 0
    assert "ulanmagan" in response.json()["error"]


def test_plan_excel_imports_project_rows(fixture):
    client, factory, tokens, ids = fixture
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["month", "project", "sales_plan", "revenue_plan"])
    sheet.append(["2026-10", "Project A", 10, 25000000])
    sheet.append(["2026-10", "Project B", 15, 40000000])
    output = BytesIO(); workbook.save(output)
    response = client.post("/api/plan-fact/import", files={"file": ("plan.xlsx", output.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=tokens["tenant_admin"])
    assert response.status_code == 200
    assert response.json()["imported"] == 2
    report = client.get("/api/plan-fact?from=2026-10-01&to=2026-10-31", headers=tokens["analyst"]).json()
    assert report["plan"] == 25
    assert report["plan_amount"] == 65000000
    assert {row["name"] for row in report["projects"]} == {"Project A", "Project B"}


def test_database_status_does_not_require_credentials(fixture):
    client, _, tokens, _ = fixture
    for provider in ("postgresql", "mssql"):
        response = client.get(f"/api/integrations/databases/{provider}/status", headers=tokens["analyst"])
        assert response.status_code == 200
        assert response.json()["connected"] is False
