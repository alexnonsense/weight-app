export type LossTier = 'steady' | 'active' | 'aggressive'

export const TIER_CONFIG: Record<LossTier, { label: string; kgPerWeek: number; dailyDeficit: number; description: string; requirements: string }> = {
  steady: {
    label: 'Steady',
    kgPerWeek: 0.5,
    dailyDeficit: 500,
    description: '0.5 kg per week',
    requirements: 'Eat well, aim for 8–10k steps daily, light exercise 2–3× per week',
  },
  active: {
    label: 'Active',
    kgPerWeek: 0.75,
    dailyDeficit: 750,
    description: '0.75 kg per week',
    requirements: '10k+ steps daily, dedicated workouts 4–5× per week, clean diet',
  },
  aggressive: {
    label: 'Aggressive',
    kgPerWeek: 1.0,
    dailyDeficit: 1000,
    description: '1 kg per week',
    requirements: 'High step count every day, intense exercise 5–6× per week, strict calorie control',
  },
}

export function dailyDeficitFromTier(tier: LossTier): number {
  return TIER_CONFIG[tier].dailyDeficit
}

export function estimatedMonths(currentKg: number, targetKg: number, tier: LossTier): number {
  const kgToLose = currentKg - targetKg
  if (kgToLose <= 0) return 0
  const weeks = kgToLose / TIER_CONFIG[tier].kgPerWeek
  return Math.ceil(weeks / 4.33)
}

export type BuildTier = 'build' | 'build_fast'

export const BUILD_TIER_CONFIG: Record<BuildTier, { label: string; proteinPerKg: number; description: string; requirements: string }> = {
  build: {
    label: 'Build',
    proteinPerKg: 1.8,
    description: '~1.8g protein per kg/day',
    requirements: '3–4 training sessions per week, consistent protein with every meal',
  },
  build_fast: {
    label: 'Build Fast',
    proteinPerKg: 2.2,
    description: '~2.2g protein per kg/day',
    requirements: '4–5 training sessions per week, strict protein tracking every meal',
  },
}

export function proteinTargetG(weightKg: number, tier: BuildTier): number {
  return Math.round(weightKg * BUILD_TIER_CONFIG[tier].proteinPerKg / 5) * 5
}

export const WEIGHT_LOSS_MIN_PROTEIN_PER_KG = 1.2

export function stepsToCalories(steps: number): number {
  return steps * 0.038
}

export function expectedWeightKg(
  startingWeightKg: number,
  cumulativeNetCalories: number
): number {
  const kgChange = cumulativeNetCalories / 7700
  return startingWeightKg + kgChange
}

export type DailyPoint = {
  date: string         // 'YYYY-MM-DD'
  netCalories: number  // calories_in - all_burns (including BMR)
  expectedKg: number   // running cumulative → weight
  proteinG: number     // total protein logged this day
  actualKg?: number    // only present on weigh-in days
}

export function buildDailySeries(params: {
  startingWeightKg: number
  bmr: number
  mealsByDate: Record<string, number>     // date → total calories
  stepCalsByDate: Record<string, number>  // date → calories burned
  exerciseCalsByDate: Record<string, number>
  weightByDate: Record<string, number>    // date → actual_weight_kg
  proteinByDate: Record<string, number>   // date → total protein_g
}): DailyPoint[] {
  const { startingWeightKg, bmr, mealsByDate, stepCalsByDate, exerciseCalsByDate, weightByDate, proteinByDate } = params

  const today = new Date().toISOString().split('T')[0]

  // Collect all dates that have any data
  const allDates = new Set([
    ...Object.keys(mealsByDate),
    ...Object.keys(stepCalsByDate),
    ...Object.keys(exerciseCalsByDate),
    ...Object.keys(weightByDate),
    ...Object.keys(proteinByDate),
  ])

  if (allDates.size === 0) return []

  const sorted = Array.from(allDates).sort()
  const start = sorted[0]

  // Build a continuous day-by-day array from start to today
  const series: DailyPoint[] = []
  let cumulative = 0
  const cursor = new Date(start)
  const end = new Date(today)

  while (cursor <= end) {
    const date = cursor.toISOString().split('T')[0]
    const calsIn = mealsByDate[date] ?? 0
    const stepCals = stepCalsByDate[date] ?? 0
    const exerciseCals = exerciseCalsByDate[date] ?? 0
    const netCalories = calsIn - stepCals - exerciseCals - bmr
    cumulative += netCalories

    const point: DailyPoint = {
      date,
      netCalories: Math.round(netCalories),
      expectedKg: Math.round((startingWeightKg + cumulative / 7700) * 10) / 10,
      proteinG: proteinByDate[date] ?? 0,
    }
    if (weightByDate[date] !== undefined) {
      point.actualKg = weightByDate[date]
    }
    series.push(point)
    cursor.setDate(cursor.getDate() + 1)
  }

  return series
}
