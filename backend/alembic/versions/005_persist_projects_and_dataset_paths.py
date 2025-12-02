"""Add projects table and dataset storage metadata

Revision ID: 005
Revises: 004
Create Date: 2024-11-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("path", sa.String(), nullable=True, unique=True),
        sa.Column("db_path", sa.String(), nullable=True, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.add_column("datasets", sa.Column("project_id", sa.String(), nullable=True))
    op.add_column("datasets", sa.Column("file_path", sa.String(), nullable=True))
    op.add_column("datasets", sa.Column("column_mapping", sa.JSON(), nullable=True))
    op.create_index("idx_datasets_project_id", "datasets", ["project_id"])
    op.create_foreign_key(
        "fk_datasets_project_id_projects",
        "datasets",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Seed a default project and attach existing datasets to it
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO projects (id, name, path, db_path, is_active)
            VALUES (:id, :name, :path, :db_path, :active)
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {
            "id": "default",
            "name": "Default Project",
            "path": "/default",
            "db_path": "/default/database.db",
            "active": True,
        },
    )
    conn.execute(
        sa.text(
            """
            UPDATE datasets
            SET project_id = COALESCE(project_id, :default_id)
            """
        ),
        {"default_id": "default"},
    )


def downgrade() -> None:
    op.drop_constraint("fk_datasets_project_id_projects", "datasets", type_="foreignkey")
    op.drop_index("idx_datasets_project_id", table_name="datasets")
    op.drop_column("datasets", "column_mapping")
    op.drop_column("datasets", "file_path")
    op.drop_column("datasets", "project_id")
    op.drop_table("projects")
