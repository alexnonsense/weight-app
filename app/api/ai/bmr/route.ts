import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { sex, age, height_cm, weight_kg } = await req.json()

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Calculate the Basal Metabolic Rate (BMR) for a person with these stats:
- Sex: ${sex}
- Age: ${age} years
- Height: ${height_cm} cm
- Weight: ${weight_kg} kg

Use the Mifflin-St Jeor equation. Return ONLY a JSON object with this exact format, nothing else:
{"bmr": <number>}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const result = JSON.parse(text.trim())
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to parse BMR response' }, { status: 500 })
  }
}
