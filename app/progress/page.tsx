'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import { buildDailySeries, DailyPoint, TIER_CONFIG, LossTier, WEIGHT_LOSS_MIN_PROTEIN_PER_KG } from '@/lib/calculations'
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts'

type Profile = {
  starting_weight_kg: number
  bmr: number
  goal_mode: 'lose_weight' | 'gain_muscle' | null
  daily_deficit_target: number | null
  target_weight_kg: number | null
  loss_rate_tier: string | null
  protein_target_g: number | null
  bmr_calculated_at: string
}

type Range = '7d' | '30d' | '3m' | 'all'

function cutoffDate(range: Range): string {
  const d = new Date()
  if (range === '7d') d.setDate(d.getDate() - 6)
  if (range === '30d') d.setDate(d.getDate() - 30)
  if (range === '3m') d.setMonth(d.getMonth() - 3)
  return d.toISOString().split('T')[0]
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cursor = new Date(from)
  const end = new Date(to)
  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function fmtDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function WeightTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const expected = payload.find((p: any) => p.dataKey === 'expected')?.value
  const actual = payload.find((p: any) => p.dataKey === 'actual')?.value
  const trajectory = payload.find((p: any) => p.dataKey === 'trajectory')?.value
  if (expected == null && actual == null && trajectory == null) return null
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-[#111827] mb-1">{label}</p>
      {expected != null && (
        <p className="text-[#6B7280]">Expected: <span className="font-semibold text-[#111827]">{expected} kg</span></p>
      )}
      {actual != null && (
        <p className="text-[#4F46E5]">Actual: <span className="font-semibold">{actual} kg</span></p>
      )}
      {trajectory != null && (
        <p className="text-[#7C3AED]">Target pace: <span className="font-semibold">{trajectory} kg</span></p>
      )}
    </div>
  )
}

function NetTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const net = payload.find((p: any) => p.dataKey === 'net')?.value
  if (net == null) return null
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-[#111827] mb-1">{label}</p>
      <p className={net < 0 ? 'text-[#059669]' : 'text-[#DC2626]'}>
        Net: <span className="font-semibold">{net > 0 ? '+' : ''}{net} kcal</span>
      </p>
    </div>
  )
}

function ProteinTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const protein = payload.find((p: any) => p.dataKey === 'protein')?.value
  if (protein == null) return null
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-[#111827] mb-1">{label}</p>
      <p className="text-[#6B7280]">Protein: <span className="font-semibold text-[#111827]">{protein}g</span></p>
    </div>
  )
}

