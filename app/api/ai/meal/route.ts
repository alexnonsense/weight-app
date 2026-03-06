import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, imageBase64, imageMimeType } = await req.json()
  // messages: { role: 'user' | 'assistant', content: string }[]
  // imageBase64: optional base64 image string (first message only)
  // imageMimeType: e.g. 'image/jpeg'

  const systemPrompt = `You are a nutrition assistant helping estimate calories and protein in meals.

Your job:
1. If the description or photo is unclear (e.g. missing portion size or cooking method), ask ONE short clarifying question.
2. Once you have enough info, respond with ONLY this JSON and nothing else:
{"done": true, "calories": <number>, "protein_g": <number>, "summary": "<brief meal description>"}

Never ask more than 2 clarifying questions. If still unclear after 2 questions, make a reasonable estimate.
Do not explain your reasoning once you return JSON.`

  // Build the message list, injecting image into first user message if provided
  const apiMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }, i: number) => {
    if (i === 0 && imageBase64 && m.role === 'user') {
      return {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: imageMimeType, data: imageBase64 },
          },
          { type: 'text' as const, text: m.content || 'What is in this meal? Estimate calories and protein.' },
        ],
      }
    }
    return { role: m.role as 'user' | 'assistant', content: m.content }
  })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: systemPrompt,
    messages: apiMessages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(cleaned)
    if (parsed.done) {
      return NextResponse.json({ done: true, calories: parsed.calories, protein_g: parsed.protein_g, summary: parsed.summary, reply: null })
    }
  } catch {
    // Not JSON — clarifying question
  }

  return NextResponse.json({ done: false, calories: null, protein_g: null, summary: null, reply: text })
}
