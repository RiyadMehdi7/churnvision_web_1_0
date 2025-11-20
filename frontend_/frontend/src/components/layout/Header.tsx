import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../utils/cn'
import { Bot, Lock } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Home, Beaker, Settings as SettingsIcon, Database } from 'lucide-react'
import { useLicense, getLicenseTierDisplayName, getLicenseTierColor } from '../../providers/LicenseProvider'

const allNavigation = [
  { name: 'Home', href: '/', icon: Home, feature: 'home' },
  { name: 'AI Assistant', href: '/ai-assistant', icon: Bot, feature: 'ai-assistant' },
  { name: 'Playground', href: '/playground', icon: Beaker, feature: 'playground' },
  { name: 'Data Management', href: '/data-management', icon: Database, feature: 'data-management' },
  { name: 'Settings', href: '/settings', icon: SettingsIcon, feature: 'settings' },
]

export function Header(): React.ReactElement {
  const location = useLocation()
  const { hasAccess, licenseTier } = useLicense()

  // Filter navigation based on license access
  const navigation = allNavigation.filter(item => hasAccess(item.feature))

  return (
    <header className="cv-surface-elevated sticky top-0 z-40 backdrop-blur transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <svg className="h-8 w-auto text-app-green" />
              <span className="ml-2 text-xl font-bold text-foreground">ChurnVision</span>
            </Link>
            <nav className="hidden md:ml-10 md:flex md:space-x-8">
              {navigation.map((item) => {
                const hasItemAccess = hasAccess(item.feature)
                return (
                  <Link
                    key={item.name}
                    to={hasItemAccess ? item.href : '#'}
                    className={cn(
                      'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium relative transition-colors',
                      hasItemAccess ? (
                        location.pathname === item.href
                          ? 'border-app-green text-foreground'
                          : 'border-transparent text-neutral-muted hover:border-border hover:text-foreground'
                      ) : 'border-transparent text-neutral-subtle cursor-not-allowed'
                    )}
                    aria-current={location.pathname === item.href ? 'page' : undefined}
                    onClick={!hasItemAccess ? (e) => e.preventDefault() : undefined}
                  >
                    <item.icon className="mr-1 h-5 w-5" aria-hidden="true" />
                    {item.name}
                    {!hasItemAccess && (
                      <Lock className="ml-1 h-3 w-3" aria-hidden="true" />
                    )}
                    {item.name === 'Playground' && hasItemAccess && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/30">
                        Beta
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {/* License Tier Badge */}
            <div className={cn(
              'px-2 py-1 text-xs font-medium rounded-md border border-border bg-surface-muted text-neutral',
              getLicenseTierColor(licenseTier)
            )}>
              {getLicenseTierDisplayName(licenseTier)}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
} 
