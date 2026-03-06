'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function SubscribeSuccessPage() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Small delay to let webhook process
    const t = setTimeout(() => setShow(true), 1000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-[#111827] mb-2">You're subscribed!</h1>
        <p className="text-[#6B7280] text-sm mb-8">
          Welcome to Weight Tracker. Your subscription is now active.
        </p>
        {show && (
          <Link
            href="/dashboard"
            className="inline-block py-3 px-8 bg-[#4F46E5] text-white font-medium rounded-xl hover:bg-[#4338CA] transition-colors"
          >
            Go to dashboard →
          </Link>
        )}
      </div>
    </div>
  )
}
