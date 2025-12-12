import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, UserAdminResponse, RoleWithPermissions } from '../../services/adminService';
import { useToast } from '../../hooks/use-toast';
import { Plus, Search, MoreVertical, UserCheck, UserX, Key, Trash2, Edit } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';

export function AdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAdminResponse | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role_id: 'analyst',
  });
  const [newPassword, setNewPassword] = useState('');

  // Queries
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', page, search, roleFilter, statusFilter],
    queryFn: () => adminService.getUsers({
      page,
      page_size: 20,
      search: search || undefined,
      role_id: roleFilter !== 'all' ? roleFilter : undefined,
      is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
    }),
  });

  const { data: roles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminService.getRoles(),
  });

  // Helper to extract error message from API response
  const getErrorMessage = (error: any): string => {
    if (error?.response?.data?.detail) {
      const detail = error.response.data.detail;
      if (Array.isArray(detail)) {
        return detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ');
      }
      if (typeof detail === 'string') return detail;
    }
    return error?.message || 'An error occurred';
  };

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: adminService.createUser.bind(adminService),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setIsCreateOpen(false);
      setFormData({ username: '', email: '', full_name: '', password: '', role_id: 'analyst' });
      toast({ title: 'User created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create user', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Parameters<typeof adminService.updateUser>[1] }) =>
      adminService.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setIsEditOpen(false);
      setSelectedUser(null);
      toast({ title: 'User updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update user', description: error.message, variant: 'destructive' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: adminService.deleteUser.bind(adminService),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({ title: 'User deactivated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to deactivate user', description: error.message, variant: 'destructive' });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      adminService.resetUserPassword(userId, password),
    onSuccess: () => {
      setIsResetPasswordOpen(false);
      setSelectedUser(null);
      setNewPassword('');
      toast({ title: 'Password reset successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to reset password', description: error.message, variant: 'destructive' });
    },
  });

  const handleCreateUser = () => {
    createUserMutation.mutate(formData);
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;
    updateUserMutation.mutate({
      userId: selectedUser.user_id,
      data: {
        email: formData.email || undefined,
        full_name: formData.full_name || undefined,
        role_id: formData.role_id,
      },
    });
  };

  const handleResetPassword = () => {
    if (!selectedUser) return;
    resetPasswordMutation.mutate({ userId: selectedUser.user_id, password: newPassword });
  };

  const openEditDialog = (user: UserAdminResponse) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      full_name: user.full_name || '',
      password: '',
      role_id: user.role?.role_id || 'analyst',
    });
    setIsEditOpen(true);
  };

  const getRoleBadgeColor = (roleId: string) => {
    switch (roleId) {
      case 'super_admin': return 'bg-red-500/15 text-red-600';
      case 'admin': return 'bg-orange-500/15 text-orange-600';
      case 'analyst': return 'bg-blue-500/15 text-blue-600';
      case 'hr': return 'bg-green-500/15 text-green-600';
      default: return 'bg-gray-500/15 text-gray-600';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-muted" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles?.map((role) => (
                <SelectItem key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Users Table */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-subtle border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">User</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Role</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Last Login</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-neutral-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3"><Skeleton className="h-10 w-48" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-6 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-6 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-6 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
                </tr>
              ))
            ) : usersData?.users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-muted">
                  No users found
                </td>
              </tr>
            ) : (
              usersData?.users.map((user) => (
                <tr key={user.user_id} className="border-b border-border hover:bg-surface-subtle/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-surface-muted border border-border flex items-center justify-center">
                        <span className="text-sm font-medium text-foreground">
                          {(user.full_name || user.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{user.full_name || user.username}</p>
                        <p className="text-xs text-neutral-muted">{user.email || user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.role && (
                      <span className={cn('px-2 py-1 text-xs font-medium rounded-full', getRoleBadgeColor(user.role.role_id))}>
                        {user.role.role_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full',
                      user.is_active ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-600'
                    )}>
                      {user.is_active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-muted">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        disabled={user.is_super_admin}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setIsResetPasswordOpen(true);
                        }}
                        disabled={user.is_super_admin}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Deactivate user ${user.username}?`)) {
                            deleteUserMutation.mutate(user.user_id);
                          }
                        }}
                        disabled={user.is_super_admin || !user.is_active}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {usersData && usersData.total_pages > 1 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-neutral-muted">
            Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, usersData.total)} of {usersData.total} users
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(usersData.total_pages, p + 1))}
              disabled={page === usersData.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="johndoe"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="e.g., MyPass1@"
              />
              <p className="text-xs text-neutral-muted">
                Min 8 characters with uppercase, lowercase, number, and special character (!@#$%^&amp;*)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={formData.role_id} onValueChange={(v) => setFormData({ ...formData, role_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.role_id} value={role.role_id}>
                      {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateUser}
              disabled={!formData.username || !formData.password || createUserMutation.isPending}
            >
              {createUserMutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={formData.username} disabled />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formData.role_id} onValueChange={(v) => setFormData({ ...formData, role_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.role_id} value={role.role_id}>
                      {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {selectedUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, uppercase, lowercase, number, special"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>Cancel</Button>
            <Button
              onClick={handleResetPassword}
              disabled={!newPassword || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
