import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService, AuditLogResponse } from '../../services/adminService';
import { Search, RefreshCw, Filter } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';

export function AdminAuditLogs() {
  const [page, setPage] = useState(1);
  const [username, setUsername] = useState('');
  const [action, setAction] = useState<string>('all');
  const [resourceType, setResourceType] = useState<string>('all');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-audit-logs', page, username, action, resourceType],
    queryFn: () => adminService.getAuditLogs({
      page,
      page_size: 50,
      username: username || undefined,
      action: action !== 'all' ? action : undefined,
      resource_type: resourceType !== 'all' ? resourceType : undefined,
    }),
  });

  const getActionColor = (actionName: string) => {
    if (actionName.includes('create') || actionName.includes('created')) return 'text-green-600 bg-green-500/10';
    if (actionName.includes('update') || actionName.includes('updated')) return 'text-blue-600 bg-blue-500/10';
    if (actionName.includes('delete') || actionName.includes('deleted')) return 'text-red-600 bg-red-500/10';
    if (actionName.includes('login')) return 'text-purple-600 bg-purple-500/10';
    if (actionName.includes('password') || actionName.includes('reset')) return 'text-amber-600 bg-amber-500/10';
    return 'text-gray-600 bg-gray-500/10';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
    };
  };

  // Extract unique actions from data for filter
  const uniqueActions = data?.logs
    ? [...new Set(data.logs.map((log: AuditLogResponse) => log.action))]
    : [];

  const uniqueResourceTypes = data?.logs
    ? [...new Set(data.logs.map((log: AuditLogResponse) => log.resource_type).filter(Boolean))]
    : [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-muted" />
            <Input
              placeholder="Filter by username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="user_created">User Created</SelectItem>
              <SelectItem value="user_updated">User Updated</SelectItem>
              <SelectItem value="user_deleted">User Deleted</SelectItem>
              <SelectItem value="password_reset">Password Reset</SelectItem>
              <SelectItem value="login">Login</SelectItem>
            </SelectContent>
          </Select>
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Resource" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Resources</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="role">Role</SelectItem>
              <SelectItem value="data">Data</SelectItem>
              <SelectItem value="model">Model</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Logs Table */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-subtle border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Timestamp</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">User</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Action</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Resource</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neutral-muted">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3"><Skeleton className="h-8 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-6 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-6 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-6 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-6 w-40" /></td>
                  </tr>
                ))
              ) : data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-muted">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                data?.logs.map((log: AuditLogResponse) => {
                  const { date, time } = formatTimestamp(log.timestamp);
                  return (
                    <tr key={log.id} className="border-b border-border hover:bg-surface-subtle/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-foreground">{date}</p>
                          <p className="text-xs text-neutral-muted">{time}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">
                          {log.username || `User #${log.user_id}` || 'System'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'px-2 py-1 text-xs font-medium rounded-full',
                          getActionColor(log.action)
                        )}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.resource_type && (
                          <div>
                            <span className="text-sm text-foreground capitalize">
                              {log.resource_type}
                            </span>
                            {log.resource_id && (
                              <p className="text-xs text-neutral-muted font-mono">
                                {log.resource_id.substring(0, 8)}...
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {log.ip_address && (
                            <span className="text-xs text-neutral-muted">
                              IP: {log.ip_address}
                            </span>
                          )}
                          {log.status_code && (
                            <span className={cn(
                              'text-xs',
                              log.status_code >= 400 ? 'text-red-500' : 'text-green-500'
                            )}>
                              Status: {log.status_code}
                            </span>
                          )}
                          {log.error_message && (
                            <span className="text-xs text-red-500 truncate max-w-[200px]" title={log.error_message}>
                              {log.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-neutral-muted">
            Page {page} of {data.total_pages} ({data.total} total logs)
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
              onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
              disabled={page === data.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
