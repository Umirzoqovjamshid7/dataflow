"""Allow project-level plan rows for Excel imports."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"


def upgrade():
    with op.batch_alter_table("v5_business_plans") as batch:
        batch.add_column(sa.Column("project", sa.String(255), nullable=False, server_default="__total__"))
        batch.drop_constraint("uq_v5_plan", type_="unique")
        batch.create_unique_constraint("uq_v5_plan_project", ["tenant_id", "month", "metric", "project"])


def downgrade():
    raise RuntimeError("Plan project rollback requires reviewed data consolidation")
