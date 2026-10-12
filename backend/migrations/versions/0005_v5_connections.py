"""Add isolated V5 connections, imported records and business plans; no data copying."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"


def upgrade():
    op.add_column("campaigns", sa.Column("currency", sa.String(3), nullable=True))
    op.create_table("v5_provider_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("credentials_encrypted", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("tested_at", sa.DateTime(timezone=True)),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(180)),
        sa.Column("synced_records", sa.Integer(), nullable=False),
        sa.Column("operation_started_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenant_id", "provider", name="uq_v5_connection"))
    op.create_table("v5_external_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("external_id", sa.String(180), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "provider", "kind", "external_id", name="uq_v5_external_record"))
    op.create_table("v5_business_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("metric", sa.String(30), nullable=False),
        sa.Column("target", sa.Numeric(18, 2), nullable=False),
        sa.UniqueConstraint("tenant_id", "month", "metric", name="uq_v5_plan"),
        sa.CheckConstraint("target >= 0", name="ck_v5_plan_target"))
    for table in ("v5_provider_connections", "v5_external_records", "v5_business_plans"):
        op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])
    op.create_table("v5_sync_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("connection_id", sa.Integer(), sa.ForeignKey("v5_provider_connections.id"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)))
    for column in ("connection_id", "tenant_id", "status"):
        op.create_index(f"ix_v5_sync_jobs_{column}", "v5_sync_jobs", [column])


def downgrade():
    # Deliberately refuse automatic destructive rollback of imported business data.
    raise RuntimeError("V5 rollback requires an explicit reviewed backup/retention plan")
