"""Allow public lead capture retries without creating duplicate leads."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"

def upgrade():
    op.add_column("leads", sa.Column("idempotency_key", sa.String(128), nullable=True))
    op.create_index("uq_leads_tenant_idempotency_key", "leads", ["tenant_id", "idempotency_key"], unique=True)

def downgrade():
    op.drop_index("uq_leads_tenant_idempotency_key", table_name="leads")
    op.drop_column("leads", "idempotency_key")
