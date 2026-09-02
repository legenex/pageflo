import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Compass,
  AlertTriangle,
  Cog,
  MousePointerClick,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { Eyebrow, Page, PageHeader } from '@/components/pageflo/primitives'
import {
  SECTIONS,
  CONCEPTS,
  FIRST_RUN,
  STATUS_LABEL,
  countByStatus,
  ALL_PAGES,
  type PageStatus,
  type HandbookPage,
} from '@/lib/handbook'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<PageStatus, { icon: typeof CheckCircle2; className: string }> = {
  working: { icon: CheckCircle2, className: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' },
  partial: { icon: CircleDot, className: 'text-amber-400 border-amber-400/30 bg-amber-400/10' },
  placeholder: { icon: CircleDashed, className: 'text-zinc-400 border-zinc-400/25 bg-zinc-400/10' },
}

function StatusChip({ status }: { status: PageStatus }) {
  const { icon: Icon, className } = STATUS_STYLE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap ${className}`}
    >
      <Icon className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Stable anchor for a page card, so the contents list can link straight to it. */
const anchorOf = (sectionId: string, page: HandbookPage): string =>
  `${sectionId}--${page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/**
 * One screen: what it is for, how to use it, and what it does underneath.
 *
 * The three blocks are kept visually distinct because they answer different
 * questions. Someone mid-task reads the steps; someone debugging surprising
 * behaviour reads the mechanism; the warnings are the things that cost real
 * money or real data if nobody says them out loud.
 */
function PageCard({ page, sectionId }: { page: HandbookPage; sectionId: string }) {
  const id = anchorOf(sectionId, page)
  return (
    <li
      id={id}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 card-edge scroll-mt-6"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-[16px] font-semibold text-white">{page.title}</h3>
        <StatusChip status={page.status} />
        <Link
          href={page.route}
          title={page.pattern ? `Opens ${page.route}, since this screen needs a Site` : undefined}
          className="font-mono text-[11px] text-sky-400 hover:text-sky-300 underline underline-offset-2"
        >
          {page.pattern || page.route}
        </Link>
      </div>

      <p className="text-[14px] text-[var(--color-ink-muted)] leading-relaxed mt-2 max-w-[80ch]">
        {page.purpose}
      </p>

      <div className="grid gap-4 mt-4 md:grid-cols-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-muted)] mb-2">
            <MousePointerClick className="w-3 h-3" />
            How to use it
          </h4>
          <ol className="flex flex-col gap-1.5 list-decimal list-outside pl-4">
            {page.use.map((step) => (
              <li key={step} className="text-[13px] text-[var(--color-ink-muted)] leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h4 className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-muted)] mb-2">
            <Cog className="w-3 h-3" />
            How it works
          </h4>
          <ul className="flex flex-col gap-1.5">
            {page.mechanism.map((m) => (
              <li key={m} className="text-[13px] text-[var(--color-ink-muted)] leading-relaxed">
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {page.watchOut?.length ? (
        <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
          <h4 className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-1.5">
            <AlertTriangle className="w-3 h-3" />
            Watch out for
          </h4>
          <ul className="flex flex-col gap-1.5">
            {page.watchOut.map((w) => (
              <li key={w} className="text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

export default async function HandbookPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/sign-in?next=/admin/handbook')

  const notBuilt = countByStatus('placeholder')

  return (
    <Page>
      <PageHeader
        title="Handbook"
        subtitle={`Every screen in ${PRODUCT_NAME}: what it is for, how to use it, and what it does underneath. The mechanism matters as much as the buttons, because most of what surprises people here is mechanical rather than visual.`}
      />

      <dl className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: 'Screens', value: ALL_PAGES.length, tone: '' },
          { label: 'Working', value: countByStatus('working'), tone: 'text-pos' },
          { label: 'Partly built', value: countByStatus('partial'), tone: 'text-warn' },
          { label: 'Not built yet', value: notBuilt, tone: notBuilt > 0 ? 'text-ink-muted' : '' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 px-3.5 py-3"
          >
            <dt>
              <Eyebrow>{s.label}</Eyebrow>
            </dt>
            <dd className={`mt-2 text-[22px] font-bold leading-none tabular-nums ${s.tone || 'text-ink'}`}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {notBuilt > 0 ? (
        <p className="mb-5 max-w-[78ch] text-[12.5px] leading-[1.65] text-ink-muted">
          {notBuilt} {notBuilt === 1 ? 'screen renders' : 'screens render'} a &ldquo;Coming soon&rdquo; panel. They
          are listed below with what to use instead, rather than left out, because finding out by clicking is the
          expensive way to learn it.
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:items-start">
        {/* Contents. Sticky on wide screens because the page is long and the
            most common use is jumping to one screen, not reading it through. */}
        <nav className="hidden lg:block lg:sticky lg:top-6 mb-8 lg:mb-0" aria-label="Contents">
          <h2 className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--color-ink-muted)] mb-3">
            Contents
          </h2>
          <ul className="flex flex-col gap-3 border-l border-[var(--color-border)] pl-3">
            <li>
              <a href="#start-here" className="text-[12.5px] text-white hover:text-sky-300">
                Start here
              </a>
            </li>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-[12.5px] text-white hover:text-sky-300">
                  {section.title}
                </a>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {section.pages.map((p) => (
                    <li key={anchorOf(section.id, p)}>
                      <a
                        href={`#${anchorOf(section.id, p)}`}
                        className="text-[11.5px] text-[var(--color-ink-muted)] hover:text-sky-300 leading-snug block"
                      >
                        {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <section id="start-here" className="scroll-mt-6">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold text-white tracking-tight">
              <Compass className="w-5 h-5 text-[var(--color-ink-muted)]" />
              Start here
            </h2>
            <p className="text-[14px] text-[var(--color-ink-muted)] mt-2 leading-relaxed max-w-[78ch]">
              The whole system is one idea repeated: a brand is the parent, content is written without a brand
              on it, and a deployment binds the two together at a URL. Learn these words and the screens stop
              needing explanation.
            </p>

            <dl className="grid gap-3 mt-5 md:grid-cols-2">
              {CONCEPTS.map((c) => (
                <div
                  key={c.term}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4"
                >
                  <dt className="text-[14px] font-semibold text-white">{c.term}</dt>
                  <dd className="text-[13px] text-[var(--color-ink-muted)] leading-relaxed mt-1">{c.meaning}</dd>
                </div>
              ))}
            </dl>

            <h3 className="text-[16px] font-semibold text-white mt-8">Setting up a new brand, in order</h3>
            <p className="text-[13px] text-[var(--color-ink-muted)] mt-1 leading-relaxed max-w-[78ch]">
              The order matters. Brand before pages, because pages take their colours from the brand. Domain
              before traffic, because a certificate takes a few minutes to become real.
            </p>
            <ol className="flex flex-col gap-2.5 mt-4">
              {FIRST_RUN.map((s, i) => (
                <li
                  key={s.step}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 flex gap-3.5"
                >
                  <span className="shrink-0 w-6 h-6 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[12px] font-mono text-[var(--color-ink-muted)] flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-white">{s.step}</span>
                      <Link
                        href={s.route}
                        className="font-mono text-[11px] text-sky-400 hover:text-sky-300 underline underline-offset-2"
                      >
                        {s.route}
                      </Link>
                    </div>
                    <p className="text-[13px] text-[var(--color-ink-muted)] leading-relaxed mt-1 max-w-[78ch]">
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="border-t border-[var(--color-border)] pt-8 mt-10 scroll-mt-6"
            >
              <h2 className="text-[20px] font-semibold text-white tracking-tight">{section.title}</h2>
              <p className="text-[14px] text-[var(--color-ink-muted)] mt-1.5 leading-relaxed max-w-[78ch]">
                {section.blurb}
              </p>
              <ol className="flex flex-col gap-3 mt-5">
                {section.pages.map((page) => (
                  <PageCard key={anchorOf(section.id, page)} page={page} sectionId={section.id} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </Page>
  )
}
