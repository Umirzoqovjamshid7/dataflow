"""Original schema baseline, frozen independently of application models.

Existing original databases may stamp this revision ONLY after schema inspection.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None

def upgrade():
    op.create_table("tenants", sa.Column("id", sa.Integer, primary_key=True), sa.Column("name", sa.String(180), nullable=False, unique=True), sa.Column("slug", sa.String(100), nullable=False), sa.Column("active", sa.Boolean, nullable=False), sa.Column("created_at", sa.DateTime, nullable=False))
    op.create_index("ix_tenants_slug", "tenants", ["slug"], unique=True)
    op.create_table("users", sa.Column("id", sa.Integer, primary_key=True), sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id")), sa.Column("email", sa.String(180), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("full_name", sa.String(180), nullable=False), sa.Column("role", sa.String(50), nullable=False), sa.Column("active", sa.Boolean, nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("campaigns", sa.Column("id", sa.Integer, primary_key=True), sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False), sa.Column("platform", sa.String(50), nullable=False), sa.Column("external_id", sa.String(120)), sa.Column("name", sa.String(255), nullable=False), sa.Column("spend", sa.Float, nullable=False), sa.Column("impressions", sa.Integer, nullable=False), sa.Column("clicks", sa.Integer, nullable=False), sa.Column("leads", sa.Integer, nullable=False), sa.Column("sales", sa.Integer, nullable=False), sa.Column("revenue", sa.Float, nullable=False), sa.Column("date", sa.DateTime, nullable=False))
    op.create_table("leads", sa.Column("id", sa.Integer, primary_key=True), sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False), sa.Column("name", sa.String(180), nullable=False), sa.Column("phone", sa.String(80), nullable=False), sa.Column("email", sa.String(180)), sa.Column("source", sa.String(80), nullable=False), sa.Column("campaign_name", sa.String(255)), sa.Column("status", sa.String(80), nullable=False), sa.Column("crm", sa.String(80)), sa.Column("created_at", sa.DateTime, nullable=False))
    op.create_index("ix_leads_phone", "leads", ["phone"])
    op.create_table("integrations", sa.Column("id", sa.Integer, primary_key=True), sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False), sa.Column("provider", sa.String(80), nullable=False), sa.Column("config_json", sa.Text, nullable=False), sa.Column("active", sa.Boolean, nullable=False))
    for table in ("users", "campaigns", "leads", "integrations"):
        op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])

def downgrade():
    for table in ("integrations", "leads", "campaigns", "users", "tenants"):
        op.drop_table(table)
