import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/', '/onboarding', '/subscribe', '/api/stripe']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip public routes
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Skip static files and Next internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Check trial and subscription
  const [profileRes, subRes] = await Promise.all([
    supabase.from('user_profiles').select('created_at').eq('user_id', user.id).single(),
    supabase.from('subscriptions').select('status').eq('user_id', user.id).single(),
  ])

  const createdAt = profileRes.data?.created_at
  const trialActive = createdAt
    ? new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000 > Date.now()
    : true // no profile yet — let them through to onboarding

  const subscriptionActive = subRes.data?.status === 'active'

  if (!trialActive && !subscriptionActive) {
    return NextResponse.redirect(new URL('/subscribe', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
