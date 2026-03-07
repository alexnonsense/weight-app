import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  // Verify the requesting user is the admin
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Service role client — bypasses RLS
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all data in parallel
  const [
    { data: { users: authUsers } },
    { data: profiles },
    { data: subscriptions },
    { data: meals },
    { data: steps },
    { data: weights },
    { data: exercises },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('user_profiles').select('user_id, goal_mode, loss_rate_tier, created_at'),
    admin.from('subscriptions').select('user_id, status'),
    admin.from('meal_entries').select('user_id, date'),
    admin.from('step_logs').select('user_id, date'),
    admin.from('weight_logs').select('user_id, date'),
    admin.from('exercise_logs').select('user_id, date'),
  ])

  // Build per-user activity maps
  const allActivity: Record<string, Set<string>> = {}
  for (const row of [...(meals ?? []), ...(steps ?? []), ...(weights ?? []), ...(exercises ?? [])]) {
    if (!allActivity[row.user_id]) allActivity[row.user_id] = new Set()
    allActivity[row.user_id].add(row.date)
  }

  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 6)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))
  const subMap = Object.fromEntries((subscriptions ?? []).map(s => [s.user_id, s]))

  const rows = (authUsers ?? []).map(u => {
    const profile = profileMap[u.id]
    const sub = subMap[u.id]
    const dates = allActivity[u.id] ?? new Set()
    const lastActive = dates.size > 0 ? Array.from(dates).sort().at(-1) : null
    const activeLast7 = Array.from(dates).filter(d => d >= sevenDaysAgoStr).length
    const signedUpAt = u.created_at
    const daysSinceSignup = Math.floor((Date.now() - new Date(signedUpAt).getTime()) / 86400000)

    return {
      id: u.id,
      email: u.email,
      signedUpAt,
      daysSinceSignup,
      goalMode: profile?.goal_mode ?? null,
      lossTier: profile?.loss_rate_tier ?? null,
      lastActive,
      activeLast7,
      subscriptionStatus: sub?.status ?? null,
    }
  })

  // Sort: most recently signed up first
  rows.sort((a, b) => new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime())

  return NextResponse.json(rows)
}
