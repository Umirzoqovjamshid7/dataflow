import pytest
from sqlalchemy.exc import IntegrityError
from app.models.models import Tenant, User
from app.core.config import Settings
from app.core.security import hash_password, verify_password

def test_tenant_cannot_read_other_lead(fixture):
    client, _, tokens, ids = fixture
    for role in ("tenant_admin", "sales_manager"):
        assert client.get(f"/api/leads/{ids['other']}?tenant_id={ids['b']}", headers=tokens[role]).status_code == 404
        assert client.get(f"/api/leads/{ids['own']}", headers=tokens[role]).status_code == 200
        rows = client.get(f"/api/leads?tenant_id={ids['b']}", headers=tokens[role]).json()
        assert [row["id"] for row in rows] == [ids["own"]]

@pytest.mark.parametrize("role", ["marketer", "analyst"])
def test_readonly_analytics_roles_cannot_read_pii(fixture, role):
    client, _, tokens, _ = fixture
    assert client.get("/api/leads", headers=tokens[role]).status_code == 403
    assert client.get("/api/analytics/summary", headers=tokens[role]).status_code == 200
    assert client.get("/api/admin/tenants", headers=tokens[role]).status_code == 403

def test_disabled_tenant_revokes_existing_access(fixture):
    client, factory, tokens, ids = fixture
    with factory() as db:
        db.get(Tenant, ids["a"]).active = False
        db.commit()
    assert client.get("/api/leads", headers=tokens["tenant_admin"]).status_code == 403
    assert client.post("/api/auth/login", json={"email": "tenant_admin@example.com", "password": "test-password-123"}).status_code == 403

def test_login_and_bootstrap_removed(fixture):
    client, _, _, _ = fixture
    assert client.post("/api/auth/bootstrap").status_code == 404
    assert client.post("/api/auth/login", json={"email": "tenant_admin@example.com", "password": "wrong"}).status_code == 401
    response = client.post("/api/auth/login", json={"email": "tenant_admin@example.com", "password": "test-password-123"})
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert "password_hash" not in response.text
    assert client.get("/api/leads", headers={"Authorization": "Bearer forged"}).status_code == 401

def test_invalid_tenant_role_rejected_by_database(fixture):
    _, factory, _, _ = fixture
    with factory() as db:
        db.add(User(email="orphan@example.com", full_name="Orphan", role="tenant_admin", tenant_id=None, password_hash="unused"))
        with pytest.raises(IntegrityError):
            db.commit()

def test_public_lead_validation(fixture):
    client, _, _, _ = fixture
    body = {"tenant_slug": "a", "name": "Customer", "phone": "+998901234567"}
    assert client.post("/api/leads/public", json=body).status_code == 200
    assert client.post("/api/leads/public", json={**body, "tenant_id": 2}).status_code == 422
    assert client.post("/api/leads/public", json={**body, "phone": "x"}).status_code == 422

def test_password_hash_and_secret_policy():
    hashed = hash_password("test-password")
    assert hashed.startswith("$argon2")
    assert verify_password("test-password", hashed)
    assert not verify_password("wrong", hashed)
    with pytest.raises(ValueError):
        Settings(JWT_SECRET="change-me")
