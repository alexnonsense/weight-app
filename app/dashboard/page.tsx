'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'

type MealEntry = { id: string; description: string; calories: number; protein_g: number }
type StepLog = { steps: number; calories_burned: number }
type ExerciseEntry = { id: string; description: string; calories_burned: number }
type WeightLog = { actual_weight_kg: number }

type DaySummary = {
  caloriesIn: number
  caloriesBurned: number
  netCalories: number
  proteinG: number
}

type TrafficLight = 'green' | 'amber' | 'red'

function getCalorieLight(netCalories: number, dailyDeficitTarget: number): TrafficLight {
  const difference = netCalories - (-dailyDeficitTarget)
  if (difference <= 200) return 'green'
  if (difference <= 500) return 'amber'
  return 'red'
}

function getProteinLight(proteinG: number, proteinTargetG: number): TrafficLight {
  const pct = proteinG / proteinTargetG
  if (pct >= 0.9) return 'green'
  if (pct >= 0.7) return 'amber'
  return 'red'
}

const LIGHT_STYLES = {
  green: { card: 'bg-[#ECFDF5]', value: 'text-[#059669]', label: 'On track' },
  amber: { card: 'bg-[#FFFBEB]', value: 'text-[#D97706]', label: 'Slightly off track' },
  red:   { card: 'bg-[#FEF2F2]', value: 'text-[#DC2626]', label: 'Off track' },
}

function recomputeSummary(meals: MealEntry[], exercises: ExerciseEntry[], stepCals: number, bmr: number): DaySummary {
  const caloriesIn = meals.reduce((s, m) => s + m.calories, 0)
  const proteinG = meals.reduce((s, m) => s + m.protein_g, 0)
  const exerciseCals = exercises.reduce((s, e) => s + e.calories_burned, 0)
  const caloriesBurned = bmr + stepCals + exerciseCals
  return {
    caloriesIn: Math.round(caloriesIn),
    caloriesBurned: Math.round(caloriesBurned),
    netCalories: Math.round(caloriesIn - caloriesBurned),
    proteinG: Math.round(proteinG),
  }
}

