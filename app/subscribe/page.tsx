'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SubscribePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubscribe() {
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, email: user.email }),
    })

    const data = await res.json()

    if (data.url) {
      window.location.href = data.url
    } else {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#111827]">Your free trial has ended</h1>
          <p className="text-[#6B7280] mt-2 text-sm">Subscribe to keep tracking your calories and weight</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
          <div className="text-center mb-6">
            <p className="text-4xl font-bold text-[#111827]">£4</p>
            <p className="text-sm text-[#6B7280] mt-1">per month · cancel anytime</p>
          </div>

          <ul className="space-y-2 mb-6">
            {[
              'Daily calorie & protein tracking',
              'AI-powered meal analysis from photos',
              'Exercise calorie estimation',
              'Weight vs expected weight tracking',
            ].map(feature => (
              <li key={feature} className="flex items-center gap-2 text-sm text-[#374151]">
                <span className="text-[#059669] font-bold">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>
          )}

          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full py-3 bg-[#4F46E5] text-white font-medium rounded-xl hover:bg-[#4338CA] transition-colors disabled:opacity-60"
          >
            {loading ? 'Redirecting to payment...' : 'Subscribe for £4/month'}
          </button>

          <button
            onClick={handleSignOut}
            className="w-full mt-3 py-2 text-sm text-[#9CA3AF] hover:text-[#6B7280]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
