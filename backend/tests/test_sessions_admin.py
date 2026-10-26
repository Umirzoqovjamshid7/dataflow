from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from fastapi import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.db import Base
from app.api.auth import issue_refresh
from app.models.models import AuditLog, RefreshSession

LOGIN = {"email": "tenant_admin@example.com", "password": "test-password-123"}


def test_refresh_cookie_modes_and_absolute_expiry_without_http_client():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine)
    user = SimpleNamespace(id=7, tenant_id=None)
    with factory() as db:
        session_response = Response()
        issue_refresh(db, session_response, user)
        db.commit()
        browser_session = db.query(RefreshSession).one()
        assert browser_session.persistent is False
        assert "Max-Age" not in session_response.headers["set-cookie"]

        fixed_expiry = datetime.now(timezone.utc) + timedelta(hours=24)
        persistent_response = Response()
        issue_refresh(db, persistent_response, user, persistent=True, expires_at=fixed_expiry)
        db.commit()
        remembered = db.query(RefreshSession).filter_by(persistent=True).one()
        stored_expiry = remembered.expires_at.replace(tzinfo=timezone.utc) if remembered.expires_at.tzinfo is None else remembered.expires_at
        assert stored_expiry == fixed_expiry
        assert "Max-Age=86399" in persistent_response.headers["set-cookie"] or "Max-Age=86400" in persistent_response.headers["set-cookie"]
        assert "HttpOnly" in persistent_response.headers["set-cookie"]
        assert "SameSite=strict" in persistent_response.headers["set-cookie"]
    engine.dispose()

def test_refresh_rotation_logout_and_cookie(fixture):
    client, factory, _, _ = fixture
    login = client.post("/api/auth/login", json=LOGIN)
    assert "HttpOnly" in login.headers["set-cookie"]
    old = client.cookies.get("refresh_token")
    assert client.post("/api/auth/refresh").status_code == 200
    new = client.cookies.get("refresh_token")
    assert new != old
    client.cookies.clear()
    client.cookies.set("refresh_token", old, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401
    client.cookies.clear()
    client.cookies.set("refresh_token", new, path="/api/auth")
    assert client.post("/api/auth/logout").status_code == 200
    assert client.post("/api/auth/refresh").status_code == 401
    with factory() as db:
        assert db.query(AuditLog).filter_by(action="login").count() == 1
        assert all(s.token_hash not in (old, new) for s in db.query(RefreshSession))


def test_remember_me_uses_fixed_24_hour_persistent_session(fixture):
    client, factory, _, _ = fixture
    before = datetime.now(timezone.utc)
    login = client.post("/api/auth/login", json={**LOGIN, "remember_me": True})
    assert login.status_code == 200
    cookie = login.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie
    assert "Max-Age=86400" in cookie

    with factory() as db:
        original = db.query(RefreshSession).filter_by(revoked=False).one()
        original_expiry = original.expires_at.replace(tzinfo=timezone.utc) if original.expires_at.tzinfo is None else original.expires_at
        assert original.persistent is True
        assert before + timedelta(hours=23, minutes=59) <= original_expiry <= before + timedelta(hours=24, seconds=5)

    assert client.post("/api/auth/refresh").status_code == 200
    with factory() as db:
        rotated = db.query(RefreshSession).filter_by(revoked=False).one()
        rotated_expiry = rotated.expires_at.replace(tzinfo=timezone.utc) if rotated.expires_at.tzinfo is None else rotated.expires_at
        assert rotated.persistent is True
        assert rotated_expiry == original_expiry


def test_default_login_uses_browser_session_cookie(fixture):
    client, factory, _, _ = fixture
    login = client.post("/api/auth/login", json=LOGIN)
    assert login.status_code == 200
    cookie = login.headers["set-cookie"]
    assert "Max-Age" not in cookie and "expires=" not in cookie.lower()
    with factory() as db:
        session = db.query(RefreshSession).filter_by(revoked=False).one()
        assert session.persistent is False

def test_untrusted_origin_and_bruteforce_limit(fixture):
    client, _, _, _ = fixture
    assert client.post("/api/auth/refresh", headers={"Origin": "https://evil.example"}).status_code == 403
    for _ in range(10):
        assert client.post("/api/auth/login", json={**LOGIN, "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", json=LOGIN).status_code == 429

def test_admin_disable_and_user_scope(fixture):
    client, factory, tokens, ids = fixture
    url = f"/api/admin/tenants/{ids['b']}/users"
    assert client.get(url, headers=tokens["tenant_admin"]).status_code == 404
    body = {"email": "new@example.com", "full_name": "New user", "password": "long-password-1234", "role": "analyst"}
    assert client.post(url, json=body, headers=tokens["tenant_admin"]).status_code == 404
    response = client.post(url, json=body, headers=tokens["super_admin"])
    assert response.status_code == 201
    assert "password" not in response.text
    assert client.patch(f"/api/admin/tenants/{ids['a']}", json={"active": False}, headers=tokens["tenant_admin"]).status_code == 403
    assert client.patch(f"/api/admin/tenants/{ids['a']}", json={"active": False}, headers=tokens["super_admin"]).status_code == 200
    assert client.get("/api/leads", headers=tokens["tenant_admin"]).status_code == 403
    with factory() as db:
        assert db.query(AuditLog).filter_by(action="client_disable").count() == 1

def test_last_admin_and_role_changes(fixture):
    client, factory, tokens, ids = fixture
    from app.models.models import User
    with factory() as db:
        admin_id = db.query(User).filter_by(role="tenant_admin").one().id
        analyst_id = db.query(User).filter_by(role="analyst").one().id
    url = f"/api/admin/tenants/{ids['a']}/users"
    assert client.patch(f"{url}/{admin_id}", json={"role": "analyst", "active": True}, headers=tokens["super_admin"]).status_code == 409
    assert client.patch(f"{url}/{analyst_id}", json={"role": "sales_manager", "active": True}, headers=tokens["tenant_admin"]).status_code == 200
    assert client.get("/api/analytics/summary", headers=tokens["analyst"]).status_code == 200
    assert client.get("/api/leads", headers=tokens["analyst"]).status_code == 200
