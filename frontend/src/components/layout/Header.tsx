import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Bot, Lock, LogOut, Shield } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Home, Beaker, Settings as SettingsIcon, Database, BookOpen } from 'lucide-react'
import { useLicense, getLicenseTierDisplayName, getLicenseTierColor } from '../../providers/LicenseProvider'
import { useAuth } from '../../contexts/AuthContext'
import { AlertNotificationBell } from '../AlertNotificationBell'

const allNavigation = [
  { name: 'Home', href: '/', icon: Home, feature: 'home' },
  { name: 'AI Assistant', href: '/ai-assistant', icon: Bot, feature: 'ai-assistant' },
  { name: 'Playground', href: '/playground', icon: Beaker, feature: 'playground' },
  { name: 'Data Management', href: '/data-management', icon: Database, feature: 'data-management' },
  { name: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen, feature: 'knowledge-base' },
  { name: 'Settings', href: '/settings', icon: SettingsIcon, feature: 'settings' },
]

// Admin navigation item - shown separately
const adminNavItem = { name: 'Admin', href: '/admin', icon: Shield }

export function Header(): React.ReactElement {
  const location = useLocation()
  const navigate = useNavigate()
  const { hasAccess, licenseTier } = useLicense()
  const { user, logout, hasAdminAccess } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  // Filter navigation based on license access
  const navigation = allNavigation.filter(item => hasAccess(item.feature))

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo */}
          <Link to="/" className="flex items-center">
            <span className="text-xl font-bold text-foreground">ChurnVision</span>
          </Link>

          {/* Center: Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const hasItemAccess = hasAccess(item.feature)
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={hasItemAccess ? item.href : '#'}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200',
                    hasItemAccess ? (
                      isActive
                        ? 'text-foreground bg-surface-muted'
                        : 'text-neutral-muted hover:text-foreground hover:bg-surface-muted'
                    ) : 'text-neutral-subtle cursor-not-allowed'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={!hasItemAccess ? (e) => e.preventDefault() : undefined}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.name}</span>
                  {!hasItemAccess && (
                    <Lock className="h-3 w-3 opacity-50" aria-hidden="true" />
                  )}
                  {item.name === 'Playground' && hasItemAccess && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-app-green/15 text-app-green rounded">
                      Beta
                    </span>
                  )}
                </Link>
              )
            })}
            {/* Admin link - only shown for users with admin access */}
            {hasAdminAccess && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <Link
                  to={adminNavItem.href}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200',
                    location.pathname === adminNavItem.href
                      ? 'text-foreground bg-surface-muted'
                      : 'text-neutral-muted hover:text-foreground hover:bg-surface-muted'
                  )}
                  aria-current={location.pathname === adminNavItem.href ? 'page' : undefined}
                >
                  <adminNavItem.icon className="h-4 w-4" aria-hidden="true" />
                  <span>{adminNavItem.name}</span>
                </Link>
              </>
            )}
          </nav>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            <div className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-full border border-border bg-surface-muted',
              getLicenseTierColor(licenseTier)
            )}>
              {getLicenseTierDisplayName(licenseTier)}
            </div>
            <AlertNotificationBell />
            <ThemeToggle />

            {/* User Menu */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-surface-muted border border-border flex items-center justify-center">
                    <span className="text-foreground text-xs font-medium">
                      {(user.full_name || user.username || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-foreground">{user.username}</span>
                </button>

                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-surface-elevated border border-border z-20 overflow-hidden">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium text-foreground">{user.full_name || user.username}</p>
                        <p className="text-xs text-neutral-muted mt-0.5">{user.email}</p>
                      </div>
                      <div className="p-1.5">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-muted hover:text-foreground hover:bg-surface-muted rounded-lg transition-colors"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
} 
