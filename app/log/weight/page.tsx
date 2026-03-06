'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { expectedWeightKg } from '@/lib/calculations'

export default function LogWeightPage() {
  const [weightKg, setWeightKg] = useState('')
  const [startingWeight, setStartingWeight] = useState<number | null>(null)
  const [cumulativeNet, setCumulativeNet] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [expected, setExpected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [existingLogId, setExistingLogId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const today = new Date().toISOString().split('T')[0]

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('starting_weight_kg')
        .eq('user_id', user.id)
        .single()

      if (profile) setStartingWeight(profile.starting_weight_kg)

      // Check if a weight log already exists for today
      const { data: existing } = await supabase
        .from('weight_logs')
        .select('id, actual_weight_kg')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()

      if (existing) {
        setExistingLogId(existing.id)
        setWeightKg(existing.actual_weight_kg.toString())
      }

      // Sum all net calories since the beginning
      const [meals, steps, exercise, bmrRes] = await Promise.all([
        supabase.from('meal_entries').select('calories').eq('user_id', user.id),
        supabase.from('step_logs').select('calories_burned').eq('user_id', user.id),
        supabase.from('exercise_logs').select('calories_burned').eq('user_id', user.id),
        supabase.from('user_profiles').select('bmr').eq('user_id', user.id).single(),
      ])

      // We don't track per-day BMR history, so we approximate:
      // cumulative net = total calories eaten - total activity burned
      // (BMR is already baked into the daily net on the dashboard; for expected weight
      // we need a simpler proxy — use total food minus total activity)
      const totalIn = (meals.data ?? []).reduce((s, m) => s + m.calories, 0)
      const totalActivity = (steps.data ?? []).reduce((s, r) => s + r.calories_burned, 0)
        + (exercise.data ?? []).reduce((s, r) => s + r.calories_burned, 0)

      // Estimate days of data to factor in BMR
      const { data: earliest } = await supabase
        .from('meal_entries')
        .select('date')
        .eq('user_id', user.id)
        .order('date', { ascending: true })
        .limit(1)
        .single()

      let bmrTotal = 0
      if (earliest?.date && bmrRes.data?.bmr) {
        const days = Math.max(1, Math.ceil((Date.now() - new Date(earliest.date).getTime()) / 86400000))
        bmrTotal = bmrRes.data.bmr * days
      }

      const net = totalIn - totalActivity - bmrTotal
      setCumulativeNet(net)
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const actual = parseFloat(weightKg)
    const exp = startingWeight !== null && cumulativeNet !== null
      ? Math.round(expectedWeightKg(startingWeight, cumulativeNet) * 10) / 10
      : null

    setExpected(exp)

    const today = new Date().toISOString().split('T')[0]
    let dbError
    if (existingLogId) {
      ;({ error: dbError } = await supabase.from('weight_logs').update({
        actual_weight_kg: actual,
        expected_weight_kg: exp,
      }).eq('id', existingLogId))
    } else {
      ;({ error: dbError } = await supabase.from('weight_logs').insert({
        user_id: user.id,
        date: today,
        actual_weight_kg: actual,
        expected_weight_kg: exp,
      }))
    }

    if (dbError) {
      setError(dbError.message)
    } else {
      setSaved(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard" className="text-[#6B7280] hover:text-[#374151]">← Back</Link>
        <h1 className="text-xl font-bold text-[#111827]">Log weight</h1>
      </div>

      {saved ? (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-xs text-[#6B7280] mb-1">Actual weight</p>
                <p className="text-2xl font-bold text-[#111827]">{weightKg} kg</p>
              </div>
              {expected !== null && (
                <div className="text-center">
                  <p className="text-xs text-[#6B7280] mb-1">Expected weight</p>
                  <p className="text-2xl font-bold text-[#4F46E5]">{expected} kg</p>
                </div>
              )}
            </div>
            {expected !== null && (
              <p className="text-sm text-center text-[#6B7280] mt-4">
                {parseFloat(weightKg) < expected
                  ? `You're ${(expected - parseFloat(weightKg)).toFixed(1)} kg ahead of your expected weight 🎉`
                  : parseFloat(weightKg) > expected
                  ? `You're ${(parseFloat(weightKg) - expected).toFixed(1)} kg behind your expected weight`
                  : 'Right on track with your expected weight!'}
              </p>
            )}
          </div>
          <Link href="/dashboard" className="block text-center text-sm text-[#4F46E5] font-medium mt-2">
            Back to dashboard →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">Your weight today (kg)</label>
              <input
                type="number"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                required
                min="30"
                max="300"
                step="0.1"
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                placeholder="e.g. 79.5"
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] disabled:opacity-60"
            >
              {loading ? 'Saving...' : existingLogId ? 'Update weight' : 'Save weight'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