export default function DashboardPage() {
  const [meals, setMeals] = useState<MealEntry[]>([])
  const [stepLog, setStepLog] = useState<StepLog | null>(null)
  const [exercises, setExercises] = useState<ExerciseEntry[]>([])
  const [weightLog, setWeightLog] = useState<WeightLog | null>(null)
  const [summary, setSummary] = useState<DaySummary>({ caloriesIn: 0, caloriesBurned: 0, netCalories: 0, proteinG: 0 })
  const [bmr, setBmr] = useState(0)
  const [stepCals, setStepCals] = useState(0)
  const [goalMode, setGoalMode] = useState<'lose_weight' | 'gain_muscle'>('lose_weight')
  const [dailyDeficitTarget, setDailyDeficitTarget] = useState<number | null>(null)
  const [proteinTarget, setProteinTarget] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Meal edit state
  const [editingMealId, setEditingMealId] = useState<string | null>(null)
  const [editMealDesc, setEditMealDesc] = useState('')
  const [editMealCals, setEditMealCals] = useState('')
  const [editMealProtein, setEditMealProtein] = useState('')

  // Exercise edit state
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null)
  const [editExerciseDesc, setEditExerciseDesc] = useState('')
  const [editExerciseCals, setEditExerciseCals] = useState('')

  const router = useRouter()
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [profileRes, mealsRes, stepsRes, exerciseRes, weightRes] = await Promise.all([
        supabase.from('user_profiles').select('bmr, goal_mode, daily_deficit_target, protein_target_g').eq('user_id', user.id).single(),
        supabase.from('meal_entries').select('id, description, calories, protein_g').eq('user_id', user.id).eq('date', today),
        supabase.from('step_logs').select('steps, calories_burned').eq('user_id', user.id).eq('date', today),
        supabase.from('exercise_logs').select('id, description, calories_burned').eq('user_id', user.id).eq('date', today),
        supabase.from('weight_logs').select('actual_weight_kg').eq('user_id', user.id).eq('date', today),
      ])

      const dailyBmr = profileRes.data?.bmr ?? 0
      setBmr(dailyBmr)
      setGoalMode(profileRes.data?.goal_mode ?? 'lose_weight')
      setDailyDeficitTarget(profileRes.data?.daily_deficit_target ?? null)
      setProteinTarget(profileRes.data?.protein_target_g ?? null)

      const mealList = (mealsRes.data ?? []) as MealEntry[]
      const stepList = (stepsRes.data ?? []) as StepLog[]
      const exerciseList = (exerciseRes.data ?? []) as ExerciseEntry[]
      const weightList = (weightRes.data ?? []) as WeightLog[]
      const sc = stepList.reduce((s, r) => s + r.calories_burned, 0)

      setMeals(mealList)
      setStepLog(stepList[0] ?? null)
      setStepCals(sc)
      setExercises(exerciseList)
      setWeightLog(weightList[0] ?? null)
      setSummary(recomputeSummary(mealList, exerciseList, sc, dailyBmr))
      setLoading(false)
    }
    load()
  }, [])

  // Meal handlers
  function startEditMeal(m: MealEntry) {
    setEditingMealId(m.id)
    setEditMealDesc(m.description)
    setEditMealCals(m.calories.toString())
    setEditMealProtein(m.protein_g.toString())
  }

  async function saveMeal(id: string) {
    const updated = { description: editMealDesc, calories: parseInt(editMealCals) || 0, protein_g: parseInt(editMealProtein) || 0 }
    await supabase.from('meal_entries').update(updated).eq('id', id)
    const newMeals = meals.map(m => m.id === id ? { ...m, ...updated } : m)
    setMeals(newMeals)
    setSummary(recomputeSummary(newMeals, exercises, stepCals, bmr))
    setEditingMealId(null)
  }

  async function deleteMeal(id: string) {
    await supabase.from('meal_entries').delete().eq('id', id)
    const newMeals = meals.filter(m => m.id !== id)
    setMeals(newMeals)
    setSummary(recomputeSummary(newMeals, exercises, stepCals, bmr))
    setEditingMealId(null)
  }

  // Exercise handlers
  function startEditExercise(e: ExerciseEntry) {
    setEditingExerciseId(e.id)
    setEditExerciseDesc(e.description)
    setEditExerciseCals(e.calories_burned.toString())
  }

  async function saveExercise(id: string) {
    const updated = { description: editExerciseDesc, calories_burned: parseInt(editExerciseCals) || 0 }
    await supabase.from('exercise_logs').update(updated).eq('id', id)
    const newExercises = exercises.map(e => e.id === id ? { ...e, ...updated } : e)
    setExercises(newExercises)
    setSummary(recomputeSummary(meals, newExercises, stepCals, bmr))
    setEditingExerciseId(null)
  }

  async function deleteExercise(id: string) {
    await supabase.from('exercise_logs').delete().eq('id', id)
    const newExercises = exercises.filter(e => e.id !== id)
    setExercises(newExercises)
    setSummary(recomputeSummary(meals, newExercises, stepCals, bmr))
    setEditingExerciseId(null)
  }

  const isMuscleMode = goalMode === 'gain_muscle'

  const calorieLight: TrafficLight = dailyDeficitTarget
    ? getCalorieLight(summary.netCalories, dailyDeficitTarget)
    : summary.netCalories < 0 ? 'green' : 'red'

  const proteinLight: TrafficLight = proteinTarget
    ? getProteinLight(summary.proteinG, proteinTarget)
    : 'red'

  const heroLight = isMuscleMode ? proteinLight : calorieLight
  const heroStyles = LIGHT_STYLES[heroLight]

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <NavBar />
      <p className="text-sm text-[#6B7280] -mt-4 mb-6">
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {loading ? (
        <div className="text-center text-[#6B7280] py-16">Loading...</div>
      ) : (
        <>
          {/* Hero card */}
          {isMuscleMode ? (
            <div className={`rounded-2xl p-6 mb-4 ${heroStyles.card}`}>
              <p className="text-sm font-medium text-[#6B7280] mb-1">Protein today</p>
              <p className={`text-4xl font-bold ${heroStyles.value}`}>
                {summary.proteinG}g
                {proteinTarget && <span className="text-xl font-medium ml-2 opacity-70">/ {proteinTarget}g target</span>}
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm text-[#6B7280]">{heroStyles.label}</p>
                {proteinTarget && <p className="text-xs text-[#9CA3AF]">{Math.round((summary.proteinG / proteinTarget) * 100)}% of target</p>}
              </div>
              {proteinTarget && (
                <div className="mt-3 h-1.5 bg-black/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${heroLight === 'green' ? 'bg-[#059669]' : heroLight === 'amber' ? 'bg-[#D97706]' : 'bg-[#DC2626]'}`}
                    style={{ width: `${Math.min(100, Math.round((summary.proteinG / proteinTarget) * 100))}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className={`rounded-2xl p-6 mb-4 ${heroStyles.card}`}>
              <p className="text-sm font-medium text-[#6B7280] mb-1">Net calories</p>
              <p className={`text-4xl font-bold ${heroStyles.value}`}>
                {summary.netCalories < 0 ? '' : '+'}{summary.netCalories.toLocaleString()}
                <span className="text-xl font-medium ml-2 opacity-70">
                  ({summary.netCalories < 0 ? '' : '+'}{(summary.netCalories / 7700).toFixed(1)} kg)
                </span>
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm text-[#6B7280]">{heroStyles.label}</p>
                {dailyDeficitTarget && <p className="text-xs text-[#9CA3AF]">target: −{dailyDeficitTarget.toLocaleString()} kcal</p>}
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="Eaten" value={summary.caloriesIn.toLocaleString()} unit="kcal" />
            <StatCard label="Burned" value={summary.caloriesBurned.toLocaleString()} unit="kcal" />
            {isMuscleMode
              ? <StatCard label="Net" value={(summary.netCalories < 0 ? '' : '+') + summary.netCalories.toLocaleString()} unit="kcal" />
              : <StatCard label="Protein" value={summary.proteinG.toString()} unit="g" />
            }
          </div>

          {/* Category sections */}
          <div className="space-y-3">

            {/* Meals */}
            <Section label="Meals">
              {meals.length > 0 ? (
                <>
                  {meals.map(m => (
                    <div key={m.id}>
                      {editingMealId === m.id ? (
                        <div className="py-3 space-y-2 border-b border-[#F3F4F6] last:border-0">
                          <input
                            value={editMealDesc}
                            onChange={e => setEditMealDesc(e.target.value)}
                            className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                            placeholder="Description"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={editMealCals}
                              onChange={e => setEditMealCals(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                              placeholder="kcal"
                            />
                            <input
                              type="number"
                              value={editMealProtein}
                              onChange={e => setEditMealProtein(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                              placeholder="protein g"
                            />
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            <button onClick={() => saveMeal(m.id)} className="text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]">Save</button>
                            <button onClick={() => setEditingMealId(null)} className="text-sm text-[#6B7280] hover:text-[#374151]">Cancel</button>
                            <button onClick={() => deleteMeal(m.id)} className="text-sm text-red-500 hover:text-red-600 ml-auto">Delete</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0 group">
                          <p className="text-sm text-[#374151] flex-1 pr-2 truncate">{m.description}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-xs text-[#9CA3AF]">{m.calories} kcal · {m.protein_g}g</p>
                            <button
                              onClick={() => startEditMeal(m)}
                              className="text-[#9CA3AF] hover:text-[#4F46E5] text-xs leading-none"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <Link href="/log/meal" className="block text-sm text-[#4F46E5] font-medium pt-2 hover:text-[#4338CA]">
                    + Log another meal
                  </Link>
                </>
              ) : (
                <PromptCard message="No meals logged yet" href="/log/meal" linkLabel="Log a meal →" urgency="amber" />
              )}
            </Section>

            {/* Steps */}
            <Section label="Steps">
              {stepLog ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#374151]">
                    {stepLog.steps.toLocaleString()} steps · {Math.round(stepLog.calories_burned)} kcal
                  </p>
                  <Link href="/log/steps" className="text-xs text-[#4F46E5] font-medium hover:text-[#4338CA]">Edit</Link>
                </div>
              ) : (
                <PromptCard message="Haven't logged steps today" href="/log/steps" linkLabel="Log steps →" urgency="amber" />
              )}
            </Section>

            {/* Exercise */}
            <Section label="Exercise">
              {exercises.length > 0 ? (
                <>
                  {exercises.map(e => (
                    <div key={e.id}>
                      {editingExerciseId === e.id ? (
                        <div className="py-3 space-y-2 border-b border-[#F3F4F6] last:border-0">
                          <input
                            value={editExerciseDesc}
                            onChange={ev => setEditExerciseDesc(ev.target.value)}
                            className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                            placeholder="Description"
                          />
                          <input
                            type="number"
                            value={editExerciseCals}
                            onChange={ev => setEditExerciseCals(ev.target.value)}
                            className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                            placeholder="calories burned"
                          />
                          <div className="flex items-center gap-3 pt-1">
                            <button onClick={() => saveExercise(e.id)} className="text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]">Save</button>
                            <button onClick={() => setEditingExerciseId(null)} className="text-sm text-[#6B7280] hover:text-[#374151]">Cancel</button>
                            <button onClick={() => deleteExercise(e.id)} className="text-sm text-red-500 hover:text-red-600 ml-auto">Delete</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0">
                          <p className="text-sm text-[#374151] flex-1 pr-2 truncate">{e.description}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-xs text-[#9CA3AF]">{e.calories_burned} kcal</p>
                            <button
                              onClick={() => startEditExercise(e)}
                              className="text-[#9CA3AF] hover:text-[#4F46E5] text-xs leading-none"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <Link href="/log/exercise" className="block text-sm text-[#4F46E5] font-medium pt-2 hover:text-[#4338CA]">
                    + Log another exercise
                  </Link>
                </>
              ) : (
                <PromptCard message="No exercise logged" href="/log/exercise" linkLabel="Log exercise →" urgency="grey" />
              )}
            </Section>

            {/* Weight */}
            <Section label="Weight">
              {weightLog ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#374151]">{weightLog.actual_weight_kg} kg logged today</p>
                  <Link href="/log/weight" className="text-xs text-[#4F46E5] font-medium hover:text-[#4338CA]">Edit</Link>
                </div>
              ) : (
                <PromptCard message="Haven't weighed in today" href="/log/weight" linkLabel="Log weight →" urgency="amber" />
              )}
            </Section>

          </div>

          <p className="text-xs text-[#9CA3AF] text-center mt-6">BMR: {Math.round(bmr)} kcal/day</p>
        </>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
      <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-3">{label}</p>
      {children}
    </div>
  )
}

function PromptCard({ message, href, linkLabel, urgency }: {
  message: string; href: string; linkLabel: string; urgency: 'amber' | 'grey'
}) {
  const bg = urgency === 'amber' ? 'bg-[#FFFBEB]' : 'bg-[#F9FAFB]'
  const text = urgency === 'amber' ? 'text-[#92400E]' : 'text-[#6B7280]'
  const link = urgency === 'amber' ? 'text-[#D97706]' : 'text-[#4F46E5]'
  return (
    <div className={`${bg} rounded-xl px-4 py-3 flex items-center justify-between`}>
      <p className={`text-sm ${text}`}>{message}</p>
      <Link href={href} className={`text-sm font-medium ${link} hover:opacity-80 whitespace-nowrap ml-3`}>{linkLabel}</Link>
    </div>
  )
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-3 text-center">
      <p className="text-xs text-[#6B7280] mb-1">{label}</p>
      <p className="text-lg font-bold text-[#111827]">{value}</p>
      <p className="text-xs text-[#9CA3AF]">{unit}</p>
    </div>
  )
}
