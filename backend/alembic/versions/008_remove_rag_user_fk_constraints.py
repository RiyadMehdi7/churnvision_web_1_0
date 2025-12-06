"""Remove foreign key constraints from RAG tables

Revision ID: 008
Revises: 007
Create Date: 2025-12-06

The RAG tables were created with foreign key constraints to users.user_id,
but the authentication system uses a different user table (legacy_users).
This migration removes the FK constraints to allow storing any user identifier.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop foreign key constraints from RAG tables
    # These were referencing users.user_id but auth uses legacy_users.id

    # Drop FK from rag_documents
    op.drop_constraint("fk_rag_documents_user_id", "rag_documents", type_="foreignkey")

    # Drop FK from custom_hr_rules
    op.drop_constraint("custom_hr_rules_user_id_fkey", "custom_hr_rules", type_="foreignkey")

    # Drop FK from knowledge_base_settings
    op.drop_constraint("knowledge_base_settings_user_id_fkey", "knowledge_base_settings", type_="foreignkey")


def downgrade() -> None:
    # Recreate foreign key constraints
    op.create_foreign_key(
        "fk_rag_documents_user_id",
        "rag_documents",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="SET NULL"
    )

    op.create_foreign_key(
        "custom_hr_rules_user_id_fkey",
        "custom_hr_rules",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="SET NULL"
    )

    op.create_foreign_key(
        "knowledge_base_settings_user_id_fkey",
        "knowledge_base_settings",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="SET NULL"
    )
