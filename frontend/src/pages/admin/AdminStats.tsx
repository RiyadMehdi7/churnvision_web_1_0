import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';
import { Users, UserCheck, UserX, Shield } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';

export function AdminStats() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminService.getStats(),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Failed to load statistics
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Users',
      value: stats?.total_users ?? 0,
      icon: Users,
      color: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Active Users',
      value: stats?.active_users ?? 0,
      icon: UserCheck,
      color: 'text-green-500 bg-green-500/10',
    },
    {
      label: 'Inactive Users',
      value: stats?.inactive_users ?? 0,
      icon: UserX,
      color: 'text-amber-500 bg-amber-500/10',
    },
    {
      label: 'Roles',
      value: Object.keys(stats?.users_by_role ?? {}).length,
      icon: Shield,
      color: 'text-purple-500 bg-purple-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-background rounded-lg border border-border p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-muted">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Users by Role */}
      {stats?.users_by_role && Object.keys(stats.users_by_role).length > 0 && (
        <div className="bg-background rounded-lg border border-border p-4">
          <h3 className="text-lg font-semibold text-foreground mb-4">Users by Role</h3>
          <div className="space-y-3">
            {Object.entries(stats.users_by_role).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-neutral-muted" />
                  <span className="text-foreground capitalize">{role.replace('_', ' ')}</span>
                </div>
                <span className="text-sm font-medium text-neutral-muted">
                  {count} {count === 1 ? 'user' : 'users'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
