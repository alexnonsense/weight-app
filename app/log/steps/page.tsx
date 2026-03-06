'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { stepsToCalories } from '@/lib/calculations'

export default function LogStepsPage() {
  const [steps, setSteps] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const caloriesPreview = steps ? Math.round(stepsToCalories(parseInt(steps))) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const today = new Date().toISOString().split('T')[0]
    const stepsInt = parseInt(steps)
    const caloriesBurned = stepsToCalories(stepsInt)

    // Upsert — replace today's step log if it already exists
    const { error: dbError } = await supabase.from('step_logs').upsert({
      user_id: user.id,
      date: today,
      steps: stepsInt,
      calories_burned: caloriesBurned,
    }, { onConflict: 'user_id,date' })

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
        <h1 className="text-xl font-bold text-[#111827]">Log steps</h1>
      </div>

      {saved ? (
        <div className="bg-[#ECFDF5] rounded-2xl p-6 text-center">
          <p className="text-2xl font-bold text-[#059669]">{parseInt(steps).toLocaleString()} steps</p>
          <p className="text-[#6B7280] mt-1">{caloriesPreview} kcal burned</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-[#4F46E5] font-medium">
            Back to dashboard →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">Step count today</label>
              <input
                type="number"
                value={steps}
                onChange={e => setSteps(e.target.value)}
                required
                min="0"
                max="100000"
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                placeholder="e.g. 8000"
                autoFocus
              />
            </div>

            {steps && parseInt(steps) > 0 && (
              <div className="bg-[#F9FAFB] rounded-xl px-4 py-3 text-sm text-[#374151]">
                ≈ <span className="font-semibold">{caloriesPreview} kcal</span> burned from steps
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save steps'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
