'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  TIER_CONFIG, LossTier, dailyDeficitFromTier, estimatedMonths,
  BUILD_TIER_CONFIG, BuildTier, proteinTargetG,
} from '@/lib/calculations'

type Profile = {
  sex: string
  age: number
  height_cm: number
  starting_weight_kg: number
  bmr: number
  bmr_calculated_at: string
  goal_mode: 'lose_weight' | 'gain_muscle' | null
  target_weight_kg: number | null
  loss_rate_tier: string | null
  daily_deficit_target: number | null
  protein_target_g: number | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeGoalMode, setActiveGoalMode] = useState<'lose_weight' | 'gain_muscle'>('lose_weight')

  // Weight loss edit fields
  const [targetWeight, setTargetWeight] = useState('')
  const [lossTier, setLossTier] = useState<LossTier>('steady')

  // Muscle gain edit fields
  const [buildTier, setBuildTier] = useState<BuildTier>('build')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setEmail(user.email ?? '')

      const { data } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single()
      setProfile(data)
      setActiveGoalMode(data?.goal_mode ?? 'lose_weight')
      if (data?.target_weight_kg) setTargetWeight(data.target_weight_kg.toString())
      if (data?.loss_rate_tier) {
        if (data.goal_mode === 'lose_weight') setLossTier(data.loss_rate_tier as LossTier)
        if (data.goal_mode === 'gain_muscle') setBuildTier(data.loss_rate_tier as BuildTier)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  async function handleSaveWeightLoss(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const dailyDeficit = dailyDeficitFromTier(lossTier)
    const { error } = await supabase.from('user_profiles').update({
      target_weight_kg: parseFloat(targetWeight),
      loss_rate_tier: lossTier,
      daily_deficit_target: dailyDeficit,
    }).eq('user_id', user.id)

    if (error) { setSaveError(error.message); setSaving(false); return }
    setProfile(prev => prev ? { ...prev, target_weight_kg: parseFloat(targetWeight), loss_rate_tier: lossTier, daily_deficit_target: dailyDeficit } : prev)
    setEditing(false); setSaving(false)
  }

  async function handleSaveMuscleGain(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const pTarget = proteinTargetG(profile?.starting_weight_kg ?? 0, buildTier)
    const { error } = await supabase.from('user_profiles').update({
      loss_rate_tier: buildTier,
      protein_target_g: pTarget,
    }).eq('user_id', user.id)

    if (error) { setSaveError(error.message); setSaving(false); return }
    setProfile(prev => prev ? { ...prev, loss_rate_tier: buildTier, protein_target_g: pTarget } : prev)
    setEditing(false); setSaving(false)
  }

  async function switchGoalMode(newMode: 'lose_weight' | 'gain_muscle') {
    if (newMode === activeGoalMode) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const clearFields = newMode === 'gain_muscle'
      ? { goal_mode: newMode, daily_deficit_target: null, target_weight_kg: null }
      : { goal_mode: newMode, protein_target_g: null }
    await supabase.from('user_profiles').update(clearFields).eq('user_id', user.id)
    setActiveGoalMode(newMode)
    setProfile(prev => prev ? { ...prev, ...clearFields } : prev)
    setEditing(true)
    setSaveError('')
  }

  const currentKg = profile?.starting_weight_kg ?? 0
  const targetKg = parseFloat(targetWeight) || 0
  const months = estimatedMonths(currentKg, targetKg, lossTier)
  const previewProtein = proteinTargetG(currentKg, buildTier)
  const isMuscleMode = activeGoalMode === 'gain_muscle'

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard" className="text-[#6B7280] hover:text-[#374151]">← Back</Link>
        <h1 className="text-xl font-bold text-[#111827]">Profile</h1>
      </div>

      {loading ? (
        <div className="text-center text-[#6B7280] py-16">Loading...</div>
      ) : (
        <div className="space-y-4">

          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
            <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-4">Account</p>
            <p className="text-sm text-[#374151]">{email}</p>
          </div>

          {profile && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-4">Body stats</p>
              <div className="space-y-3">
                <Row label="Sex" value={profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)} />
                <Row label="Age" value={`${profile.age} years`} />
                <Row label="Height" value={`${profile.height_cm} cm`} />
                <Row label="Starting weight" value={`${profile.starting_weight_kg} kg`} />
              </div>
            </div>
          )}

          {profile && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-4">Calorie settings</p>
              <div className="space-y-3">
                <Row label="Daily BMR" value={`${Math.round(profile.bmr)} kcal`} />
                <Row
                  label="BMR last updated"
                  value={new Date(profile.bmr_calculated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                />
              </div>
            </div>
          )}

          {profile && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-3">Goal</p>

              {/* Goal mode toggle */}
              <div className="flex rounded-lg bg-[#F3F4F6] p-1 mb-4">
                <button
                  type="button"
                  onClick={() => switchGoalMode('lose_weight')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isMuscleMode ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'}`}
                >
                  Lose weight
                </button>
                <button
                  type="button"
                  onClick={() => switchGoalMode('gain_muscle')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isMuscleMode ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'}`}
                >
                  Gain muscle
                </button>
              </div>

              {!editing && (
                <div className="flex justify-end mb-3">
                  <button onClick={() => setEditing(true)} className="text-xs text-[#4F46E5] hover:text-[#4338CA] font-medium">Edit</button>
                </div>
              )}

              {!editing ? (
                <div className="space-y-3">
                  {isMuscleMode ? (
                    profile.loss_rate_tier ? (
                      <>
                        <Row label="Tier" value={BUILD_TIER_CONFIG[profile.loss_rate_tier as BuildTier]?.label ?? profile.loss_rate_tier} />
                        <Row label="Protein target" value={`${profile.protein_target_g ?? '—'}g / day`} />
                        <div className="pt-2 border-t border-[#F3F4F6]">
                          <p className="text-xs text-[#9CA3AF]">{BUILD_TIER_CONFIG[profile.loss_rate_tier as BuildTier]?.requirements}</p>
                        </div>
                      </>
                    ) : <p className="text-sm text-[#9CA3AF]">No goal set yet.</p>
                  ) : (
                    profile.target_weight_kg ? (
                      <>
                        <Row label="Target weight" value={`${profile.target_weight_kg} kg`} />
                        <Row label="Loss rate" value={profile.loss_rate_tier ? TIER_CONFIG[profile.loss_rate_tier as LossTier]?.label ?? profile.loss_rate_tier : '—'} />
                        <Row label="Daily deficit target" value={profile.daily_deficit_target ? `${profile.daily_deficit_target} kcal` : '—'} />
                        {profile.loss_rate_tier && (
                          <div className="pt-2 border-t border-[#F3F4F6]">
                            <p className="text-xs text-[#9CA3AF]">{TIER_CONFIG[profile.loss_rate_tier as LossTier]?.requirements}</p>
                          </div>
                        )}
                      </>
                    ) : <p className="text-sm text-[#9CA3AF]">No goal set yet.</p>
                  )}
                </div>
              ) : (
                /* Edit form — conditional on goal mode */
                isMuscleMode ? (
                  <form onSubmit={handleSaveMuscleGain} className="space-y-4">
                    <div className="space-y-2">
                      {(Object.keys(BUILD_TIER_CONFIG) as BuildTier[]).map(t => (
                        <button key={t} type="button" onClick={() => setBuildTier(t)}
                          className={`w-full text-left p-3 rounded-xl border-2 transition-all ${buildTier === t ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-[#E5E7EB] bg-white hover:border-[#C7D2FE]'}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm font-semibold text-[#111827]">{BUILD_TIER_CONFIG[t].label}</span>
                            <span className="text-xs text-[#6B7280]">{BUILD_TIER_CONFIG[t].description}</span>
                          </div>
                          <p className="text-xs text-[#9CA3AF]">{BUILD_TIER_CONFIG[t].requirements}</p>
                        </button>
                      ))}
                    </div>
                    <div className="bg-[#EEF2FF] rounded-xl px-4 py-3">
                      <p className="text-sm text-[#3730A3]">
                        Daily protein target: <span className="font-semibold">{previewProtein}g</span>
                      </p>
                    </div>
                    {saveError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditing(false); setSaveError('') }}
                        className="flex-1 py-2 border border-[#E5E7EB] text-sm font-medium text-[#6B7280] rounded-lg hover:bg-[#F9FAFB] transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving}
                        className="flex-1 py-2 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSaveWeightLoss} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#374151] mb-1">Target weight (kg)</label>
                      <input type="number" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} required min="30" max="300" step="0.1"
                        className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent" />
                    </div>
                    <div className="space-y-2">
                      {(Object.keys(TIER_CONFIG) as LossTier[]).map(t => (
                        <button key={t} type="button" onClick={() => setLossTier(t)}
                          className={`w-full text-left p-3 rounded-xl border-2 transition-all ${lossTier === t ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-[#E5E7EB] bg-white hover:border-[#C7D2FE]'}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm font-semibold text-[#111827]">{TIER_CONFIG[t].label}</span>
                            <span className="text-xs text-[#6B7280]">{TIER_CONFIG[t].description}</span>
                          </div>
                          <p className="text-xs text-[#9CA3AF]">{TIER_CONFIG[t].requirements}</p>
                        </button>
                      ))}
                    </div>
                    {targetKg > 0 && targetKg < currentKg && (
                      <div className="bg-[#F0FDF4] rounded-xl px-4 py-3">
                        <p className="text-sm text-[#166534]">
                          Estimated <span className="font-semibold">{months} {months === 1 ? 'month' : 'months'}</span> to reach your goal.
                        </p>
                      </div>
                    )}
                    {saveError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditing(false); setSaveError('') }}
                        className="flex-1 py-2 border border-[#E5E7EB] text-sm font-medium text-[#6B7280] rounded-lg hover:bg-[#F9FAFB] transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving}
                        className="flex-1 py-2 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                )
              )}
            </div>
          )}

          <button onClick={handleSignOut}
            className="w-full py-2.5 border border-[#E5E7EB] text-sm font-medium text-[#6B7280] rounded-xl hover:border-red-300 hover:text-red-500 transition-colors">
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-[#6B7280]">{label}</span>
      <span className="text-sm font-medium text-[#111827]">{value}</span>
    </div>
  )
}
