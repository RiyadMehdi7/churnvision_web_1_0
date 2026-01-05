import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService, PermissionsByResource, RoleWithPermissions, PermissionResponse } from '../../services/adminService';
import { Shield, Check, X } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';

export function AdminRoles() {
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminService.getRoles(),
  });

  const { data: permissionsByResource, isLoading: permissionsLoading } = useQuery({
    queryKey: ['admin-permissions-by-resource'],
    queryFn: () => adminService.getPermissionsByResource(),
  });

  const isLoading = rolesLoading || permissionsLoading;

  const getRoleDescription = (roleId: string) => {
    switch (roleId) {
      case 'super_admin': return 'Full system access - can see and do everything';
      case 'admin': return 'User and credential management only';
      case 'analyst': return 'Full access to data, models, and features';
      case 'hr': return 'Access to employees, treatments, AI chat';
      default: return '';
    }
  };

  const getRoleBadgeColor = (roleId: string) => {
    switch (roleId) {
      case 'super_admin': return 'bg-red-500/15 text-red-600 border-red-500/30';
      case 'admin': return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      case 'analyst': return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      case 'hr': return 'bg-green-500/15 text-green-600 border-green-500/30';
      default: return 'bg-gray-500/15 text-gray-600 border-gray-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role Cards */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">System Roles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles?.map((role: RoleWithPermissions) => (
            <div
              key={role.role_id}
              className="bg-background rounded-lg border border-border p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn('p-2 rounded-lg', getRoleBadgeColor(role.role_id))}>
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{role.role_name}</h4>
                    <p className="text-xs text-neutral-muted">{role.role_id}</p>
                  </div>
                </div>
                {role.is_system_role && (
                  <span className="text-xs px-2 py-1 bg-surface-subtle rounded-full text-neutral-muted">
                    System
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-muted mb-3">
                {role.description || getRoleDescription(role.role_id)}
              </p>
              <div className="text-xs text-neutral-muted">
                {role.permissions.length} permissions
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Permission Matrix */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Permission Matrix</h3>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-subtle border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted sticky left-0 bg-surface-subtle z-10 min-w-[200px]">
                    Permission
                  </th>
                  {roles?.map((role: RoleWithPermissions) => (
                    <th
                      key={role.role_id}
                      className="text-center px-4 py-3 text-sm font-medium text-neutral-muted min-w-[100px]"
                    >
                      <span className={cn('px-2 py-1 rounded-full text-xs', getRoleBadgeColor(role.role_id))}>
                        {role.role_name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionsByResource?.map((group: PermissionsByResource) => (
                  <React.Fragment key={group.resource_type}>
                    {/* Resource Type Header */}
                    <tr className="bg-surface-subtle/50">
                      <td
                        colSpan={(roles?.length || 0) + 1}
                        className="px-4 py-2 text-xs font-semibold text-neutral-muted uppercase tracking-wider sticky left-0 bg-surface-subtle/50"
                      >
                        {group.resource_type}
                      </td>
                    </tr>
                    {/* Permissions */}
                    {group.permissions.map((permission: PermissionResponse) => (
                      <tr key={permission.permission_id} className="border-b border-border hover:bg-surface-subtle/30">
                        <td className="px-4 py-2 sticky left-0 bg-background z-10">
                          <div>
                            <p className="text-sm text-foreground">{permission.permission_name}</p>
                            <p className="text-xs text-neutral-muted">{permission.permission_id}</p>
                          </div>
                        </td>
                        {roles?.map((role: RoleWithPermissions) => (
                          <td key={role.role_id} className="text-center px-4 py-2">
                            {role.permissions.includes(permission.permission_id) ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-red-400/50 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
