"""
Tests for app/api/v1/admin.py - Admin API endpoints.

Tests cover:
- Admin stats endpoint
- User CRUD (create, read, update, delete)
- Password reset
- Role management
- Permission listing
- Audit logs
- Permission checks (admin access, super admin restrictions)
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


# ============ Fixtures ============

@pytest.fixture
def mock_admin_user():
    """Create a mock admin user (UserAccount from RBAC system)."""
    user = MagicMock()
    user.user_id = "1"
    user.username = "admin"
    user.email = "admin@example.com"
    user.full_name = "Admin User"
    user.is_active = 1
    user.is_super_admin = 0
    user.created_at = datetime.utcnow()
    user.updated_at = datetime.utcnow()
    user.last_login_at = None
    return user


@pytest.fixture
def mock_super_admin_user():
    """Create a mock super admin user."""
    user = MagicMock()
    user.user_id = "1"
    user.username = "superadmin"
    user.email = "superadmin@example.com"
    user.full_name = "Super Admin"
    user.is_active = 1
    user.is_super_admin = 1
    user.created_at = datetime.utcnow()
    user.updated_at = datetime.utcnow()
    user.last_login_at = None
    return user


@pytest.fixture
def mock_regular_user():
    """Create a mock regular user without admin access."""
    user = MagicMock()
    user.user_id = "2"
    user.username = "regularuser"
    user.email = "user@example.com"
    user.full_name = "Regular User"
    user.is_active = 1
    user.is_super_admin = 0
    user.created_at = datetime.utcnow()
    user.updated_at = datetime.utcnow()
    user.last_login_at = None
    return user


@pytest.fixture
def mock_role():
    """Create a mock role."""
    role = MagicMock()
    role.role_id = "analyst"
    role.role_name = "Analyst"
    role.description = "Data analyst role"
    role.is_system_role = 0
    role.created_at = datetime.utcnow()
    return role


@pytest.fixture
def mock_permission():
    """Create a mock permission."""
    perm = MagicMock()
    perm.permission_id = "churn:read"
    perm.permission_name = "Read Churn Data"
    perm.description = "Can read churn predictions"
    perm.resource_type = "churn"
    perm.action = "read"
    return perm


@pytest.fixture
def mock_legacy_user():
    """Create a mock legacy user (from User model for auth)."""
    user = MagicMock()
    user.id = 1
    user.username = "admin"
    user.email = "admin@example.com"
    user.full_name = "Admin User"
    user.is_active = True
    user.is_superuser = False
    return user


# ============ Test check_admin_access ============

class TestCheckAdminAccess:
    """Test admin access permission checking."""

    @pytest.mark.asyncio
    async def test_super_admin_has_access(self, mock_db_session, mock_legacy_user, mock_super_admin_user):
        """Super admin should have access without checking permissions."""
        from app.api.v1.admin import check_admin_access

        # Mock finding the super admin UserAccount
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_super_admin_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await check_admin_access(mock_db_session, mock_legacy_user)

        assert result == mock_super_admin_user
        assert result.is_super_admin == 1

    @pytest.mark.asyncio
    async def test_admin_with_permission_has_access(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """User with admin:access permission should have access."""
        from app.api.v1.admin import check_admin_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_admin_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access", "churn:read"}):
            result = await check_admin_access(mock_db_session, mock_legacy_user)

        assert result == mock_admin_user

    @pytest.mark.asyncio
    async def test_user_without_admin_permission_denied(self, mock_db_session, mock_legacy_user, mock_regular_user):
        """User without admin:access permission should be denied."""
        from app.api.v1.admin import check_admin_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_regular_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"churn:read"}):
            with pytest.raises(HTTPException) as exc_info:
                await check_admin_access(mock_db_session, mock_legacy_user)

            assert exc_info.value.status_code == 403
            assert "Admin access required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_user_not_in_rbac_system_denied(self, mock_db_session, mock_legacy_user):
        """User not in RBAC system should be denied."""
        from app.api.v1.admin import check_admin_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await check_admin_access(mock_db_session, mock_legacy_user)

        assert exc_info.value.status_code == 403
        assert "User account not found" in exc_info.value.detail


# ============ Test Stats Endpoint ============

class TestAdminStats:
    """Test admin stats endpoint."""

    @pytest.mark.asyncio
    async def test_get_stats_success(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Admin should be able to get stats."""
        from app.api.v1.admin import get_admin_stats

        # Mock check_admin_access
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_admin_user

        # Mock stats queries
        mock_total = MagicMock()
        mock_total.scalar.return_value = 10

        mock_active = MagicMock()
        mock_active.scalar.return_value = 8

        mock_roles = MagicMock()
        mock_roles.fetchall.return_value = [("admin", 2), ("analyst", 5), ("viewer", 3)]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_result,  # check_admin_access query
            mock_total,   # total users
            mock_active,  # active users
            mock_roles,   # users by role
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await get_admin_stats(db=mock_db_session, current_user=mock_legacy_user)

        assert result.total_users == 10
        assert result.active_users == 8
        assert result.inactive_users == 2
        assert "admin" in result.users_by_role


