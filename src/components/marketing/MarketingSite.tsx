import { PRODUCT_DESCRIPTION, PRODUCT_TAGLINE } from '@/lib/pageflo/product'
import { marketingLegalLinks } from '@/lib/pageflo/marketing-routes'
import { EXAMPLE_BRANDS as B } from './tokens'
import { MarketingNav, type NavLink } from './MarketingNav'
import { PageFloWordmark } from './PageFloLogo'

/* --------------------------------------------------------------------------
   Shared marketing primitives
   -------------------------------------------------------------------------- */

const NAV_LINKS: NavLink[] = [
  { href: '#product', label: 'Product' },
  { href: '#builders', label: 'Builders' },
  { href: '#flows', label: 'Flows' },
  { href: '#leads', label: 'Leads' },
  { href: '#integrity', label: 'Integrity' },
  { href: '#how', label: 'How it works' },
]

function Section({
  id,
  children,
  className = '',
}: {
  id?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`px-5 py-16 sm:px-6 sm:py-20 ${className}`}>
      <div className="mx-auto max-w-[1200px]">{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">{children}</div>
  )
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-[640px] text-[15px] leading-[1.7] text-ink-muted">{children}</p>
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="max-w-[720px] text-[26px] font-bold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[32px]">
      {children}
    </h2>
  )
}

/**
 * Every panel on this page shows invented example content. This badge says so,
 * on each one, because a screenshot-shaped panel of plausible numbers reads as a
 * customer's real dashboard unless it is labelled otherwise.
 */
function ExampleBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-app-sm border border-border px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-dim ${className}`}
    >
      Example data
    </span>
  )
}

function Panel({
  children,
  className = '',
  label,
}: {
  children: React.ReactNode
  className?: string
  label?: string
}) {
  return (
    <div
      className={`overflow-hidden rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 ${className}`}
    >
      {label ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-[6px] w-[6px] rounded-full bg-[#2C3A4E]" />
            <span className="h-[6px] w-[6px] rounded-full bg-[#2C3A4E]" />
            <span className="h-[6px] w-[6px] rounded-full bg-[#2C3A4E]" />
          </span>
          <span className="truncate font-mono text-[10.5px] text-ink-dim">{label}</span>
          <span className="flex-1" />
          <ExampleBadge />
        </div>
      ) : null}
      {children}
    </div>
  )
}

function BrandDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[9px] w-[9px] shrink-0 rounded-[2px] border border-white/15"
      style={{ background: color }}
    />
  )
}

function StatePill({ label, tone }: { label: string; tone: 'pos' | 'warn' | 'neg' | 'muted' | 'teal' | 'purple' }) {
  const map = {
    pos: 'bg-pos/15 text-pos',
    warn: 'bg-warn/15 text-warn',
    neg: 'bg-neg/15 text-neg',
    teal: 'bg-accent-teal/15 text-accent-teal',
    purple: 'bg-accent-purple/15 text-accent-purple',
    muted: 'bg-ink-muted/12 text-ink-muted',
  } as const
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-app-sm px-[7px] py-[2px] text-[11px] font-semibold ${map[tone]}`}>
      <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-current" />
      {label}
    </span>
  )
}

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
)

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function MarketingSite({ appUrl }: { appUrl: string }) {
  const legalLinks = marketingLegalLinks()

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink antialiased">
      <a
        href="#product"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-app focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <MarketingNav links={NAV_LINKS} appUrl={appUrl} />

      {/* ---------------------------------------------------------------- HERO */}
      <section id="top" className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-[86px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(229,72,77,0.10) 0%, transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-[1200px]">
          <div className="max-w-[760px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-brand" />
              Dynamic acquisition infrastructure
            </span>
            <h1 className="mt-5 text-[38px] font-extrabold leading-[1.07] tracking-[-0.03em] text-ink sm:text-[56px]">
              Build every page.
              <br />
              <span className="text-brand">Control every path.</span>
            </h1>
            <p className="mt-5 max-w-[620px] text-[16px] leading-[1.65] text-ink-muted sm:text-[17px]">
              {PRODUCT_DESCRIPTION}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={`${appUrl}/sign-in`}
                className="inline-flex h-10 items-center gap-2 rounded-app-sm bg-brand px-[18px] text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Start building
                <Arrow />
              </a>
              <a
                href="#product"
                className="inline-flex h-10 items-center rounded-app-sm border border-border px-[18px] text-[14px] font-medium text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
              >
                See PageFlo in action
              </a>
            </div>
          </div>

          {/* One source asset, three branded deployments. */}
          <Panel className="mt-12" label="app.pageflo.io/deployments">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-ink-dim">
                  Source asset
                </div>
                <div className="mt-2 rounded-app border border-border bg-surface-deep p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                    Quiz &middot; brand free
                  </div>
                  <div className="mt-1 text-[15px] font-semibold text-ink">MVA Tiered Intake</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['18 steps', '4 tiers', '3 variants'].map((t) => (
                      <span
                        key={t}
                        className="rounded-app-sm border border-border px-[6px] py-[2px] font-mono text-[10px] text-ink-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-ink-dim">
                  Child routes
                </div>
                <ul className="mt-2 space-y-1.5">
                  {[
                    { label: 'Tier 2 · qualify', n: '3', color: 'var(--color-accent-purple)' },
                    { label: 'Tier 3 · collect', n: '5', color: 'var(--color-accent-teal)' },
                    { label: 'Tier 4 · route', n: '3', color: 'var(--color-brand)' },
                  ].map((r) => (
                    <li
                      key={r.label}
                      className="flex items-center gap-2 rounded-app-sm border border-border bg-surface-deep px-2.5 py-2"
                    >
                      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-[1px]" style={{ background: r.color }} />
                      <span className="flex-1 truncate text-[12px] text-ink-secondary">{r.label}</span>
                      <span className="font-mono text-[10.5px] text-ink-dim">{r.n}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-ink-dim">
                  Deployments &middot; one asset, three identities
                </div>
                <ul className="mt-2 space-y-2">
                  {[
                    { brand: 'Reclaim Group', color: B.reclaim, domain: 'claim.reclaimgroup.example/check', state: 'Live', tone: 'pos', template: 'Editorial Inline', published: 'Aug 30' },
                    { brand: 'SafeStride', color: B.safestride, domain: 'go.safestride.example/eligibility', state: 'Live', tone: 'pos', template: 'Direct Panel', published: 'Aug 29' },
                    { brand: 'Check A Case', color: B.checkacase, domain: 'start.checkacase.example/q', state: 'Draft', tone: 'muted', template: 'Fullscreen Focus', published: 'not published' },
                  ].map((d) => (
                    <li key={d.brand} className="rounded-app border border-border bg-surface-deep p-2.5">
                      <div className="flex items-center gap-2">
                        <BrandDot color={d.color} />
                        <span className="truncate text-[12.5px] font-medium text-ink">{d.brand}</span>
                        <span className="flex-1" />
                        <StatePill label={d.state} tone={d.tone as 'pos' | 'muted'} />
                      </div>
                      <div className="mt-1.5 truncate font-mono text-[10.5px] text-ink-dim">{d.domain}</div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-ink-muted">
                        <span>{d.template}</span>
                        <span aria-hidden="true" className="text-ink-dim">
                          &middot;
                        </span>
                        <span>{d.published}</span>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 rounded-app border border-border bg-surface-deep p-2.5">
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-ink-dim">
                    Page preview &middot; renders per brand
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { brand: 'Reclaim', color: B.reclaim },
                      { brand: 'SafeStride', color: B.safestride },
                      { brand: 'Check A Case', color: B.checkacase },
                    ].map((p) => (
                      <div key={p.brand} className="overflow-hidden rounded-app-sm border border-border bg-white">
                        <div className="h-[4px]" style={{ background: p.color }} />
                        <div className="p-2">
                          <div className="flex items-center gap-1">
                            <span aria-hidden="true" className="h-[6px] w-[6px] rounded-[2px]" style={{ background: p.color }} />
                            <span className="truncate text-[8px] font-semibold text-[#132018]">{p.brand}</span>
                          </div>
                          <div className="mt-1.5 h-[4px] w-full rounded-full bg-[#E8ECEA]" />
                          <div className="mt-1 h-[4px] w-3/4 rounded-full bg-[#EFF2F0]" />
                          <div className="mt-2 h-[8px] w-1/2 rounded-[2px]" style={{ background: p.color, opacity: 0.85 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </section>

      {/* -------------------------------------------------------- ONE PLATFORM */}
      <Section id="product" className="border-t border-[#1A2130]">
        <Eyebrow>One system</Eyebrow>
        <H2>One platform, from first click to qualified lead.</H2>
        <Lede>
          Most teams run a page builder, a quiz tool, a domain manager and a lead router, and spend their time keeping
          four systems agreeing with each other. PageFlo is one system. The page, the flow, the routing and the
          destination are the same object, so a change lands everywhere it should and nowhere it should not.
        </Lede>

        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { step: 'Step 01', label: 'Traffic', sub: 'Paid click lands on a branded domain.', color: 'var(--color-accent-blue)' },
            { step: 'Step 02', label: 'Page', sub: 'Blocks render in the brand bound to that path.', color: 'var(--color-accent-blue)' },
            { step: 'Step 03', label: 'Flow', sub: 'Steps, branches and variants decide what to ask next.', color: 'var(--color-accent-purple)' },
            { step: 'Step 04', label: 'Qualification', sub: 'Tier rules screen, qualify and collect.', color: 'var(--color-accent-teal)' },
            { step: 'Step 05', label: 'Lead', sub: 'Answers, consent, validation and path stored together.', color: 'var(--color-pos)' },
            { step: 'Step 06', label: 'Destination', sub: 'Routed to the system that fits the profile.', color: 'var(--color-brand)' },
          ].map((p) => (
            <li key={p.step} className="rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 p-3.5">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-[1px]" style={{ background: p.color }} />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">{p.step}</span>
              </div>
              <div className="mt-2 text-[14px] font-semibold text-ink">{p.label}</div>
              <div className="mt-1 text-[12px] leading-[1.5] text-ink-muted">{p.sub}</div>
            </li>
          ))}
        </ol>
      </Section>

      {/* --------------------------------------------------------------- SITES */}
      <Section id="builders" className="border-t border-[#1A2130]">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Sites</Eyebrow>
            <H2>Build complete acquisition sites without rebuilding your stack every time.</H2>
            <Lede>
              Structured blocks, not templates. Build once and every brand renders it in its own colours, type and phone
              numbers. Import an existing page from a URL and it arrives as editable blocks, not a screenshot.
            </Lede>
          </div>
          <Panel label="Page builder &middot; block list">
            <ul className="divide-y divide-border">
              {[
                { label: 'Hero', active: true },
                { label: 'Eligibility bar', active: false },
                { label: 'Trust row', active: false },
                { label: 'Steps', active: false },
                { label: 'Embedded flow', active: false },
                { label: 'FAQ', active: false },
                { label: 'Disclosure', active: false },
              ].map((b) => (
                <li
                  key={b.label}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] ${
                    b.active ? 'bg-brand/10 text-brand' : 'text-ink-secondary'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M8 6h8M8 12h8M8 18h8" />
                  </svg>
                  {b.label}
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-3">
              <span className="inline-flex h-7 items-center rounded-app-sm border border-dashed border-border px-3 text-[12px] text-ink-dim">
                + Add block
              </span>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ------------------------------------------------------- LANDING PAGES */}
      <Section className="border-t border-[#1A2130]">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <Panel className="order-2 lg:order-1" label="One landing page, three deployments">
            <ul className="divide-y divide-border">
              {[
                { brand: 'Reclaim Group', domain: 'claim.reclaimgroup.example/eligibility', color: B.reclaim },
                { brand: 'SafeStride', domain: 'go.safestride.example/eligibility', color: B.safestride },
                { brand: 'Check A Case', domain: 'start.checkacase.example/eligibility', color: B.checkacase },
              ].map((t) => (
                <li key={t.brand} className="flex items-center gap-2.5 px-3.5 py-3">
                  <BrandDot color={t.color} />
                  <span className="w-[120px] shrink-0 truncate text-[12.5px] text-ink">{t.brand}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-dim">{t.domain}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="order-1 lg:order-2">
            <Eyebrow>Landing pages</Eyebrow>
            <H2>Launch pages as fast as campaigns move.</H2>
            <Lede>
              Build a conversion-focused page, connect it to a flow, deploy it to as many domains as you run. The page
              does not care which brand it is wearing.
            </Lede>
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------------------- FLOWS */}
      <Section id="flows" className="border-t border-[#1A2130]">
        <Eyebrow>Quizzes and flows</Eyebrow>
        <H2>Turn questions into intelligent routing.</H2>
        <Lede>
          Multi-step qualification with conditional logic, branching paths and custom outcomes. Variants let you test
          copy without forking the flow.
        </Lede>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { kind: 'Question', key: 't1_q1', title: 'Was the incident in the last 24 months?', color: 'var(--color-accent-blue)', options: ['Yes · 24m', 'No', 'Not sure'] },
            { kind: 'Branch', key: 't2_q1', title: 'Already spoken to a representative?', color: 'var(--color-accent-purple)', options: ['No → qualify', 'Ongoing → hard DQ', 'Ended → shared step'] },
            { kind: 'Variant', key: 't2_q1_b', title: 'Copy variant B, same routing', color: 'var(--color-accent-purple)', options: ['50 / 50 split', 'no fork'] },
            { kind: 'Outcome', key: 't4_route', title: 'Route by tier and state', color: 'var(--color-brand)', options: ['Destination A', 'Destination B', 'Fallback'] },
          ].map((n) => (
            <div
              key={n.key}
              className="rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 p-3.5"
              style={{ borderLeft: `2px solid ${n.color}` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-muted">{n.kind}</span>
                <span className="flex-1" />
                <span className="font-mono text-[9.5px] text-ink-dim">{n.key}</span>
              </div>
              <div className="mt-2 text-[13.5px] font-medium leading-[1.4] text-ink">{n.title}</div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {n.options.map((o) => (
                  <span key={o} className="rounded-app-sm border border-border bg-surface-deep px-1.5 py-[2px] text-[10px] text-ink-muted">
                    {o}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <ExampleBadge />
        </div>
      </Section>

      {/* --------------------------------------------------- PARENT AND CHILD */}
      <Section className="border-t border-[#1A2130]">
        <Eyebrow>Tiered qualification</Eyebrow>
        <H2>Build logic once. Route everywhere.</H2>
        <Lede>
          A flat quiz asks everyone everything. A tiered flow asks the qualifying question first, then hands the visitor
          to the child experience that matches them. Tier one screens. Tier two qualifies. Tier three collects. Tier four
          routes to the destination that fits that exact profile. Shared logic lives at the parent, so you maintain one
          system instead of six disconnected funnels.
        </Lede>

        <div className="mt-10 grid gap-3 lg:grid-cols-5">
          {[
            { label: 'Traffic', color: 'var(--color-accent-blue)', cards: [{ title: 'Paid click', sub: 'Any brand, any domain, any path you run.' }] },
            { label: 'Parent flow', color: 'var(--color-brand)', cards: [{ title: 'Tier 1 · screen', sub: 'One qualifying question before anything else is asked.', tag: 'Shared logic' }] },
            { label: 'Qualification', color: 'var(--color-accent-purple)', cards: [{ title: 'Tier 2 · qualify', sub: 'Conditions decide which child experience the visitor enters.', tag: '3 branches' }] },
            { label: 'Child flows', color: 'var(--color-accent-teal)', cards: [
              { title: 'Child flow A', sub: 'Full qualification path for the matching profile.' },
              { title: 'Child flow B', sub: 'Shorter path, different destination.' },
              { title: 'Child flow C', sub: 'Collects extra detail before routing.' },
            ] },
            { label: 'Destination', color: 'var(--color-pos)', cards: [{ title: 'Tier 4 · route', sub: 'The destination that fits that exact profile.', tag: 'Deduped events' }] },
          ].map((lane) => (
            <div key={lane.label}>
              <div className="mb-2.5 flex items-center gap-2">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-[1px]" style={{ background: lane.color }} />
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-ink-muted">{lane.label}</span>
              </div>
              <div className="space-y-2">
                {lane.cards.map((c) => (
                  <div key={c.title} className="rounded-app border border-border bg-surface-1 p-3">
                    <div className="text-[12.5px] font-semibold text-ink">{c.title}</div>
                    <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-muted">{c.sub}</div>
                    {'tag' in c && c.tag ? (
                      <div className="mt-2">
                        <span className="rounded-app-sm bg-surface-3 px-1.5 py-[2px] text-[10px] text-ink-secondary">{c.tag}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------- ADVERTORIALS */}
      <Section className="border-t border-[#1A2130]">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Advertorials</Eyebrow>
            <H2>Editorial experiences connected to the rest of your funnel.</H2>
            <Lede>
              Content-led acquisition pages that stay inside your infrastructure, sharing the same brands, domains,
              routing and lead destinations as everything else.
            </Lede>
          </div>
          <Panel label="Advertorial &middot; editorial layout">
            <div className="space-y-2 p-4">
              <div className="h-[10px] w-1/3 rounded-full bg-surface-3" />
              <div className="h-[16px] w-4/5 rounded-full bg-[#2A3646]" />
              <div className="h-[16px] w-3/5 rounded-full bg-[#2A3646]" />
              <div className="pt-2" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[7px] rounded-full bg-surface-3" style={{ width: `${100 - i * 7}%` }} />
              ))}
              <div className="pt-3">
                <div className="rounded-app border border-brand/30 bg-brand/10 p-3">
                  <div className="text-[11px] font-semibold text-brand">Embedded qualification flow</div>
                  <div className="mt-1 text-[11px] text-ink-muted">
                    The same flow the landing page and the quiz deployment use.
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </Section>

      {/* --------------------------------------------------------------- LEADS */}
      <Section id="leads" className="border-t border-[#1A2130]">
        <Eyebrow>Leads</Eyebrow>
        <H2>Capture the right lead with the right context.</H2>
        <Lede>
          Every captured lead carries its answers, its acquisition path and its campaign context. Consent captured,
          phone validated, conversion events deduplicated across client and server, then delivered to your destination.
        </Lede>

        <Panel className="mt-10" label="app.pageflo.io/admin/leads">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-3">
            {[
              { label: 'New', value: '61', tone: 'text-accent-blue' },
              { label: 'Qualified', value: '148', tone: 'text-accent-teal' },
              { label: 'Sold', value: '96', tone: 'text-pos' },
              { label: 'Soft DQ', value: '72', tone: 'text-warn' },
              { label: 'Delivery failures', value: '1', tone: 'text-neg' },
            ].map((s) => (
              <span key={s.label} className="inline-flex items-baseline gap-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-ink-muted">{s.label}</span>
                <span className={`font-mono text-[13px] font-semibold tabular-nums ${s.tone}`}>{s.value}</span>
              </span>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-surface-1">
                  {['Created', 'Lead ID', 'Source', 'Brand', 'Status', 'Consent', 'Delivery'].map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="border-b border-border px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-muted"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { t: 'Sep 01 08:12', id: 'ld_9f2a71', src: 'Quiz · MVA Tier 2', brand: 'Reclaim', color: B.reclaim, status: 'Sold', tone: 'pos', consent: 'Captured', delivery: 'Delivered', dTone: 'text-pos' },
                  { t: 'Sep 01 07:54', id: 'ld_9f2a5c', src: 'Quiz · MVA Tier 2', brand: 'Reclaim', color: B.reclaim, status: 'Qualified', tone: 'teal', consent: 'Captured', delivery: 'Delivered', dTone: 'text-pos' },
                  { t: 'Sep 01 07:31', id: 'ld_9f29e8', src: 'LP · Answer First', brand: 'SafeStride', color: B.safestride, status: 'Qualified', tone: 'teal', consent: 'Captured', delivery: 'Retrying', dTone: 'text-warn' },
                  { t: 'Sep 01 06:22', id: 'ld_9f2984', src: 'Advertorial · Editorial', brand: "Don't Settle", color: B.dontsettle, status: 'Contacted', tone: 'purple', consent: 'Captured', delivery: 'Delivered', dTone: 'text-pos' },
                  { t: 'Sep 01 05:47', id: 'ld_9f2930', src: 'Quiz · MVA Tier 3', brand: 'Reclaim', color: B.reclaim, status: 'Sold', tone: 'pos', consent: 'Captured', delivery: 'Delivered', dTone: 'text-pos' },
                ].map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink-muted">{l.t}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink-secondary">{l.id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-secondary">{l.src}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
                        <BrandDot color={l.color} />
                        {l.brand}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <StatePill label={l.status} tone={l.tone as 'pos' | 'teal' | 'purple'} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-ink-muted">{l.consent}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-[11.5px] ${l.dTone}`}>{l.delivery}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>

      {/* ------------------------------------------------------------- DOMAINS */}
      <Section className="border-t border-[#1A2130]">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Domains</Eyebrow>
            <H2>One control plane for every acquisition property.</H2>
            <Lede>
              Point a domain at PageFlo and it provisions the host and issues the certificate, then verifies over a real
              handshake before it says the word live. Your flows are already there waiting for it.
            </Lede>
          </div>
          <Panel label="app.pageflo.io/admin/brands/domains">
            <ul className="divide-y divide-border">
              {[
                { domain: 'claim.reclaimgroup.example', brand: 'Reclaim Group', path: '/check', color: B.reclaim, state: 'Live', tone: 'pos', cert: 'certificate verified' },
                { domain: 'go.safestride.example', brand: 'SafeStride', path: '/eligibility', color: B.safestride, state: 'Live', tone: 'pos', cert: 'certificate verified' },
                { domain: 'quiz.dontsettle.example', brand: "Don't Settle", path: '/check', color: B.dontsettle, state: 'Provisioning', tone: 'warn', cert: 'handshake retrying' },
                { domain: 'apply.checkacase.example', brand: 'Check A Case', path: '/start', color: B.checkacase, state: 'Failed', tone: 'neg', cert: 'DNS not pointing here' },
              ].map((d) => (
                <li key={d.domain} className="px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <BrandDot color={d.color} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink">{d.domain}</span>
                    <StatePill label={d.state} tone={d.tone as 'pos' | 'warn' | 'neg'} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-ink-muted">
                    <span>{d.brand}</span>
                    <span className="font-mono text-ink-dim">{d.path}</span>
                    <span className="text-ink-dim">{d.cert}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Section>

      {/* --------------------------------------------------- CAMPAIGN INTEGRITY */}
      <Section id="integrity" className="border-t border-[#1A2130]">
        <div className="rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 p-6 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-app-sm border border-border bg-surface-deep px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Coming soon
          </span>
          <h2 className="mt-4 max-w-[720px] text-[24px] font-bold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[30px]">
            What you launch should be what everyone sees.
          </h2>
          <p className="mt-4 max-w-[720px] text-[15px] leading-[1.7] text-ink-muted">
            Integrity will monitor your published experiences for unexpected content, routing, redirect and delivery
            differences, the kind of inconsistency that creates avoidable advertising policy risk. Catch it in your own
            dashboard rather than in a suspension email.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { label: 'Experience consistent', tone: 'pos' },
              { label: 'Redirect difference', tone: 'warn' },
              { label: 'Content difference', tone: 'warn' },
              { label: 'Domain difference', tone: 'muted' },
              { label: 'Routing mismatch', tone: 'warn' },
              { label: 'Review recommended', tone: 'neg' },
              { label: 'Configuration warning', tone: 'warn' },
            ].map((s) => (
              <StatePill key={s.label} label={s.label} tone={s.tone as 'pos' | 'warn' | 'neg' | 'muted'} />
            ))}
          </div>
          <p className="mt-5 text-[11px] text-ink-dim">
            Designed statuses shown as a preview. Campaign Integrity is not live and these are not scan results.
          </p>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- AI */}
      <Section className="border-t border-[#1A2130]">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <Panel className="order-2 lg:order-1" label="Import from URL">
            <div className="p-4">
              <div className="flex items-center gap-2 rounded-app border border-border bg-surface-deep px-3 py-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-dim)" strokeWidth="1.9" aria-hidden="true">
                  <path d="M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1" />
                </svg>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-muted">
                  https://example.com/campaign-page
                </span>
                <span className="inline-flex h-6 items-center rounded-app-sm bg-brand px-2.5 text-[11px] font-semibold text-white">
                  Import
                </span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {[
                  'Hero · headline, subhead, CTA',
                  'Eligibility bar',
                  'Three-step explainer',
                  'Trust row',
                  'FAQ · 6 items',
                  'Disclosure block',
                ].map((b) => (
                  <li key={b} className="flex items-center gap-2 rounded-app-sm border border-border bg-surface-deep px-2.5 py-2 text-[11.5px] text-ink-secondary">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-pos)" strokeWidth="2.6" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
          <div className="order-1 lg:order-2">
            <Eyebrow>AI assistance</Eyebrow>
            <H2>Start from an idea, not an empty canvas.</H2>
            <Lede>
              Point PageFlo at a URL and get editable blocks back. Paste raw HTML and get structure. Ask for a rewrite of
              one section and keep the rest untouched. AI is a tool inside the workflow here, not the product.
            </Lede>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------- HOW IT WORKS */}
      <Section id="how" className="border-t border-[#1A2130]">
        <Eyebrow>How it works</Eyebrow>
        <H2>Four steps from a brand to a routed lead.</H2>
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: '01', title: 'Create a brand', body: 'Four colours and a domain, everything else derives.', meta: 'brand kit → tokens' },
            { n: '02', title: 'Build once, brand free', body: 'Create a page, advertorial or flow without tying it permanently to one identity.', meta: 'asset ≠ brand' },
            { n: '03', title: 'Deploy', body: 'Bind it to a brand, domain and path.', meta: 'asset + brand + path' },
            { n: '04', title: 'Route', body: 'Qualify the visitor and send the lead where it belongs.', meta: 'tier → destination' },
          ].map((s) => (
            <li key={s.n} className="rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 p-4">
              <div className="font-mono text-[11px] font-semibold text-brand">{s.n}</div>
              <div className="mt-2 text-[15px] font-semibold text-ink">{s.title}</div>
              <p className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-muted">{s.body}</p>
              <div className="mt-3 border-t border-border pt-2.5 font-mono text-[10.5px] text-ink-dim">{s.meta}</div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ------------------------------------------------- BUILT FOR OPERATORS */}
      <Section className="border-t border-[#1A2130]">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Built for performance teams</Eyebrow>
            <H2>For operators running more than one thing at once.</H2>
            <Lede>{PRODUCT_TAGLINE}</Lede>
          </div>
          <ul className="space-y-2">
            {[
              'Multiple brands from one workspace',
              'Every asset deployable to every brand',
              'Team roles per brand where supported',
              'Preview any asset under any identity before it ships',
            ].map((c) => (
              <li key={c} className="flex items-start gap-3 rounded-app border border-border bg-surface-1 px-3.5 py-3">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2.2" className="mt-[2px] shrink-0" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[13.5px] text-ink-secondary">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ----------------------------------------------------------- FINAL CTA */}
      <Section id="cta" className="border-t border-[#1A2130]">
        <div className="rounded-app-lg border border-brand/25 bg-linear-to-b from-surface-2 to-surface-1 px-6 py-12 text-center sm:px-10">
          <h2 className="mx-auto max-w-[620px] text-[26px] font-bold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[34px]">
            Your next brand goes live today.
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-[1.7] text-ink-muted">{PRODUCT_TAGLINE}</p>
          <a
            href={`${appUrl}/sign-in`}
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-app-sm bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Start building
            <Arrow />
          </a>
        </div>
      </Section>

      {/* -------------------------------------------------------------- FOOTER */}
      <footer className="border-t border-[#1A2130] px-5 py-12 sm:px-6">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
            <div>
              <PageFloWordmark />
              <p className="mt-4 max-w-[360px] text-[12.5px] leading-[1.65] text-ink-muted">
                {PRODUCT_TAGLINE} Dynamic acquisition infrastructure for lead generators and performance marketers.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {[
                { label: 'Product', links: ['Sites', 'Landing Pages', 'Advertorials', 'Flows', 'Leads', 'Domains'] },
                { label: 'Builders', links: ['Page Builder', 'Quiz Builder', 'Advertorial Builder'] },
                { label: 'Platform', links: ['Deployments', 'Brand Kits', 'Integrations', 'Campaign Integrity — soon'] },
              ].map((col) => (
                <div key={col.label}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-dim">{col.label}</div>
                  <ul className="mt-3 space-y-2">
                    {col.links.map((l) => (
                      <li key={l} className="text-[12.5px] text-ink-muted">
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-dim">Console</div>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a href={`${appUrl}/sign-in`} className="text-[12.5px] text-ink-muted transition-colors hover:text-ink">
                      Sign in
                    </a>
                  </li>
                  {legalLinks.map((l) => (
                    <li key={l.path}>
                      <a href={l.path} className="text-[12.5px] text-ink-muted transition-colors hover:text-ink">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-[#1A2130] pt-6 text-[11.5px] text-ink-dim">
            &copy; {new Date().getFullYear()} PageFlo
          </div>
        </div>
      </footer>
    </div>
  )
}

export default MarketingSite
