"""Extend RAG subsystem with custom rules and settings

Revision ID: 007
Revises: 006
Create Date: 2025-12-06

Adds:
- New columns to rag_documents: status, error_message, chunk_count, updated_at, user_id, project_id, document_type, tags
- New columns to rag_chunks: chunk_metadata, chroma_id
- New table: custom_hr_rules for user-defined HR rules
- New table: knowledge_base_settings for RAG configuration
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend rag_documents table with new columns
    op.add_column("rag_documents", sa.Column("status", sa.String(50), nullable=True, server_default="pending"))
    op.add_column("rag_documents", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("rag_documents", sa.Column("chunk_count", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("rag_documents", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rag_documents", sa.Column("user_id", sa.String(100), nullable=True))
    op.add_column("rag_documents", sa.Column("project_id", sa.String(100), nullable=True))
    op.add_column("rag_documents", sa.Column("document_type", sa.String(50), nullable=True, server_default="general"))
    op.add_column("rag_documents", sa.Column("tags", sa.String(500), nullable=True))

    # Add foreign key for user_id
    op.create_foreign_key(
        "fk_rag_documents_user_id",
        "rag_documents",
        "users",
        ["user_id"],
        ["user_id"],
        ondelete="SET NULL"
    )

    # Create indexes for rag_documents
    op.create_index("ix_rag_documents_status", "rag_documents", ["status"])
    op.create_index("ix_rag_documents_project_id", "rag_documents", ["project_id"])
    op.create_index("ix_rag_documents_document_type", "rag_documents", ["document_type"])
    op.create_index("ix_rag_documents_user_id", "rag_documents", ["user_id"])

    # Extend rag_chunks table with new columns
    op.add_column("rag_chunks", sa.Column("chunk_metadata", sa.Text(), nullable=True))
    op.add_column("rag_chunks", sa.Column("chroma_id", sa.String(100), nullable=True))

    # Create index for chroma_id
    op.create_index("ix_rag_chunks_chroma_id", "rag_chunks", ["chroma_id"])

    # Create custom_hr_rules table
    op.create_table(
        "custom_hr_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("rule_text", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=True, server_default="5"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", sa.String(100), nullable=True),
        sa.Column("project_id", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("ix_custom_hr_rules_category", "custom_hr_rules", ["category"])
    op.create_index("ix_custom_hr_rules_is_active", "custom_hr_rules", ["is_active"])
    op.create_index("ix_custom_hr_rules_project_id", "custom_hr_rules", ["project_id"])
    op.create_index("ix_custom_hr_rules_user_id", "custom_hr_rules", ["user_id"])

    # Create knowledge_base_settings table
    op.create_table(
        "knowledge_base_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("mode", sa.String(20), nullable=True, server_default="automatic"),
        sa.Column("chunk_size", sa.Integer(), nullable=True, server_default="500"),
        sa.Column("chunk_overlap", sa.Integer(), nullable=True, server_default="50"),
        sa.Column("retrieval_top_k", sa.Integer(), nullable=True, server_default="5"),
        sa.Column("similarity_threshold", sa.Float(), nullable=True, server_default="0.7"),
        sa.Column("use_general_hr_knowledge", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("strict_policy_mode", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("user_id", sa.String(100), nullable=True),
        sa.Column("project_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("ix_kb_settings_user_id", "knowledge_base_settings", ["user_id"])
    op.create_index("ix_kb_settings_project_id", "knowledge_base_settings", ["project_id"])


def downgrade() -> None:
    # Drop knowledge_base_settings table
    op.drop_index("ix_kb_settings_project_id", table_name="knowledge_base_settings")
    op.drop_index("ix_kb_settings_user_id", table_name="knowledge_base_settings")
    op.drop_table("knowledge_base_settings")

    # Drop custom_hr_rules table
    op.drop_index("ix_custom_hr_rules_user_id", table_name="custom_hr_rules")
    op.drop_index("ix_custom_hr_rules_project_id", table_name="custom_hr_rules")
    op.drop_index("ix_custom_hr_rules_is_active", table_name="custom_hr_rules")
    op.drop_index("ix_custom_hr_rules_category", table_name="custom_hr_rules")
    op.drop_table("custom_hr_rules")

    # Remove rag_chunks columns
    op.drop_index("ix_rag_chunks_chroma_id", table_name="rag_chunks")
    op.drop_column("rag_chunks", "chroma_id")
    op.drop_column("rag_chunks", "chunk_metadata")

    # Remove rag_documents indexes and columns
    op.drop_index("ix_rag_documents_user_id", table_name="rag_documents")
    op.drop_index("ix_rag_documents_document_type", table_name="rag_documents")
    op.drop_index("ix_rag_documents_project_id", table_name="rag_documents")
    op.drop_index("ix_rag_documents_status", table_name="rag_documents")
    op.drop_constraint("fk_rag_documents_user_id", "rag_documents", type_="foreignkey")
    op.drop_column("rag_documents", "tags")
    op.drop_column("rag_documents", "document_type")
    op.drop_column("rag_documents", "project_id")
    op.drop_column("rag_documents", "user_id")
    op.drop_column("rag_documents", "updated_at")
    op.drop_column("rag_documents", "chunk_count")
    op.drop_column("rag_documents", "error_message")
    op.drop_column("rag_documents", "status")