export default function ProgressPage() {
  const [series, setSeries] = useState<DailyPoint[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('7d')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [profileRes, mealsRes, stepsRes, exerciseRes, weightRes] = await Promise.all([
        supabase.from('user_profiles')
          .select('starting_weight_kg, bmr, goal_mode, daily_deficit_target, target_weight_kg, loss_rate_tier, protein_target_g, bmr_calculated_at')
          .eq('user_id', user.id).single(),
        supabase.from('meal_entries').select('date, calories, protein_g').eq('user_id', user.id),
        supabase.from('step_logs').select('date, calories_burned').eq('user_id', user.id),
        supabase.from('exercise_logs').select('date, calories_burned').eq('user_id', user.id),
        supabase.from('weight_logs').select('date, actual_weight_kg').eq('user_id', user.id),
      ])

      if (!profileRes.data) { setLoading(false); return }
      setProfile(profileRes.data)

      const mealsByDate: Record<string, number> = {}
      const proteinByDate: Record<string, number> = {}
      for (const m of mealsRes.data ?? []) {
        mealsByDate[m.date] = (mealsByDate[m.date] ?? 0) + m.calories
        proteinByDate[m.date] = (proteinByDate[m.date] ?? 0) + (m.protein_g ?? 0)
      }
      const stepCalsByDate: Record<string, number> = {}
      for (const s of stepsRes.data ?? []) {
        stepCalsByDate[s.date] = (stepCalsByDate[s.date] ?? 0) + s.calories_burned
      }
      const exerciseCalsByDate: Record<string, number> = {}
      for (const e of exerciseRes.data ?? []) {
        exerciseCalsByDate[e.date] = (exerciseCalsByDate[e.date] ?? 0) + e.calories_burned
      }
      const weightByDate: Record<string, number> = {}
      for (const w of weightRes.data ?? []) {
        weightByDate[w.date] = w.actual_weight_kg
      }

      const built = buildDailySeries({
        startingWeightKg: profileRes.data.starting_weight_kg,
        bmr: profileRes.data.bmr,
        mealsByDate,
        stepCalsByDate,
        exerciseCalsByDate,
        weightByDate,
        proteinByDate,
      })

      setSeries(built)
      setLoading(false)
    }
    load()
  }, [])

  // Build a lookup map: date → DailyPoint
  const seriesByDate = useMemo(() => {
    const map: Record<string, DailyPoint> = {}
    for (const p of series) map[p.date] = p
    return map
  }, [series])

  // Compute the display window of dates
  const displayDates = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    if (range === 'all') {
      // Show from first data point to today; if no data, show last 7 days
      const first = series[0]?.date
      if (first) return dateRange(first, today)
      const d = new Date(); d.setDate(d.getDate() - 6)
      return dateRange(d.toISOString().split('T')[0], today)
    }

    const cutoff = cutoffDate(range)
    const first = series[0]?.date

    if (first && first > cutoff) {
      // Data starts within the window: anchor left to first data date,
      // extend right by the same window size so data appears on the left
      const windowDays = dateRange(cutoff, today).length
      const windowEnd = new Date(first)
      windowEnd.setDate(windowEnd.getDate() + windowDays - 1)
      return dateRange(first, windowEnd.toISOString().split('T')[0])
    }

    return dateRange(cutoff, today)
  }, [series, range])

  const trajectoryDay0 = profile?.bmr_calculated_at
    ? profile.bmr_calculated_at.split('T')[0]
    : null

  const kgPerWeek = profile?.loss_rate_tier
    ? (TIER_CONFIG[profile.loss_rate_tier as LossTier]?.kgPerWeek ?? null)
    : null

  const showTrajectory =
    profile?.goal_mode === 'lose_weight' &&
    profile.target_weight_kg != null &&
    trajectoryDay0 != null &&
    kgPerWeek != null

  const weightData = displayDates.map(date => {
    const p = seriesByDate[date]
    let trajectory: number | null = null
    if (showTrajectory && p) {
      const msPerDay = 86400000
      const daysSinceStart = Math.max(0, (new Date(date).getTime() - new Date(trajectoryDay0!).getTime()) / msPerDay)
      const raw = profile!.starting_weight_kg - (daysSinceStart * kgPerWeek! / 7)
      trajectory = Math.round(Math.max(profile!.target_weight_kg!, raw) * 10) / 10
    }
    return {
      date,
      label: fmtDate(date),
      expected: p?.expectedKg ?? null,
      actual: p?.actualKg ?? null,
      trajectory,
    }
  })

  const netData = displayDates.map(date => {
    const p = seriesByDate[date]
    return { date, label: fmtDate(date), net: p?.netCalories ?? null }
  })

  const proteinTarget = profile
    ? profile.goal_mode === 'gain_muscle'
      ? (profile.protein_target_g ?? 0)
      : Math.round(profile.starting_weight_kg * WEIGHT_LOSS_MIN_PROTEIN_PER_KG / 5) * 5
    : 0

  const proteinData = displayDates.map(date => {
    const p = seriesByDate[date]
    return { date, label: fmtDate(date), protein: p?.proteinG ?? null }
  })

  const deficitTarget = profile?.daily_deficit_target ? -profile.daily_deficit_target : null

  const tickInterval = displayDates.length > 60
    ? Math.floor(displayDates.length / 10)
    : displayDates.length > 20 ? 6 : 2

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <NavBar />

      {loading ? (
        <div className="text-center text-[#6B7280] py-16">Loading...</div>
      ) : (
        <>
          {/* Time range toggle */}
          <div className="flex rounded-lg bg-[#F3F4F6] p-1 mb-6 w-fit">
            {(['7d', '30d', '3m', 'all'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  range === r
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#374151]'
                }`}
              >
                {r === '7d' ? '7d' : r === '30d' ? '30d' : r === '3m' ? '3m' : 'All'}
              </button>
            ))}
          </div>

          {/* Weight chart */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-4">
            <p className="text-sm font-semibold text-[#111827] mb-1">Weight</p>
            <p className="text-xs text-[#9CA3AF] mb-4">Expected vs actual (kg)</p>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={weightData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  interval={tickInterval}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={v => `${v}`}
                />
                <Tooltip content={<WeightTooltip />} />
                {showTrajectory && (
                  <Line
                    type="monotone"
                    dataKey="trajectory"
                    stroke="#7C3AED"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    name="Target pace"
                    connectNulls={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="expected"
                  stroke="#6B7280"
                  strokeWidth={1.5}
                  dot={false}
                  name="Expected"
                  connectNulls={false}
                />
                <Scatter
                  dataKey="actual"
                  fill="#4F46E5"
                  name="Actual"
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-[#6B7280]" />
                <span className="text-xs text-[#9CA3AF]">Expected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#4F46E5]" />
                <span className="text-xs text-[#9CA3AF]">Actual</span>
              </div>
              {showTrajectory && (
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-[#7C3AED]" />
                  <span className="text-xs text-[#9CA3AF]">Target pace</span>
                </div>
              )}
            </div>
          </div>

          {/* Net calories chart */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-4">
            <p className="text-sm font-semibold text-[#111827] mb-1">Net calories</p>
            <p className="text-xs text-[#9CA3AF] mb-4">Daily intake minus all burns (kcal)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={netData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  interval={tickInterval}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[
                    (dataMin: number) => Math.min(dataMin, deficitTarget ? deficitTarget - 200 : -700),
                    (dataMax: number) => Math.max(dataMax, 500),
                  ]}
                />
                <Tooltip content={<NetTooltip />} />
                <ReferenceLine y={0} stroke="#E5E7EB" />
                {deficitTarget && (
                  <ReferenceLine
                    y={deficitTarget}
                    stroke="#4F46E5"
                    strokeDasharray="4 3"
                    label={{ value: 'Goal', position: 'insideTopRight', fontSize: 10, fill: '#4F46E5' }}
                  />
                )}
                <Bar dataKey="net" radius={[3, 3, 0, 0]} maxBarSize={20}>
                  {netData.map((entry, i) => (
                    <Cell key={i} fill={entry.net == null ? 'transparent' : entry.net < 0 ? '#059669' : '#DC2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[#059669]" />
                <span className="text-xs text-[#9CA3AF]">Deficit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[#DC2626]" />
                <span className="text-xs text-[#9CA3AF]">Surplus</span>
              </div>
              {deficitTarget && (
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-[#4F46E5]" />
                  <span className="text-xs text-[#9CA3AF]">Goal</span>
                </div>
              )}
            </div>
          </div>

          {/* Protein chart */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
            <p className="text-sm font-semibold text-[#111827] mb-1">Protein</p>
            <p className="text-xs text-[#9CA3AF] mb-4">
              Daily intake (g) · Target: {proteinTarget}g
              {profile?.goal_mode !== 'gain_muscle' && (
                <span> · minimum recommended</span>
              )}
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={proteinData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  interval={tickInterval}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, (dataMax: number) => Math.max(dataMax, proteinTarget * 1.25)]}
                />
                <Tooltip content={<ProteinTooltip />} />
                {proteinTarget > 0 && (
                  <ReferenceLine
                    y={proteinTarget}
                    stroke="#7C3AED"
                    strokeDasharray="4 3"
                    label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: '#7C3AED' }}
                  />
                )}
                <Bar dataKey="protein" radius={[3, 3, 0, 0]} maxBarSize={20}>
                  {proteinData.map((entry, i) => (
                    <Cell key={i} fill={entry.protein == null ? 'transparent' : entry.protein >= proteinTarget && proteinTarget > 0 ? '#7C3AED' : '#C4B5FD'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[#7C3AED]" />
                <span className="text-xs text-[#9CA3AF]">At target</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[#C4B5FD]" />
                <span className="text-xs text-[#9CA3AF]">Below target</span>
              </div>
              {proteinTarget > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-[#7C3AED]" />
                  <span className="text-xs text-[#9CA3AF]">Target</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
