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
        conn.execute(text("INSERT INTO integrations (id,tenant_id,provider,config_json,active) VALUES (1,1,'legacy',:config,1)"), {"config": '{"preserve":true}'})
    command.upgrade(config, "head")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT name FROM tenants")).scalar() == "Legacy"
        assert float(conn.execute(text("SELECT spend FROM campaigns")).scalar()) == 12.34
        assert conn.execute(text("SELECT currency FROM campaigns")).scalar() is None
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0005"
        assert conn.execute(text("SELECT COUNT(*) FROM v5_provider_connections")).scalar() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM v5_external_records")).scalar() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM v5_sync_jobs")).scalar() == 0
        assert conn.execute(text("SELECT config_json FROM integrations")).scalar() == '{"preserve":true}'
    assert inspect(engine).get_check_constraints("users")
    engine.dispose()
