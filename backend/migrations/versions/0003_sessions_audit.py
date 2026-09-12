"""Persisted rotating refresh sessions, audit events and shared throttling."""
from alembic import op
import sqlalchemy as sa
revision = "0003"
down_revision = "0002"

def upgrade():
    op.create_table("audit_logs", sa.Column("id", sa.Integer, primary_key=True), sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id")), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")), sa.Column("action", sa.String(80), nullable=False), sa.Column("resource", sa.String(180), nullable=False), sa.Column("ip", sa.String(80)), sa.Column("user_agent", sa.String(500)), sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False))
    for field in ("tenant_id", "user_id", "action", "timestamp"):
        op.create_index(f"ix_audit_logs_{field}", "audit_logs", [field])
    op.create_table("refresh_sessions", sa.Column("id", sa.Integer, primary_key=True), sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id")), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked", sa.Boolean, nullable=False))
    for field in ("tenant_id", "user_id"):
        op.create_index(f"ix_refresh_sessions_{field}", "refresh_sessions", [field])
    op.create_table("rate_limits", sa.Column("key", sa.String(64), primary_key=True), sa.Column("window", sa.Integer, nullable=False), sa.Column("count", sa.Integer, nullable=False))

def downgrade():
    op.drop_table("rate_limits")
    op.drop_table("refresh_sessions")
    op.drop_table("audit_logs")
