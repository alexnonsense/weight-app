import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, profile } = await req.json()
  // messages: { role: 'user' | 'assistant', content: string }[]
  // profile: { sex, age, weight_kg }

  const systemPrompt = `You are a fitness assistant helping estimate calories burned from exercise.
The user's profile: sex=${profile.sex}, age=${profile.age}, weight=${profile.weight_kg}kg.

Your job:
1. If the user's description is unclear, ask ONE short clarifying question (e.g. duration, intensity, type).
2. Once you have enough info, respond with ONLY this JSON and nothing else:
{"done": true, "calories_burned": <number>, "summary": "<brief description>"}

Never ask more than 2 clarifying questions total. If still unclear after 2 questions, make a reasonable estimate.
Do not explain your reasoning once you return JSON.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: systemPrompt,
    messages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Try to parse as final JSON answer
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(cleaned)
    if (parsed.done) {
      return NextResponse.json({ done: true, calories_burned: parsed.calories_burned, summary: parsed.summary, reply: null })
    }
  } catch {
    // Not JSON — it's a clarifying question
  }

  return NextResponse.json({ done: false, calories_burned: null, summary: null, reply: text })
}
