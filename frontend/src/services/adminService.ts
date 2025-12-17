import api from './apiService';

const ADMIN_ENDPOINT = '/admin';

// ============ Types ============

export interface RoleBase {
  role_id: string;
  role_name: string;
  description: string | null;
}

export interface RoleResponse extends RoleBase {
  is_system_role: boolean;
  created_at: string | null;
}

export interface RoleWithPermissions extends RoleResponse {
  permissions: string[];
}

export interface PermissionResponse {
  permission_id: string;
  permission_name: string;
  description: string | null;
  resource_type: string;
  action: string;
}

export interface PermissionsByResource {
  resource_type: string;
  permissions: PermissionResponse[];
}

export interface UserAdminResponse {
  user_id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
  role: RoleBase | null;
}

export interface UserWithRole extends UserAdminResponse {
  permissions: string[];
}

export interface UserListResponse {
  users: UserAdminResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserCreateData {
  username: string;
  email?: string;
  full_name?: string;
  password: string;
  role_id: string;
}

export interface UserUpdateData {
  email?: string;
  full_name?: string;
  is_active?: boolean;
  role_id?: string;
}

export interface AuditLogResponse {
  id: number;
  timestamp: string;
  user_id: number | null;
  username: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  method: string | null;
  endpoint: string | null;
  ip_address: string | null;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
}

export interface AuditLogListResponse {
  logs: AuditLogResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  users_by_role: Record<string, number>;
}

export interface UserListParams {
  page?: number;
  page_size?: number;
  search?: string;
  role_id?: string;
  is_active?: boolean;
}

export interface AuditLogParams {
  page?: number;
  page_size?: number;
  action?: string;
  user_id?: number;
  username?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}

// SSO Configuration Types
export interface SSOConfigResponse {
  id: number;
  enabled: boolean;
  provider: string;
  issuer_url: string | null;
  client_id: string | null;
  has_client_secret: boolean;
  redirect_uri: string | null;
  scopes: string;
  auto_create_users: boolean;
  default_role: string;
  admin_groups: string | null;
  session_lifetime: number;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  last_test_at: string | null;
  last_test_success: boolean | null;
  last_test_error: string | null;
}

export interface SSOConfigUpdate {
  enabled: boolean;
  provider: string;
  issuer_url?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  redirect_uri?: string | null;
  scopes?: string;
  auto_create_users?: boolean;
  default_role?: string;
  admin_groups?: string | null;
  session_lifetime?: number;
}

export interface SSOTestResult {
  success: boolean;
  message: string;
  issuer_info?: {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
  };
}

// ============ Admin Service ============

class AdminService {
  // Stats
  async getStats(): Promise<AdminStats> {
    const response = await api.get<AdminStats>(`${ADMIN_ENDPOINT}/stats`);
    return response.data;
  }

  // Users
  async getUsers(params: UserListParams = {}): Promise<UserListResponse> {
    const response = await api.get<UserListResponse>(`${ADMIN_ENDPOINT}/users`, { params });
    return response.data;
  }

  async getUser(userId: string): Promise<UserWithRole> {
    const response = await api.get<UserWithRole>(`${ADMIN_ENDPOINT}/users/${userId}`);
    return response.data;
  }

  async createUser(data: UserCreateData): Promise<UserAdminResponse> {
    const response = await api.post<UserAdminResponse>(`${ADMIN_ENDPOINT}/users`, data);
    return response.data;
  }

  async updateUser(userId: string, data: UserUpdateData): Promise<UserAdminResponse> {
    const response = await api.put<UserAdminResponse>(`${ADMIN_ENDPOINT}/users/${userId}`, data);
    return response.data;
  }

  async deleteUser(userId: string): Promise<void> {
    await api.delete(`${ADMIN_ENDPOINT}/users/${userId}`);
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    await api.post(`${ADMIN_ENDPOINT}/users/${userId}/reset-password`, {
      new_password: newPassword,
    });
  }

  // Roles
  async getRoles(): Promise<RoleWithPermissions[]> {
    const response = await api.get<RoleWithPermissions[]>(`${ADMIN_ENDPOINT}/roles`);
    return response.data;
  }

  async getRole(roleId: string): Promise<RoleWithPermissions> {
    const response = await api.get<RoleWithPermissions>(`${ADMIN_ENDPOINT}/roles/${roleId}`);
    return response.data;
  }

  // Permissions
  async getPermissions(): Promise<PermissionResponse[]> {
    const response = await api.get<PermissionResponse[]>(`${ADMIN_ENDPOINT}/permissions`);
    return response.data;
  }

  async getPermissionsByResource(): Promise<PermissionsByResource[]> {
    const response = await api.get<PermissionsByResource[]>(`${ADMIN_ENDPOINT}/permissions/by-resource`);
    return response.data;
  }

  // Audit Logs
  async getAuditLogs(params: AuditLogParams = {}): Promise<AuditLogListResponse> {
    const response = await api.get<AuditLogListResponse>(`${ADMIN_ENDPOINT}/audit-logs`, { params });
    return response.data;
  }

  // SSO Configuration
  async getSSOConfig(): Promise<SSOConfigResponse> {
    const response = await api.get<SSOConfigResponse>(`${ADMIN_ENDPOINT}/sso/config`);
    return response.data;
  }

  async updateSSOConfig(data: SSOConfigUpdate): Promise<SSOConfigResponse> {
    const response = await api.put<SSOConfigResponse>(`${ADMIN_ENDPOINT}/sso/config`, data);
    return response.data;
  }

  async testSSOConnection(): Promise<SSOTestResult> {
    const response = await api.post<SSOTestResult>(`${ADMIN_ENDPOINT}/sso/test`);
    return response.data;
  }

  async disableSSO(): Promise<void> {
    await api.delete(`${ADMIN_ENDPOINT}/sso/config`);
  }
}

export const adminService = new AdminService();
