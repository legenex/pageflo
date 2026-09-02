import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { PageFloMark } from '@/components/marketing/PageFloLogo'
import { COMPANY_NAME, PRODUCT_CONCEPTS, PRODUCT_NAME } from '@/lib/pageflo/product'
import { marketingOrigin } from '@/lib/pageflo/hosts'
import { SignInForm } from './SignInForm'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ redirect?: string; next?: string }> }

/**
 * Only same-origin, absolute-path redirects are honoured. `//evil.com` is a
 * protocol-relative URL that a browser resolves as a different origin, so the
 * `//` case is rejected explicitly rather than relying on the leading `/`.
 */
const safeNext = (raw: string | undefined): string => {
  if (!raw) return '/admin/overview'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/admin/overview'
  return raw
}

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams
  // Two parameter names reach this page. `redirect` is what the admin layout
  // sends; `next` is what several server actions send. Honouring only one of
  // them silently dropped operators back on Overview after a deep-link sign-in.
  const safeRedirect = safeNext(params.redirect ?? params.next)

  const user = await getCurrentUser()
  if (user) redirect(safeRedirect)

  const marketing = marketingOrigin()

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-5 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-[760px] w-[760px] -translate-x-1/2 rounded-full bg-brand/10 blur-[130px]" />
        <div className="absolute -bottom-56 right-[-120px] h-[520px] w-[520px] rounded-full bg-info/[0.07] blur-[130px]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        <header className="mb-7 text-center">
          <a
            href={marketing || '/'}
            className="inline-flex items-center gap-2.5 rounded-app-sm"
            aria-label={`${PRODUCT_NAME} home`}
          >
            <PageFloMark size={30} className="text-ink" />
            <span className="text-[23px] font-bold leading-none tracking-[-0.02em] text-ink">
              Page<span className="text-brand">Flo</span>
            </span>
          </a>
          <h1 className="mt-6 text-[24px] font-bold tracking-[-0.02em] text-ink">Sign in to {PRODUCT_NAME}</h1>
          <p className="mx-auto mt-2 max-w-[330px] text-[13px] leading-[1.6] text-ink-muted">
            {PRODUCT_CONCEPTS.join(' · ')}
          </p>
        </header>

        <div className="rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 p-6 shadow-[var(--shadow-pop)] sm:p-7">
          <SignInForm redirectTo={safeRedirect} siteHref={marketing || '/'} />
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-ink-dim">
          <span>
            © {new Date().getFullYear()} {COMPANY_NAME}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{PRODUCT_NAME}</span>
        </footer>
      </div>
    </main>
  )
}
