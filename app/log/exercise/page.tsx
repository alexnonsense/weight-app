'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Message = { role: 'user' | 'assistant'; content: string }

export default function LogExercisePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [profile, setProfile] = useState<{ sex: string; age: number; weight_kg: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [result, setResult] = useState<{ calories_burned: number; summary: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data } = await supabase.from('user_profiles').select('sex, age, starting_weight_kg').eq('user_id', user.id).single()
      if (data) setProfile({ sex: data.sex, age: data.age, weight_kg: data.starting_weight_kg })
    }
    loadProfile()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || !profile) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const res = await fetch('/api/ai/exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages, profile }),
    })
    const data = await res.json()

    if (data.done) {
      setResult({ calories_burned: data.calories_burned, summary: data.summary })
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    }
    setLoading(false)
  }

  async function saveExercise() {
    if (!result) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('exercise_logs').insert({
      user_id: user.id,
      date: today,
      description: result.summary,
      calories_burned: result.calories_burned,
    })

    if (!error) setSaved(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-[#6B7280] hover:text-[#374151]">← Back</Link>
        <h1 className="text-xl font-bold text-[#111827]">Log exercise</h1>
      </div>

      {saved ? (
        <div className="bg-[#ECFDF5] rounded-2xl p-6 text-center">
          <p className="text-2xl font-bold text-[#059669]">{result?.calories_burned} kcal burned</p>
          <p className="text-[#6B7280] mt-1 text-sm">{result?.summary}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-[#4F46E5] font-medium">Back to dashboard →</Link>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-5">
            <p className="text-sm text-[#6B7280] mb-1">Estimated calories burned</p>
            <p className="text-3xl font-bold text-[#059669]">{result.calories_burned} kcal</p>
            <p className="text-sm text-[#374151] mt-1">{result.summary}</p>
          </div>
          <button
            onClick={saveExercise}
            disabled={loading}
            className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save to today'}
          </button>
          <button onClick={() => { setResult(null); setMessages([]) }} className="w-full py-2.5 text-sm text-[#6B7280] hover:text-[#374151]">
            Start over
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 mb-4">
            {messages.length === 0 && (
              <p className="text-sm text-[#6B7280] text-center py-8">
                Describe your exercise — e.g. "1 hour run" or "45 min weight training"
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                  m.role === 'user'
                    ? 'bg-[#4F46E5] text-white rounded-br-sm'
                    : 'bg-white border border-[#E5E7EB] text-[#374151] rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#E5E7EB] px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm text-[#9CA3AF]">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Describe your exercise..."
              className="flex-1 px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
              disabled={loading}
              autoFocus
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-xl hover:bg-[#4338CA] disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  )
}
