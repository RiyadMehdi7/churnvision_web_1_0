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
    # Drop foreign key constraints from RAG tables (if they exist)
    # These were referencing users.user_id but auth uses legacy_users.id
    # Using raw SQL with IF EXISTS to handle cases where constraints don't exist

    conn = op.get_bind()

    # Drop FK from rag_documents (if exists)
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS fk_rag_documents_user_id;
        EXCEPTION WHEN undefined_object THEN
            NULL;
        END $$;
    """))

    # Drop FK from custom_hr_rules (if exists)
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE custom_hr_rules DROP CONSTRAINT IF EXISTS custom_hr_rules_user_id_fkey;
        EXCEPTION WHEN undefined_object THEN
            NULL;
        END $$;
    """))

    # Drop FK from knowledge_base_settings (if exists)
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE knowledge_base_settings DROP CONSTRAINT IF EXISTS knowledge_base_settings_user_id_fkey;
        EXCEPTION WHEN undefined_object THEN
            NULL;
        END $$;
    """))


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
