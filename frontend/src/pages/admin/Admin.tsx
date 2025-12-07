import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Users, Shield, ScrollText, BarChart3 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { AdminUsers } from './AdminUsers';
import { AdminRoles } from './AdminRoles';
import { AdminAuditLogs } from './AdminAuditLogs';
import { AdminStats } from './AdminStats';

type TabType = 'stats' | 'users' | 'roles' | 'logs';

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'stats', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'logs', label: 'Audit Logs', icon: ScrollText },
];

export function Admin() {
  const { hasAdminAccess, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('stats');

  // Redirect if no admin access
  if (!isLoading && !hasAdminAccess) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Administration</h1>
        <p className="text-neutral-muted mt-1">Manage users, roles, and view system activity</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px',
              activeTab === tab.id
                ? 'text-foreground bg-surface-muted border border-border border-b-transparent'
                : 'text-neutral-muted hover:text-foreground hover:bg-surface-subtle'
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-surface-muted rounded-lg border border-border p-6">
        {activeTab === 'stats' && <AdminStats />}
        {activeTab === 'users' && <AdminUsers />}
        {activeTab === 'roles' && <AdminRoles />}
        {activeTab === 'logs' && <AdminAuditLogs />}
      </div>
    </div>
  );
}

export default Admin;
