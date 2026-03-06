'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Message = { role: 'user' | 'assistant'; content: string }

export default function LogMealPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [result, setResult] = useState<{ calories: number; protein_g: number; summary: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function sendMessage() {
    if (!input.trim() && !imageFile) return
    const userContent = input.trim() || 'What is in this meal?'
    const userMsg: Message = { role: 'user', content: userContent }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    let imageBase64 = null
    let imageMimeType = null

    // Only send image on first message
    if (imageFile && messages.length === 0) {
      imageBase64 = await toBase64(imageFile)
      imageMimeType = imageFile.type
    }

    const res = await fetch('/api/ai/meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages, imageBase64, imageMimeType }),
    })
    const data = await res.json()

    if (data.done) {
      setResult({ calories: data.calories, protein_g: data.protein_g, summary: data.summary })
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    }
    setLoading(false)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function saveMeal() {
    if (!result) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('meal_entries').insert({
      user_id: user.id,
      date: today,
      description: result.summary,
      calories: result.calories,
      protein_g: result.protein_g,
    })

    if (!error) setSaved(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-[#6B7280] hover:text-[#374151]">← Back</Link>
        <h1 className="text-xl font-bold text-[#111827]">Log a meal</h1>
      </div>

      {saved ? (
        <div className="bg-[#ECFDF5] rounded-2xl p-6 text-center">
          <p className="text-2xl font-bold text-[#059669]">{result?.calories} kcal</p>
          <p className="text-sm text-[#6B7280] mt-1">{result?.protein_g}g protein · {result?.summary}</p>
          <div className="flex gap-3 mt-4 justify-center">
            <button
              onClick={() => { setSaved(false); setResult(null); setMessages([]); setImageFile(null); setImagePreview(null) }}
              className="text-sm text-[#4F46E5] font-medium"
            >
              Log another meal
            </button>
            <span className="text-[#E5E7EB]">·</span>
            <Link href="/dashboard" className="text-sm text-[#4F46E5] font-medium">Dashboard →</Link>
          </div>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-5">
            <p className="text-sm text-[#6B7280] mb-1">Estimated nutrition</p>
            <p className="text-3xl font-bold text-[#059669]">{result.calories} kcal</p>
            <p className="text-sm text-[#374151] mt-1">{result.protein_g}g protein · {result.summary}</p>
          </div>
          <button
            onClick={saveMeal}
            disabled={loading}
            className="w-full py-2.5 bg-[#4F46E5] text-white text-sm font-medium rounded-lg hover:bg-[#4338CA] disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save to today'}
          </button>
          <button onClick={() => { setResult(null); setMessages([]) }} className="w-full py-2.5 text-sm text-[#6B7280] hover:text-[#374151]">
            Start over
          </button>
        </div>
      ) : (
        <>
          {/* Image preview */}
          {imagePreview && (
            <div className="mb-3 relative">
              <img src={imagePreview} alt="Meal" className="w-full rounded-xl object-cover max-h-48" />
              <button
                onClick={() => { setImageFile(null); setImagePreview(null) }}
                className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full"
              >
                Remove
              </button>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 space-y-3 mb-4 min-h-[120px]">
            {messages.length === 0 && !imagePreview && (
              <p className="text-sm text-[#6B7280] text-center py-8">
                Type what you ate, take a photo 📷, or upload from your library 🖼️
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
                  Analysing...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="p-2.5 border border-[#E5E7EB] rounded-xl text-[#6B7280] hover:text-[#374151] hover:border-[#9CA3AF] transition-colors"
              title="Take photo"
            >
              📷
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 border border-[#E5E7EB] rounded-xl text-[#6B7280] hover:text-[#374151] hover:border-[#9CA3AF] transition-colors"
              title="Upload from library"
            >
              🖼️
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={imageFile ? "Add a description (optional)" : "e.g. chicken salad with olive oil..."}
              className="flex-1 px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !imageFile)}
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
