from app.models.models import AuditLog, RefreshSession

LOGIN = {"email": "tenant_admin@example.com", "password": "test-password-123"}

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
    assert client.get("/api/analytics/summary", headers=tokens["analyst"]).status_code == 403
    assert client.get("/api/leads", headers=tokens["analyst"]).status_code == 200
