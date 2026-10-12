from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, inspect, text
import app.core.db

def test_upgrade_preserves_original_rows(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    monkeypatch.setattr(app.core.db, "engine", engine)
    config = Config("alembic.ini")
    command.upgrade(config, "0001")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO tenants (id,name,slug,active,created_at) VALUES (1,'Legacy','legacy',1,'2026-01-01')"))
        conn.execute(text("INSERT INTO campaigns (id,tenant_id,platform,name,spend,impressions,clicks,leads,sales,revenue,date) VALUES (1,1,'facebook','Legacy',12.34,100,10,2,1,25.50,'2026-01-01')"))
    command.upgrade(config, "head")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT name FROM tenants")).scalar() == "Legacy"
        assert float(conn.execute(text("SELECT spend FROM campaigns")).scalar()) == 12.34
    assert inspect(engine).get_check_constraints("users")
    engine.dispose()
