"""Add provider identity and commercial fields to imported leads."""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"


def upgrade():
    op.add_column("leads", sa.Column("external_id", sa.String(180), nullable=True))
    op.add_column("leads", sa.Column("amount", sa.Numeric(18, 2), nullable=False, server_default="0"))
    op.add_column("leads", sa.Column("currency", sa.String(3), nullable=True))
    op.add_column("leads", sa.Column("assigned_to", sa.String(180), nullable=True))
    op.create_index("ix_leads_crm_external", "leads", ["tenant_id", "crm", "external_id"], unique=True)


def downgrade():
    op.drop_index("ix_leads_crm_external", table_name="leads")
    for column in ("assigned_to", "currency", "amount", "external_id"):
        op.drop_column("leads", column)
