import type { LegalFacts } from '@/lib/pageflo/legal'
import { PageFloWordmark } from './PageFloLogo'

export type LegalSection = {
  id: string
  title: string
  paras: string[]
  items?: string[]
}

/**
 * Shared chrome for the public legal pages.
 *
 * These pages only render when `legalFacts()` returns a complete set, so every
 * value interpolated below is a fact the operating business supplied. Nothing
 * here invents an entity, an address, a contact, a jurisdiction, a retention
 * period or a subprocessor.
 */
export function LegalPage({
  title,
  intro,
  sections,
  facts,
  appUrl,
}: {
  title: string
  intro: string
  sections: LegalSection[]
  facts: LegalFacts
  appUrl: string
}) {
  return (
    <div className="min-h-screen bg-canvas font-sans text-ink antialiased">
      <header className="border-b border-[#1A2130]">
        <div className="mx-auto flex h-[60px] max-w-[900px] items-center gap-4 px-5 sm:px-6">
          <a href="/" aria-label="PageFlo home">
            <PageFloWordmark />
          </a>
          <span className="flex-1" />
          <a href={`${appUrl}/sign-in`} className="text-[13px] text-ink-muted transition-colors hover:text-ink">
            Sign in
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <main>
          <h1 className="text-[30px] font-bold tracking-[-0.02em] text-ink sm:text-[38px]">{title}</h1>
          <p className="mt-3 font-mono text-[11.5px] text-ink-dim">Last updated {facts.lastUpdated}</p>
          <p className="mt-6 max-w-[680px] text-[15px] leading-[1.75] text-ink-secondary">{intro}</p>

          <div className="mt-4 rounded-app border border-border bg-surface-1 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-dim">Operated by</div>
            <div className="mt-2 text-[14px] font-semibold text-ink">{facts.entity}</div>
            <address className="mt-1 whitespace-pre-line text-[13px] not-italic leading-[1.6] text-ink-muted">
              {facts.address}
            </address>
            <div className="mt-3 text-[13px] text-ink-muted">
              Data protection contact:{' '}
              <a href={`mailto:${facts.privacyContact}`} className="text-brand hover:underline">
                {facts.privacyContact}
              </a>
            </div>
            <div className="mt-1 text-[13px] text-ink-muted">Governing jurisdiction: {facts.jurisdiction}</div>
          </div>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="mt-10 scroll-mt-20">
              <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
                {i + 1}. {s.title}
              </h2>
              {s.paras.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 max-w-[680px] text-[14px] leading-[1.75] text-ink-secondary">
                  {p}
                </p>
              ))}
              {s.items && s.items.length > 0 ? (
                <ul className="mt-3 max-w-[680px] space-y-2">
                  {s.items.map((it) => (
                    <li key={it} className="flex gap-2.5 text-[14px] leading-[1.7] text-ink-muted">
                      <span aria-hidden="true" className="mt-[9px] h-[4px] w-[4px] shrink-0 rounded-full bg-brand" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </main>

        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-dim">On this page</div>
            <ul className="mt-3 space-y-1.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded-app-sm py-1 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <footer className="border-t border-[#1A2130] px-5 py-8 sm:px-6">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-4 text-[12px] text-ink-dim">
          <span>&copy; {new Date().getFullYear()} {facts.entity}</span>
          <span className="flex-1" />
          <a href="/privacy" className="transition-colors hover:text-ink">
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  )
}
