"""Add model registry metadata for churn models

Revision ID: 006
Revises: 005
Create Date: 2024-12-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("churn_models", sa.Column("model_version", sa.String(), nullable=True, unique=True))
    op.add_column("churn_models", sa.Column("dataset_id", sa.String(), nullable=True))
    op.add_column("churn_models", sa.Column("metrics", sa.JSON(), nullable=True))
    op.add_column("churn_models", sa.Column("artifact_path", sa.String(), nullable=True))
    op.add_column("churn_models", sa.Column("scaler_path", sa.String(), nullable=True))
    op.add_column("churn_models", sa.Column("encoders_path", sa.String(), nullable=True))
    op.add_column("churn_models", sa.Column("trained_at", sa.DateTime(timezone=True), server_default=sa.text("now()")))
    op.create_index("idx_churn_models_active", "churn_models", ["is_active"])
    op.create_index("idx_churn_models_dataset", "churn_models", ["dataset_id"])
    op.create_foreign_key(
        "fk_churn_models_dataset_id_datasets",
        "churn_models",
        "datasets",
        ["dataset_id"],
        ["dataset_id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_churn_models_dataset_id_datasets", "churn_models", type_="foreignkey")
    op.drop_index("idx_churn_models_dataset", table_name="churn_models")
    op.drop_index("idx_churn_models_active", table_name="churn_models")
    op.drop_column("churn_models", "trained_at")
    op.drop_column("churn_models", "encoders_path")
    op.drop_column("churn_models", "scaler_path")
    op.drop_column("churn_models", "artifact_path")
    op.drop_column("churn_models", "metrics")
    op.drop_column("churn_models", "dataset_id")
    op.drop_column("churn_models", "model_version")
