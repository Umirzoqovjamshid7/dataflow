"""Track whether a refresh session may survive browser restart."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"


def upgrade():
    # Sessions created before this release used persistent seven-day cookies.
    # Marking them persistent preserves their behavior until their existing
    # absolute expiry instead of unexpectedly signing users out.
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.add_column(sa.Column("persistent", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.drop_column("persistent")
