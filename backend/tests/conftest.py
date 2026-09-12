import os
os.environ["ENVIRONMENT"] = "test"
os.environ["CORS_ORIGINS"] = "https://leadflow.example.com"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-only-" + "a" * 48

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.core.db import Base, get_db
from app.main import app
from app.models.models import Tenant, User, Lead
from app.core.security import hash_password, create_token

@pytest.fixture
def fixture():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def enable_fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine)
    with factory() as db:
        a, b = Tenant(name="A", slug="a"), Tenant(name="B", slug="b")
        db.add_all([a, b]); db.flush()
        users = [User(email=f"{role}@example.com", full_name=role, role=role, tenant_id=None if role == "super_admin" else a.id, password_hash=hash_password("test-password-123")) for role in ("super_admin", "tenant_admin", "marketer", "sales_manager", "analyst")]
        db.add_all(users)
        own, other = Lead(tenant_id=a.id, name="Own", phone="123456789"), Lead(tenant_id=b.id, name="Other", phone="987654321")
        db.add_all([own, other]); db.commit()
        tokens = {u.role: {"Authorization": f"Bearer {create_token(u.id, u.role, u.tenant_id)}"} for u in users}
        ids = {"a": a.id, "b": b.id, "own": own.id, "other": other.id}
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        yield client, factory, tokens, ids
    app.dependency_overrides.clear()
    engine.dispose()
