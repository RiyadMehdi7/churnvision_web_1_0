"""Add SSO integration fields to legacy_users

Revision ID: 010
Revises: 009
Create Date: 2025-01-21

Adds fields required for SSO/OIDC integration:
- sso_provider: Type of SSO provider (oidc, ldap, saml)
- sso_subject: Unique identifier from the identity provider
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010'
down_revision: Union[str, None] = '009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add SSO fields to legacy_users table
    op.add_column(
        'legacy_users',
        sa.Column('sso_provider', sa.String(), nullable=True,
                  comment='SSO provider type: oidc, ldap, saml')
    )
    op.add_column(
        'legacy_users',
        sa.Column('sso_subject', sa.String(), nullable=True,
                  comment='Unique subject identifier from IdP')
    )

    # Add index on sso_subject for faster lookups
    op.create_index(
        'ix_legacy_users_sso_subject',
        'legacy_users',
        ['sso_subject'],
        unique=False
    )


def downgrade() -> None:
    # Remove index
    op.drop_index('ix_legacy_users_sso_subject', table_name='legacy_users')

    # Remove columns
    op.drop_column('legacy_users', 'sso_subject')
    op.drop_column('legacy_users', 'sso_provider')
