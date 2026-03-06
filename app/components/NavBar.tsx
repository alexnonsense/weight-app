'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar() {
  const pathname = usePathname()
  const isToday = pathname === '/dashboard'
  const isProgress = pathname === '/progress'

  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-1">
        <NavTab href="/dashboard" label="Today" active={isToday} />
        <NavTab href="/progress" label="Progress" active={isProgress} />
      </div>
      <Link
        href="/profile"
        className="text-sm text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
      >
        Profile
      </Link>
    </div>
  )
}

function NavTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
        active
          ? 'bg-[#111827] text-white'
          : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]'
      }`}
    >
      {label}
    </Link>
  )
}
