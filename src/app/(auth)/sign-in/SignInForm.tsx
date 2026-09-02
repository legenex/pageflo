'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { signIn } from './actions'

const FIELD =
  'w-full rounded-app border border-border bg-surface-deep py-2.5 pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-dim'

/**
 * `siteHref` is the public site to return to. On a dedicated console host `/`
 * redirects straight back to `/admin`, and therefore to this form, so the link
 * has to be the marketing origin rather than the current origin's root.
 */
export function SignInForm({ redirectTo, siteHref = '/' }: { redirectTo: string; siteHref?: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [pending, start] = useTransition()

  const onSubmit = (formData: FormData) => {
    setError(null)
    start(async () => {
      const result = await signIn(formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.replace(result.redirect)
      router.refresh()
    })
  }

  return (
    <form action={onSubmit} className="space-y-3.5">
      <input type="hidden" name="redirect" value={redirectTo} />

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Email
        </span>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="you@company.com"
            className={FIELD}
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Password
        </span>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            className={`${FIELD} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-app-sm text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
          </button>
        </div>
      </label>

      {error ? (
        <div
          role="alert"
          className="rounded-app border border-neg/30 bg-neg/10 px-3 py-2.5 text-[12.5px] leading-[1.55] text-neg"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-app bg-brand px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? 'Signing in' : 'Sign in'}
        {pending ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>

      <div className="flex items-center justify-between pt-0.5 text-[11.5px]">
        <Link href="/cms/forgot" className="text-ink-muted transition-colors hover:text-ink">
          Forgot password?
        </Link>
        <a href={siteHref} className="text-ink-muted transition-colors hover:text-ink">
          Back to site
        </a>
      </div>
    </form>
  )
}
