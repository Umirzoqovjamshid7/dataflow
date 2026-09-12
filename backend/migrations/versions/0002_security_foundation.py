"""Role/tenant invariants, exact money and UTC dates. Invalid legacy roles fail migration."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"

def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.create_check_constraint("ck_user_role_tenant", "(role = 'super_admin' AND tenant_id IS NULL) OR (role IN ('tenant_admin','marketer','sales_manager','analyst') AND tenant_id IS NOT NULL)")
    with op.batch_alter_table("campaigns") as batch:
        for name in ("spend", "revenue"):
            batch.alter_column(name, existing_type=sa.Float(), type_=sa.Numeric(18, 2), existing_nullable=False)
    for table, column in (("tenants", "created_at"), ("campaigns", "date"), ("leads", "created_at")):
        with op.batch_alter_table(table) as batch:
            batch.alter_column(column, existing_type=sa.DateTime(), type_=sa.DateTime(timezone=True), existing_nullable=False, postgresql_using=f"{column} AT TIME ZONE 'UTC'")
            batch.create_index(f"ix_{table}_{column}", [column])
    op.create_index("ix_leads_status", "leads", ["status"])
    op.create_index("ix_campaigns_external_id", "campaigns", ["external_id"])

def downgrade():
    raise RuntimeError("Forward-only security migration; restore a verified backup for rollback")
