'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { TIER_CONFIG, LossTier, dailyDeficitFromTier, estimatedMonths, BUILD_TIER_CONFIG, BuildTier, proteinTargetG } from '@/lib/calculations'

type GoalMode = 'lose_weight' | 'gain_muscle'

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | '3a' | '3b'>(1)

  // Step 1
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [bmr, setBmr] = useState(0)

  // Step 2
  const [goalMode, setGoalMode] = useState<GoalMode>('lose_weight')

  // Step 3a (lose weight)
  const [targetWeight, setTargetWeight] = useState('')
  const [lossTier, setLossTier] = useState<LossTier>('steady')

  // Step 3b (gain muscle)
  const [buildTier, setBuildTier] = useState<BuildTier>('build')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    let calculatedBmr = 0
    try {
      const res = await fetch('/api/ai/bmr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sex,
          age: parseInt(age),
          height_cm: parseFloat(heightCm),
          weight_kg: parseFloat(weightKg),
        }),
      })
      const data = await res.json()
      calculatedBmr = data.bmr
    } catch {
      setError('Failed to calculate BMR. Please check your API key and try again.')
      setLoading(false)
      return
    }

    const { error: dbError } = await supabase.from('user_profiles').insert({
      user_id: user.id,
      sex,
      age: parseInt(age),
      height_cm: parseFloat(heightCm),
      starting_weight_kg: parseFloat(weightKg),
      bmr: calculatedBmr,
      bmr_calculated_at: new Date().toISOString(),
    })

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    setBmr(calculatedBmr)
    setLoading(false)
    setStep(2)
  }

  function handleStep2(mode: GoalMode) {
    setGoalMode(mode)
    setStep(mode === 'lose_weight' ? '3a' : '3b')
  }

  async function handleStep3a(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { error: dbError } = await supabase.from('user_profiles').update({
      goal_mode: 'lose_weight',
      target_weight_kg: parseFloat(targetWeight),
      loss_rate_tier: lossTier,
      daily_deficit_target: dailyDeficitFromTier(lossTier),
    }).eq('user_id', user.id)

    if (dbError) { setError(dbError.message); setLoading(false); return }

    await supabase.from('subscriptions').upsert({ user_id: user.id, status: 'trialing' }, { onConflict: 'user_id' })
    router.push('/dashboard')
  }

  async function handleStep3b(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const currentKg = parseFloat(weightKg)
    const pTarget = proteinTargetG(currentKg, buildTier)

    const { error: dbError } = await supabase.from('user_profiles').update({
      goal_mode: 'gain_muscle',
      loss_rate_tier: buildTier,
      protein_target_g: pTarget,
    }).eq('user_id', user.id)

    if (dbError) { setError(dbError.message); setLoading(false); return }

    await supabase.from('subscriptions').upsert({ user_id: user.id, status: 'trialing' }, { onConflict: 'user_id' })
    router.push('/dashboard')
  }

  const currentKg = parseFloat(weightKg) || 0
  const targetKg = parseFloat(targetWeight) || 0
  const months = estimatedMonths(currentKg, targetKg, lossTier)
  const previewProtein = proteinTargetG(currentKg, buildTier)

  const stepLabel = step === 1 ? '1 of 3' : step === 2 ? '2 of 3' : '3 of 3'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Step 1: Body stats */}
        {step === 1 && (
          <>
            <div className="text-center mb-8">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-1">Step {stepLabel}</p>
              <h1 className="text-2xl font-bold text-[#111827]">Set up your profile</h1>
              <p className="text-[#6B7280] mt-2 text-sm">We'll use this to calculate your daily calorie burn</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
              <form onSubmit={handleStep1} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Sex</label>
                  <div className="flex rounded-lg bg-[#F3F4F6] p-1">
                    {(['male', 'female'] as const).map(s => (
                      <button key={s} type="button" onClick={() => setSex(s)}
                        className={`flex-1 py-2 text-sm font-medium rounded-md capitalize transition-all ${sex === s ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">Age</label>
                  <input type="number" value={age} onChange={e => setAge(e.target.value)} required min="10" max="120"
                    className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                    placeholder="e.g. 30" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">Height (cm)</label>
                  <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} required min="100" max="250"
                    className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                    placeholder="e.g. 175" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">Current weight (kg)</label>
                  <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} required min="30" max="300" step="0.1"
                    className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                    placeholder="e.g. 80" />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60">
                  {loading ? 'Calculating your BMR...' : 'Continue'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Step 2: Goal mode */}
        {step === 2 && (
          <>
            <div className="text-center mb-8">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-1">Step {stepLabel}</p>
              <h1 className="text-2xl font-bold text-[#111827]">What's your goal?</h1>
              <p className="text-[#6B7280] mt-2 text-sm">This sets what we track on your dashboard</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleStep2('lose_weight')}
                className="w-full text-left bg-white rounded-2xl border-2 border-[#E5E7EB] p-6 hover:border-[#4F46E5] transition-all group"
              >
                <p className="text-lg font-bold text-[#111827] mb-1">Lose weight</p>
                <p className="text-sm text-[#6B7280]">Hit a daily calorie deficit. Track net calories vs. your target.</p>
              </button>

              <button
                onClick={() => handleStep2('gain_muscle')}
                className="w-full text-left bg-white rounded-2xl border-2 border-[#E5E7EB] p-6 hover:border-[#4F46E5] transition-all group"
              >
                <p className="text-lg font-bold text-[#111827] mb-1">Gain muscle</p>
                <p className="text-sm text-[#6B7280]">Hit a daily protein target. Track protein intake vs. your goal.</p>
              </button>
            </div>
          </>
        )}

        {/* Step 3a: Weight loss goal */}
        {step === '3a' && (
          <>
            <div className="text-center mb-8">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-1">Step {stepLabel}</p>
              <h1 className="text-2xl font-bold text-[#111827]">Set your goal</h1>
              <p className="text-[#6B7280] mt-2 text-sm">Choose how fast you want to lose weight</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
              <form onSubmit={handleStep3a} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">Target weight (kg)</label>
                  <input type="number" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} required min="30" max="300" step="0.1"
                    className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                    placeholder={`e.g. ${Math.max(30, currentKg - 10)}`} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-3">Loss rate</label>
                  <div className="space-y-2">
                    {(Object.keys(TIER_CONFIG) as LossTier[]).map(t => (
                      <button key={t} type="button" onClick={() => setLossTier(t)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${lossTier === t ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-[#E5E7EB] bg-white hover:border-[#C7D2FE]'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-[#111827]">{TIER_CONFIG[t].label}</span>
                          <span className="text-xs font-medium text-[#6B7280]">{TIER_CONFIG[t].description}</span>
                        </div>
                        <p className="text-xs text-[#6B7280]">{TIER_CONFIG[t].requirements}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {targetKg > 0 && targetKg < currentKg && (
                  <div className="bg-[#F0FDF4] rounded-xl px-4 py-3">
                    <p className="text-sm text-[#166534]">
                      At this rate, you'll reach your goal in approximately <span className="font-semibold">{months} {months === 1 ? 'month' : 'months'}</span>.
                    </p>
                  </div>
                )}

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60">
                  {loading ? 'Saving...' : 'Get started'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Step 3b: Muscle gain goal */}
        {step === '3b' && (
          <>
            <div className="text-center mb-8">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-1">Step {stepLabel}</p>
              <h1 className="text-2xl font-bold text-[#111827]">Set your goal</h1>
              <p className="text-[#6B7280] mt-2 text-sm">Choose your training intensity</p>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
              <form onSubmit={handleStep3b} className="space-y-5">
                <div className="space-y-2">
                  {(Object.keys(BUILD_TIER_CONFIG) as BuildTier[]).map(t => (
                    <button key={t} type="button" onClick={() => setBuildTier(t)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${buildTier === t ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-[#E5E7EB] bg-white hover:border-[#C7D2FE]'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-[#111827]">{BUILD_TIER_CONFIG[t].label}</span>
                        <span className="text-xs font-medium text-[#6B7280]">{BUILD_TIER_CONFIG[t].description}</span>
                      </div>
                      <p className="text-xs text-[#6B7280]">{BUILD_TIER_CONFIG[t].requirements}</p>
                    </button>
                  ))}
                </div>

                {currentKg > 0 && (
                  <div className="bg-[#EEF2FF] rounded-xl px-4 py-3">
                    <p className="text-sm text-[#3730A3]">
                      Your daily protein target: <span className="font-semibold">{previewProtein}g</span>
                    </p>
                  </div>
                )}

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60">
                  {loading ? 'Saving...' : 'Get started'}
                </button>
              </form>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