# ============ Test User Management ============

class TestListUsers:
    """Test list users endpoint."""

    @pytest.mark.asyncio
    async def test_list_users_success(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Admin should be able to list users."""
        from app.api.v1.admin import list_users

        mock_user_account = MagicMock()
        mock_user_account.user_id = "2"
        mock_user_account.username = "testuser"
        mock_user_account.email = "test@example.com"
        mock_user_account.full_name = "Test User"
        mock_user_account.is_active = 1
        mock_user_account.is_super_admin = 0
        mock_user_account.created_at = datetime.utcnow()
        mock_user_account.updated_at = None
        mock_user_account.last_login_at = None

        mock_role = MagicMock()
        mock_role.role_id = "analyst"
        mock_role.role_name = "Analyst"
        mock_role.description = "Data analyst"

        # Setup mock responses
        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1

        mock_users_result = MagicMock()
        mock_users_result.scalars.return_value.all.return_value = [mock_user_account]

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = mock_role

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,  # check_admin_access
            mock_count_result,  # count query
            mock_users_result,  # users query
            mock_role_result,   # role query for user
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await list_users(
                page=1,
                page_size=20,
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert result.total == 1
        assert len(result.users) == 1
        assert result.users[0].username == "testuser"
        assert result.users[0].role.role_id == "analyst"


class TestGetUser:
    """Test get single user endpoint."""

    @pytest.mark.asyncio
    async def test_get_user_success(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_role):
        """Admin should be able to get user details."""
        from app.api.v1.admin import get_user

        target_user = MagicMock()
        target_user.user_id = "2"
        target_user.username = "targetuser"
        target_user.email = "target@example.com"
        target_user.full_name = "Target User"
        target_user.is_active = 1
        target_user.is_super_admin = 0
        target_user.created_at = datetime.utcnow()
        target_user.updated_at = None
        target_user.last_login_at = None

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = target_user

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = mock_role

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,  # check_admin_access
            mock_user_result,   # get user
            mock_role_result,   # get role
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", side_effect=[
            {"admin:access"},  # for admin check
            {"churn:read", "dashboard:view"},  # for target user permissions
        ]):
            result = await get_user(
                user_id="2",
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert result.user_id == "2"
        assert result.username == "targetuser"
        assert "churn:read" in result.permissions

    @pytest.mark.asyncio
    async def test_get_user_not_found(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Getting non-existent user should return 404."""
        from app.api.v1.admin import get_user

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = None

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_user_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await get_user(user_id="999", db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 404
            assert "User not found" in exc_info.value.detail


class TestCreateUser:
    """Test create user endpoint."""

    @pytest.mark.asyncio
    async def test_create_user_success(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_role):
        """Admin should be able to create a user."""
        from app.api.v1.admin import create_user
        from app.schemas.admin import UserAdminCreate

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_none_result = MagicMock()
        mock_none_result.scalar_one_or_none.return_value = None

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = mock_role

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,  # check_admin_access
            mock_none_result,   # check username exists
            mock_none_result,   # check email exists
            mock_role_result,   # verify role
            mock_none_result,   # check legacy username
            mock_none_result,   # check legacy email
        ])
        mock_db_session.flush = AsyncMock()
        mock_db_session.commit = AsyncMock()
        mock_db_session.refresh = AsyncMock()

        user_data = UserAdminCreate(
            username="newuser",
            email="newuser@example.com",
            full_name="New User",
            password="SecurePass123!",
            role_id="analyst"
        )

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with patch("app.api.v1.admin.log_admin_action", new_callable=AsyncMock):
                result = await create_user(
                    user_data=user_data,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert result.username == "newuser"
        assert result.email == "newuser@example.com"
        mock_db_session.add.assert_called()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_user_duplicate_username(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Creating user with duplicate username should fail."""
        from app.api.v1.admin import create_user
        from app.schemas.admin import UserAdminCreate

        existing_user = MagicMock()

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_existing_result = MagicMock()
        mock_existing_result.scalar_one_or_none.return_value = existing_user

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_existing_result,  # username exists
        ])

        user_data = UserAdminCreate(
            username="existinguser",
            email="new@example.com",
            password="SecurePass123!",
            role_id="analyst"
        )

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await create_user(user_data=user_data, db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 400
            assert "Username already exists" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_create_super_admin_requires_super_admin(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_role):
        """Only super admin can create super admin users."""
        from app.api.v1.admin import create_user
        from app.schemas.admin import UserAdminCreate

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_none_result = MagicMock()
        mock_none_result.scalar_one_or_none.return_value = None

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = mock_role

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_none_result,   # username check
            mock_none_result,   # email check
            mock_role_result,   # role check
        ])

        user_data = UserAdminCreate(
            username="newsuperadmin",
            email="super@example.com",
            password="SecurePass123!",
            role_id="super_admin"  # Trying to create super admin
        )

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await create_user(user_data=user_data, db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 403
            assert "Super Admin" in exc_info.value.detail


class TestUpdateUser:
    """Test update user endpoint."""

    @pytest.mark.asyncio
    async def test_update_user_success(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_role):
        """Admin should be able to update user details."""
        from app.api.v1.admin import update_user
        from app.schemas.admin import UserAdminUpdate

        target_user = MagicMock()
        target_user.user_id = "2"
        target_user.username = "targetuser"
        target_user.email = "old@example.com"
        target_user.full_name = "Old Name"
        target_user.is_active = 1
        target_user.is_super_admin = 0
        target_user.created_at = datetime.utcnow()
        target_user.updated_at = None
        target_user.last_login_at = None

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = target_user

        mock_none_result = MagicMock()
        mock_none_result.scalar_one_or_none.return_value = None

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = mock_role

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,  # check_admin_access
            mock_user_result,   # get user to update
            mock_none_result,   # check email not taken
            mock_role_result,   # get current role at end
        ])
        mock_db_session.commit = AsyncMock()
        mock_db_session.refresh = AsyncMock()

        update_data = UserAdminUpdate(
            email="new@example.com",
            full_name="New Name"
        )

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with patch("app.api.v1.admin.log_admin_action", new_callable=AsyncMock):
                result = await update_user(
                    user_id="2",
                    user_data=update_data,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert target_user.email == "new@example.com"
        assert target_user.full_name == "New Name"

    @pytest.mark.asyncio
    async def test_update_super_admin_requires_super_admin(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Only super admin can modify super admin users."""
        from app.api.v1.admin import update_user
        from app.schemas.admin import UserAdminUpdate

        super_admin_target = MagicMock()
        super_admin_target.is_super_admin = 1

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none.return_value = super_admin_target

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_target_result,
        ])

        update_data = UserAdminUpdate(full_name="New Name")

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await update_user(user_id="1", user_data=update_data, db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 403
            assert "Super Admin" in exc_info.value.detail


class TestDeleteUser:
    """Test delete user endpoint."""

    @pytest.mark.asyncio
    async def test_delete_user_success(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Admin should be able to soft-delete a user."""
        from app.api.v1.admin import delete_user

        target_user = MagicMock()
        target_user.user_id = "2"
        target_user.username = "targetuser"
        target_user.is_active = 1
        target_user.is_super_admin = 0

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = target_user

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_user_result,
        ])
        mock_db_session.commit = AsyncMock()

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with patch("app.api.v1.admin.invalidate_user_permissions_cache", new_callable=AsyncMock):
                with patch("app.api.v1.admin.log_admin_action", new_callable=AsyncMock):
                    await delete_user(user_id="2", db=mock_db_session, current_user=mock_legacy_user)

        # Verify soft delete (is_active = 0)
        assert target_user.is_active == 0

    @pytest.mark.asyncio
    async def test_cannot_delete_super_admin(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Super admin users cannot be deleted."""
        from app.api.v1.admin import delete_user

        super_admin_target = MagicMock()
        super_admin_target.is_super_admin = 1

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none.return_value = super_admin_target

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_target_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await delete_user(user_id="1", db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 403
            assert "Super Admin" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_cannot_delete_self(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Users cannot delete themselves."""
        from app.api.v1.admin import delete_user

        # Make target user same as current user
        target_user = MagicMock()
        target_user.username = mock_legacy_user.username
        target_user.is_super_admin = 0

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none.return_value = target_user

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_target_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await delete_user(user_id="1", db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 400
            assert "Cannot delete your own account" in exc_info.value.detail


class TestResetPassword:
    """Test password reset endpoint."""

    @pytest.mark.asyncio
    async def test_reset_password_success(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Admin should be able to reset user password."""
        from app.api.v1.admin import reset_user_password
        from app.schemas.admin import PasswordReset

        target_user = MagicMock()
        target_user.user_id = "2"
        target_user.username = "targetuser"
        target_user.is_super_admin = 0
        target_user.password_hash = "old_hash"

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = target_user

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_user_result,
        ])
        mock_db_session.commit = AsyncMock()

        password_data = PasswordReset(new_password="NewSecure123!")

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with patch("app.api.v1.admin.log_admin_action", new_callable=AsyncMock):
                result = await reset_user_password(
                    user_id="2",
                    password_data=password_data,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert result["message"] == "Password reset successfully"
        assert target_user.password_hash != "old_hash"

    @pytest.mark.asyncio
    async def test_reset_super_admin_password_requires_super_admin(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Only super admin can reset super admin password."""
        from app.api.v1.admin import reset_user_password
        from app.schemas.admin import PasswordReset

        super_admin_target = MagicMock()
        super_admin_target.is_super_admin = 1

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none.return_value = super_admin_target

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_target_result,
        ])

        password_data = PasswordReset(new_password="NewSecure123!")

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await reset_user_password(
                    user_id="1",
                    password_data=password_data,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

            assert exc_info.value.status_code == 403


# ============ Test Role Endpoints ============

class TestListRoles:
    """Test list roles endpoint."""

    @pytest.mark.asyncio
    async def test_list_roles_success(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_role):
        """Admin should be able to list roles."""
        from app.api.v1.admin import list_roles

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_roles_result = MagicMock()
        mock_roles_result.scalars.return_value.all.return_value = [mock_role]

        mock_perms_result = MagicMock()
        mock_perms_result.fetchall.return_value = [("churn:read",), ("dashboard:view",)]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_roles_result,
            mock_perms_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await list_roles(db=mock_db_session, current_user=mock_legacy_user)

        assert len(result) == 1
        assert result[0].role_id == "analyst"
        assert "churn:read" in result[0].permissions


class TestGetRole:
    """Test get single role endpoint."""

    @pytest.mark.asyncio
    async def test_get_role_success(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_role):
        """Admin should be able to get role details."""
        from app.api.v1.admin import get_role

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = mock_role

        mock_perms_result = MagicMock()
        mock_perms_result.fetchall.return_value = [("churn:read",)]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_role_result,
            mock_perms_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await get_role(role_id="analyst", db=mock_db_session, current_user=mock_legacy_user)

        assert result.role_id == "analyst"
        assert "churn:read" in result.permissions

    @pytest.mark.asyncio
    async def test_get_role_not_found(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Getting non-existent role should return 404."""
        from app.api.v1.admin import get_role

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_role_result = MagicMock()
        mock_role_result.scalar_one_or_none.return_value = None

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_role_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await get_role(role_id="nonexistent", db=mock_db_session, current_user=mock_legacy_user)

            assert exc_info.value.status_code == 404


# ============ Test Permission Endpoints ============

class TestListPermissions:
    """Test list permissions endpoint."""

    @pytest.mark.asyncio
    async def test_list_permissions_success(self, mock_db_session, mock_legacy_user, mock_admin_user, mock_permission):
        """Admin should be able to list permissions."""
        from app.api.v1.admin import list_permissions

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_perms_result = MagicMock()
        mock_perms_result.scalars.return_value.all.return_value = [mock_permission]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_perms_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await list_permissions(db=mock_db_session, current_user=mock_legacy_user)

        assert len(result) == 1
        assert result[0].permission_id == "churn:read"


class TestListPermissionsByResource:
    """Test list permissions grouped by resource."""

    @pytest.mark.asyncio
    async def test_list_permissions_by_resource(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Should return permissions grouped by resource type."""
        from app.api.v1.admin import list_permissions_by_resource

        perm1 = MagicMock()
        perm1.permission_id = "churn:read"
        perm1.permission_name = "Read Churn"
        perm1.description = "Can read churn data"
        perm1.resource_type = "churn"
        perm1.action = "read"

        perm2 = MagicMock()
        perm2.permission_id = "churn:write"
        perm2.permission_name = "Write Churn"
        perm2.description = "Can write churn data"
        perm2.resource_type = "churn"
        perm2.action = "write"

        perm3 = MagicMock()
        perm3.permission_id = "dashboard:view"
        perm3.permission_name = "View Dashboard"
        perm3.description = "Can view dashboard"
        perm3.resource_type = "dashboard"
        perm3.action = "view"

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_perms_result = MagicMock()
        mock_perms_result.scalars.return_value.all.return_value = [perm1, perm2, perm3]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_perms_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await list_permissions_by_resource(db=mock_db_session, current_user=mock_legacy_user)

        # Should have 2 resource groups: churn and dashboard
        assert len(result) == 2
        resource_types = [r.resource_type for r in result]
        assert "churn" in resource_types
        assert "dashboard" in resource_types


# ============ Test Audit Log Endpoints ============

class TestListAuditLogs:
    """Test list audit logs endpoint."""

    @pytest.mark.asyncio
    async def test_list_audit_logs_success(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Admin should be able to list audit logs."""
        from app.api.v1.admin import list_audit_logs

        mock_log = MagicMock()
        mock_log.id = 1
        mock_log.timestamp = datetime.utcnow()
        mock_log.user_id = 1
        mock_log.username = "admin"
        mock_log.action = "user_created"
        mock_log.resource_type = "user"
        mock_log.resource_id = "2"
        mock_log.method = "POST"
        mock_log.endpoint = "/api/v1/admin/users"
        mock_log.ip_address = "127.0.0.1"
        mock_log.status_code = 201
        mock_log.duration_ms = 150
        mock_log.error_message = None

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1

        mock_logs_result = MagicMock()
        mock_logs_result.scalars.return_value.all.return_value = [mock_log]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_count_result,
            mock_logs_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await list_audit_logs(
                page=1,
                page_size=50,
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert result.total == 1
        assert len(result.logs) == 1
        assert result.logs[0].action == "user_created"

    @pytest.mark.asyncio
    async def test_list_audit_logs_with_filters(self, mock_db_session, mock_legacy_user, mock_admin_user):
        """Should filter audit logs by action and username."""
        from app.api.v1.admin import list_audit_logs

        mock_admin_result = MagicMock()
        mock_admin_result.scalar_one_or_none.return_value = mock_admin_user

        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0

        mock_logs_result = MagicMock()
        mock_logs_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_admin_result,
            mock_count_result,
            mock_logs_result,
        ])

        with patch("app.api.v1.admin.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await list_audit_logs(
                page=1,
                page_size=50,
                action="user_created",
                username="admin",
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert result.total == 0
        assert len(result.logs) == 0


# ============ Test Password Validation ============

class TestPasswordValidation:
    """Test password validation in schemas."""

    def test_valid_password_accepted(self):
        """Valid password should be accepted."""
        from app.schemas.admin import UserAdminCreate

        user = UserAdminCreate(
            username="testuser",
            password="SecurePass123!",
            role_id="analyst"
        )
        assert user.password == "SecurePass123!"

    def test_short_password_rejected(self):
        """Password shorter than 8 chars should be rejected."""
        from app.schemas.admin import UserAdminCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            UserAdminCreate(
                username="testuser",
                password="Short1!",
                role_id="analyst"
            )

        assert "at least 8 characters" in str(exc_info.value)

    def test_password_without_uppercase_rejected(self):
        """Password without uppercase should be rejected."""
        from app.schemas.admin import UserAdminCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            UserAdminCreate(
                username="testuser",
                password="lowercase123!",
                role_id="analyst"
            )

        assert "uppercase" in str(exc_info.value)

    def test_password_without_special_char_rejected(self):
        """Password without special char should be rejected."""
        from app.schemas.admin import UserAdminCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            UserAdminCreate(
                username="testuser",
                password="Password123",
                role_id="analyst"
            )

        assert "special character" in str(exc_info.value)

    def test_invalid_username_rejected(self):
        """Username with invalid chars should be rejected."""
        from app.schemas.admin import UserAdminCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            UserAdminCreate(
                username="user@invalid",
                password="SecurePass123!",
                role_id="analyst"
            )

        assert "letters, numbers" in str(exc_info.value)
