'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type UserRow = {
  id: string
  email: string
  signedUpAt: string
  daysSinceSignup: number
  goalMode: 'lose_weight' | 'gain_muscle' | null
  lossTier: string | null
  lastActive: string | null
  activeLast7: number
  subscriptionStatus: 'active' | 'trialing' | 'canceled' | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function DaysBadge({ days }: { days: number }) {
  const color =
    days >= 30 ? 'bg-red-100 text-red-700' :
    days >= 21 ? 'bg-amber-100 text-amber-700' :
    'bg-[#F3F4F6] text-[#6B7280]'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>Day {days}</span>
}

function SubBadge({ status }: { status: UserRow['subscriptionStatus'] }) {
  if (status === 'active') return <span className="text-[#059669] font-medium text-xs">✓ Paid</span>
  if (status === 'canceled') return <span className="text-[#DC2626] text-xs">✗ Canceled</span>
  return <span className="text-[#9CA3AF] text-xs">— Free trial</span>
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const res = await fetch('/api/admin/users')
      if (res.status === 403) { router.push('/dashboard'); return }
      if (!res.ok) { setError('Failed to load user data'); setLoading(false); return }

      setUsers(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  const totalUsers = users.length
  const paidUsers = users.filter(u => u.subscriptionStatus === 'active').length
  const approaching = users.filter(u => u.daysSinceSignup >= 21 && u.subscriptionStatus !== 'active').length
  const activeToday = users.filter(u => u.lastActive === new Date().toISOString().split('T')[0]).length

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#111827]">Admin</h1>
        <span className="text-xs text-[#9CA3AF]">alex@abe-bio.com</span>
      </div>

      {loading ? (
        <p className="text-sm text-[#6B7280] text-center py-16">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-16">{error}</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total users', value: totalUsers },
              { label: 'Paid', value: paidUsers },
              { label: 'Approaching 30d', value: approaching },
              { label: 'Active today', value: activeToday },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-[#E5E7EB] rounded-xl p-4">
                <p className="text-2xl font-bold text-[#111827]">{value}</p>
                <p className="text-xs text-[#9CA3AF] mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* User table */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F3F4F6] text-left">
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">Email</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">Signed up</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">Trial</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">Goal</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">Last active</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">7d logs</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9CA3AF]">Subscription</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={`border-b border-[#F9FAFB] ${i % 2 === 0 ? '' : 'bg-[#FAFAFA]'}`}>
                      <td className="px-4 py-3 text-[#111827] font-medium">{u.email}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{fmtDate(u.signedUpAt)}</td>
                      <td className="px-4 py-3"><DaysBadge days={u.daysSinceSignup} /></td>
                      <td className="px-4 py-3 text-[#6B7280] capitalize">
                        {u.goalMode === 'lose_weight' ? 'Lose weight' : u.goalMode === 'gain_muscle' ? 'Gain muscle' : '—'}
                        {u.lossTier && <span className="text-xs text-[#9CA3AF] ml-1">({u.lossTier})</span>}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">{u.lastActive ? fmtDate(u.lastActive) : '—'}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{u.activeLast7}/7</td>
                      <td className="px-4 py-3"><SubBadge status={u.subscriptionStatus} /></td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[#9CA3AF] text-sm">No users yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
