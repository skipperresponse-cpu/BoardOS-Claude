'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  CalendarDays,
  CheckSquare,
  Vote,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/ask', label: 'Ask AI', icon: MessageSquare },
  { href: '/meetings', label: 'Meetings', icon: CalendarDays },
  { href: '/action-items', label: 'Action Items', icon: CheckSquare },
  { href: '/approvals', label: 'Approvals', icon: Vote },
]

interface SidebarProps {
  userRole: UserRole
  userName: string
}

function NavContent({
  userRole,
  userName,
  pathname,
  onNavClick,
  onSignOut,
}: {
  userRole: UserRole
  userName: string
  pathname: string
  onNavClick?: () => void
  onSignOut: () => void
}) {
  return (
    <>
      <Link href="/dashboard" className="flex items-center px-6 py-4 border-b border-slate-700 hover:bg-slate-800 transition-colors">
        <Image
          src="/nrcs-logo.png"
          alt="NRCS"
          width={48}
          height={48}
          className="rounded"
          priority
        />
        <div className="ml-3">
          <p className="text-sm font-bold tracking-tight leading-tight">BoardOS</p>
          <p className="text-xs text-slate-400 leading-tight">Governance Portal</p>
        </div>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}

        {userRole === 'admin' && (
          <Link
            href="/admin"
            onClick={onNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Admin
          </Link>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400 capitalize">{userRole.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  )
}

export function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-slate-900 text-white flex items-center px-4 gap-3 border-b border-slate-700">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/nrcs-logo.png" alt="NRCS" width={32} height={32} className="rounded" priority />
          <span className="text-base font-bold tracking-tight">BoardOS</span>
        </Link>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          {/* Panel */}
          <div className="relative flex flex-col w-72 max-w-[85vw] bg-slate-900 text-white h-full shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <NavContent
              userRole={userRole}
              userName={userName}
              pathname={pathname}
              onNavClick={() => setMobileOpen(false)}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-slate-900 text-white flex-shrink-0">
        <NavContent
          userRole={userRole}
          userName={userName}
          pathname={pathname}
          onSignOut={handleSignOut}
        />
      </aside>
    </>
  )
}
