/**
 * Public Site block renderer. Maps each block type to a React component.
 * Unknown block types render a visible warning instead of silently disappearing.
 *
 * All block data is assumed to be already site-var-substituted upstream (in the catch-all route).
 */
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { LeadForm } from './LeadForm'
import { BESPOKE_CSS } from './bespoke-css'

// Empty-hero fallback. Previously hardcoded a Check My Claim family photo
// which leaked onto every Site whose hero hadn't set image_url. Now an
// empty string so the renderer skips the <img> entirely and you get a
// brand-coloured solid background instead of someone else's stock photo.
const DEFAULT_HERO_BG = ''

export type Block = {
  blockType: string
  id?: string
  blockName?: string
  [key: string]: unknown
}

export type SiteForRender = {
  id: string | number
  slug: string
  name?: string | null
  default_phone?: string | null
  default_phone_tel?: string | null
  org_name?: string | null
  org_address?: string | null
  support_email?: string | null
  default_disclaimer_md?: string | null
}

export type RenderContext = {
  site: SiteForRender
  phone: { display: string; tel: string }
  isPreview?: boolean
}

// Per-block metadata. Visibility was the first use; the editor's Advanced
// panel adds per-block style overrides (bg / text / accent colours,
// alignment, vertical padding). The renderer applies the style overrides
// as inline CSS variables on a wrapper div — the bespoke CSS picks them up
// via the brand cascade so a per-section accent change recolours buttons /
// pills / gradients inside just that section without touching anything else.
type BlockMetaEntry = {
  hide_mobile?: boolean
  hide_desktop?: boolean
  bg_color?: string
  text_color?: string
  accent_color?: string
  align?: '' | 'left' | 'center' | 'right'
  padding_top?: '' | 'none' | 'sm' | 'md' | 'lg' | 'xl'
  padding_bottom?: '' | 'none' | 'sm' | 'md' | 'lg' | 'xl'
}
type BlockMeta = Record<string, BlockMetaEntry | undefined>

const PAD_PX: Record<string, number | undefined> = {
  none: 0,
  sm: 24,
  md: 56,
  lg: 96,
  xl: 144,
}

const RESPONSIVE_CSS = `
@media (max-width: 640px) { .pageflo-hide-mobile { display: none !important; } }
@media (min-width: 1024px) { .pageflo-hide-desktop { display: none !important; } }
`

// Compose the inline style overrides for one block. Only includes properties
// the author actually set so we don't shadow brand cascade values with
// blanks. Returns null when no overrides are present (so the renderer can
// skip the wrapper div entirely).
function styleOverridesFor(meta: BlockMetaEntry | undefined): Record<string, string | number> | null {
  if (!meta) return null
  const style: Record<string, string | number> = {}
  if (meta.bg_color) style.background = meta.bg_color
  if (meta.text_color) {
    style.color = meta.text_color
    // Drive the bespoke CSS's ink cascade so headings + nav links pick the
    // override up. Same pattern as --site-primary for accents.
    ;(style as Record<string, string>)['--site-ink'] = meta.text_color
  }
  if (meta.accent_color) {
    ;(style as Record<string, string>)['--site-primary'] = meta.accent_color
    ;(style as Record<string, string>)['--site-accent'] = meta.accent_color
  }
  if (meta.align) style.textAlign = meta.align
  if (meta.padding_top) {
    const px = PAD_PX[meta.padding_top]
    if (px !== undefined) style.paddingTop = px
  }
  if (meta.padding_bottom) {
    const px = PAD_PX[meta.padding_bottom]
    if (px !== undefined) style.paddingBottom = px
  }
  return Object.keys(style).length > 0 ? style : null
}

export function BlockRenderer({
  blocks,
  ctx,
  blockMeta,
}: {
  blocks: Block[] | null | undefined
  ctx: RenderContext
  blockMeta?: BlockMeta
}) {
  if (!blocks || blocks.length === 0) return <FallbackEmpty />
  return (
    <>
      {/* Bespoke CSS injected once per render. Used by the bespoke-styled
          block components below. Safe to ship twice in the same DOM (a page
          + the admin builder canvas) — duplicate rules are idempotent. */}
      <style dangerouslySetInnerHTML={{ __html: BESPOKE_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      {blocks.map((block, idx) => {
        const meta = block.id ? blockMeta?.[block.id] : undefined
        const classes: string[] = []
        if (meta?.hide_mobile) classes.push('pageflo-hide-mobile')
        if (meta?.hide_desktop) classes.push('pageflo-hide-desktop')
        const overrideStyle = styleOverridesFor(meta)
        const key = block.id ?? `${block.blockType}-${idx}`
        const child = <BlockDispatch block={block} ctx={ctx} />
        if (classes.length === 0 && !overrideStyle) {
          return <Fragment key={key}>{child}</Fragment>
        }
        return (
          <div
            key={key}
            className={classes.join(' ') || undefined}
            style={overrideStyle as CSSProperties | undefined}
          >
            {child}
          </div>
        )
      })}
    </>
  )
}

function BlockDispatch({ block, ctx }: { block: Block; ctx: RenderContext }) {
  switch (block.blockType) {
    case 'nav_header':
      return <NavHeader block={block} ctx={ctx} />
    case 'hero':
      return <Hero block={block} ctx={ctx} />
    case 'trust_strip':
      return <TrustStrip block={block} />
    case 'services_grid':
      return <ServicesGrid block={block} />
    case 'how_it_works':
      return <HowItWorks block={block} />
    case 'recent_wins':
      return <RecentWins block={block} />
    case 'stats':
      return <Stats block={block} />
    case 'cards':
      return <Cards block={block} />
    case 'testimonials':
      return <Testimonials block={block} />
    case 'faq':
      return <Faq block={block} />
    case 'bullet_list':
      return <BulletList block={block} />
    case 'cta':
      return <Cta block={block} />
    case 'final_cta':
      return <FinalCta block={block} ctx={ctx} />
    case 'prose':
      return <Prose block={block} />
    case 'image':
      return <ImageBlock block={block} />
    case 'embed':
      return <Embed block={block} />
    case 'custom_html':
      return <CustomHtml block={block} />
    case 'disclosure':
      return <Disclosure block={block} />
    case 'site_footer':
      return <SiteFooter block={block} ctx={ctx} />
    case 'video':
      return <Video block={block} />
    case 'gallery':
      return <Gallery block={block} />
    case 'logo_cloud':
      return <LogoCloud block={block} />
    case 'spacer':
      return <Spacer block={block} />
    case 'lead_form':
      return <LeadForm block={block as never} site={{ slug: String((ctx.site as { slug?: string }).slug ?? ''), name: ctx.site.name ?? null }} />
    default:
      return <FallbackUnknown blockType={block.blockType} />
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const get = <T,>(block: Block, key: string, fallback?: T): T | undefined => {
  const v = block[key]
  return (v === undefined ? fallback : v) as T | undefined
}

const Container = ({ children, narrow }: { children: ReactNode; narrow?: boolean }) => (
  <div className={`mx-auto px-6 ${narrow ? 'max-w-[760px]' : 'max-w-[1180px]'}`}>{children}</div>
)

const Section = ({ children, dark, alt, id }: { children: ReactNode; dark?: boolean; alt?: boolean; id?: string }) => (
  <section
    id={id}
    style={{
      background: dark ? 'var(--site-ink, #0E1116)' : alt ? 'var(--site-surface-alt, rgba(0,0,0,0.025))' : 'transparent',
      color: dark ? 'var(--site-surface, #fff)' : 'inherit',
      padding: '80px 0',
    }}
  >
    {children}
  </section>
)

// Strip <script> and on*= handlers from custom HTML.
const sanitizeHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')

// Minimal Markdown: paragraphs + line breaks + bold/italic + links.
function MarkdownLite({ source }: { source: string }) {
  const paragraphs = source.trim().split(/\n{2,}/)
  return (
    <>
      {paragraphs.map((p, i) => {
        const withInline = p
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--site-primary);">$1</a>')
          .replace(/\n/g, '<br />')
        return <p key={i} style={{ marginBottom: 16, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: withInline }} />
      })}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Nav Header                                  */
/* -------------------------------------------------------------------------- */

/**
 * Brand logo: per-block override, then the brand's own logo, then a wordmark.
 *
 * Two bugs lived here and together they put one tenant's logo on every site.
 *
 *   1. The Site lookup read `site.logo_url`, a top-level field that does not
 *      exist. The logo lives at `site.brand.logo_url`. So a brand's configured
 *      logo was never read - setting it in the brand editor did nothing.
 *   2. The final fallback was a hardcoded URL to Check My Claim's logo. With
 *      step 1 always undefined, every site that had not overridden the logo on
 *      the block fell straight through to it.
 *
 * The fallback is now the site's own name as a wordmark. A brand with no logo
 * should look like a brand with no logo, not like a different company.
 */
function NavHeader({ block, ctx }: { block: Block; ctx: RenderContext }) {
  const links = (get<Array<{ label: string; href: string }>>(block, 'links') ?? []) as Array<{ label: string; href: string }>
  const ctaLabel = get<string>(block, 'cta_label')
  const ctaHref = get<string>(block, 'cta_href') ?? '#'
  const brandLogo = (ctx.site as { brand?: { logo_url?: string | null } }).brand?.logo_url
  const logoUrl = get<string>(block, 'logo_url') || brandLogo || null
  const siteName = ctx.site.name ?? 'Home'
  return (
    <nav className="navbar">
      <div className="navbar__inner">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={siteName} className="navbar__logo" />
        ) : (
          <span className="navbar__wordmark">{siteName}</span>
        )}
        <div className="navbar__links">
          {links.map((l, i) => (
            <a key={i} href={l.href} className="navbar__link">
              {l.label}
            </a>
          ))}
        </div>
        {ctaLabel ? (
          <a href={ctaHref} className="btn-nav">{ctaLabel}</a>
        ) : null}
      </div>
    </nav>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Hero                                    */
/* -------------------------------------------------------------------------- */

function Hero({ block, ctx: _ctx }: { block: Block; ctx: RenderContext }) {
  // Every field is read with NO fallback content — previously these defaulted
  // to Check My Claim copy ('100% Free • No Win, No Fee • Fast Results' /
  // 'Takes less than 2 minutes' / 'Vetted Attorneys Only' pills / the CMC
  // family-photo background), which leaked onto every Site whose hero hadn't
  // been authored yet. Now empty = empty.
  const eyebrow = get<string>(block, 'eyebrow')
  const heading = get<string>(block, 'heading') ?? ''
  const headingGradient = get<string>(block, 'heading_gradient')
  const sub = get<string>(block, 'sub')
  const primaryLabel = get<string>(block, 'primary_cta_label')
  const primaryHref = get<string>(block, 'primary_cta_href') ?? '#'
  const ctaSub = get<string>(block, 'cta_sub')
  const bgImage = get<string>(block, 'image_url') || DEFAULT_HERO_BG
  const pills =
    (get<Array<{ text: string }>>(block, 'pills') as Array<{ text: string }> | undefined) ?? []
  return (
    <section className="hero" id="home">
      {bgImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bgImage} alt="" className="hero__bg-img" />
      ) : null}
      <div className="hero__overlay" />
      <div className="hero__pattern" />
      <div className="hero__content">
        <div className="hero__inner">
          {eyebrow ? (
            <div className="hero__badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {eyebrow}
            </div>
          ) : null}
          <h1 className="hero__heading">
            {heading}
            {headingGradient ? (
              <>
                <br />
                <span className="hero__heading-gradient">{headingGradient}</span>
              </>
            ) : null}
          </h1>
          {sub ? <p className="hero__sub">{sub}</p> : null}
          {primaryLabel ? (
            <div className="hero__cta-row">
              <a href={primaryHref} className="btn-hero">{primaryLabel}</a>
              {ctaSub ? <span className="hero__cta-sub">{ctaSub}</span> : null}
            </div>
          ) : null}
          {pills.length > 0 ? (
            <div className="hero__pills">
              {pills.map((p, i) => (
                <div key={i} className="hero__pill">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4" />
                  </svg>
                  <span className="hero__pill-text">{p.text}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Trust Strip                                 */
/* -------------------------------------------------------------------------- */

function TrustStrip({ block }: { block: Block }) {
  const items = (get<Array<{ value?: string; label?: string }>>(block, 'items') ?? []) as Array<{ value?: string; label?: string }>
  if (items.length === 0) return null
  // The bespoke trust banner shows the `value` field uppercased as the label
  // — there's no two-line value+label split in the CMC design, just bold
  // wordmarks separated by dots.
  return (
    <section className="trust-banner">
      <div className="trust-banner__inner">
        {items.map((it, i) => (
          <div key={i} className="trust-banner__item">
            <span className="trust-banner__label">{(it.value || it.label || '').toUpperCase()}</span>
            {i < items.length - 1 ? <span className="trust-banner__dot" /> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*                               Services Grid                                */
/* -------------------------------------------------------------------------- */

function ServicesGrid({ block }: { block: Block }) {
  const eyebrow = get<string>(block, 'eyebrow')
  const heading = get<string>(block, 'heading') ?? ''
  const sub = get<string>(block, 'sub')
  const items = (get<Array<{ title: string; description?: string; icon?: string }>>(block, 'items') ?? []) as Array<{
    title: string
    description?: string
    icon?: string
  }>
  return (
    <Section>
      <Container>
        <SectionHeader eyebrow={eyebrow} heading={heading} sub={sub} />
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: 'var(--site-accent)',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--site-ink)',
                }}
                aria-hidden
              >
                {(it.icon ?? it.title.charAt(0)).toString().slice(0, 1).toUpperCase()}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--site-ink)' }}>{it.title}</h3>
              {it.description ? (
                <p style={{ marginTop: 8, fontSize: 14, color: 'var(--site-muted)', lineHeight: 1.55 }}>{it.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                How It Works                                */
/* -------------------------------------------------------------------------- */

function HowItWorks({ block }: { block: Block }) {
  const eyebrow = get<string>(block, 'eyebrow')
  const heading = get<string>(block, 'heading') ?? ''
  const sub = get<string>(block, 'sub')
  const steps = (get<Array<{ title: string; description?: string }>>(block, 'steps') ?? []) as Array<{ title: string; description?: string }>
  return (
    <Section alt>
      <Container>
        <SectionHeader eyebrow={eyebrow} heading={heading} sub={sub} center />
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: 24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ position: 'relative', paddingLeft: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--site-primary)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 16,
                  marginBottom: 14,
                }}
              >
                {i + 1}
              </span>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--site-ink)' }}>{s.title}</h3>
              {s.description ? (
                <p style={{ marginTop: 6, fontSize: 14, color: 'var(--site-muted)', lineHeight: 1.55 }}>{s.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Recent Wins                                 */
/* -------------------------------------------------------------------------- */

function RecentWins({ block }: { block: Block }) {
  const eyebrow = get<string>(block, 'eyebrow')
  const heading = get<string>(block, 'heading') ?? ''
  const sub = get<string>(block, 'sub')
  const items = (get<Array<{ amount: string; case_type: string; description?: string }>>(block, 'items') ?? []) as Array<{
    amount: string
    case_type: string
    description?: string
  }>
  const disclaimer = get<string>(block, 'disclaimer')
  return (
    <Section>
      <Container>
        <SectionHeader eyebrow={eyebrow} heading={heading} sub={sub} />
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                background: 'var(--site-ink)',
                color: '#fff',
                borderRadius: 12,
                padding: 24,
              }}
            >
              <p style={{ fontSize: 32, fontWeight: 800, margin: 0, color: 'var(--site-accent)' }}>{it.amount}</p>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6, marginTop: 8 }}>
                {it.case_type}
              </p>
              {it.description ? (
                <p style={{ marginTop: 12, fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>{it.description}</p>
              ) : null}
            </div>
          ))}
        </div>
        {disclaimer ? (
          <p style={{ marginTop: 24, fontSize: 12, color: 'var(--site-muted)', fontStyle: 'italic' }}>{disclaimer}</p>
        ) : null}
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Stats / Cards / etc                           */
/* -------------------------------------------------------------------------- */

function Stats({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const items = (get<Array<{ value: string; label: string }>>(block, 'items') ?? []) as Array<{ value: string; label: string }>
  return (
    <Section>
      <Container>
        {heading ? <SectionHeader heading={heading} center /> : null}
        <div
          style={{
            marginTop: heading ? 32 : 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(items.length || 1, 4)}, minmax(0, 1fr))`,
            gap: 24,
            textAlign: 'center',
          }}
        >
          {items.map((s, i) => (
            <div key={i}>
              <p style={{ fontSize: 40, fontWeight: 800, color: 'var(--site-primary)', margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 13, color: 'var(--site-muted)', marginTop: 6 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}

function Cards({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const items = (get<Array<{ title: string; body?: string; icon?: string }>>(block, 'items') ?? []) as Array<{
    title: string
    body?: string
    icon?: string
  }>
  return (
    <Section>
      <Container>
        {heading ? <SectionHeader heading={heading} /> : null}
        <div style={{ marginTop: heading ? 32 : 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {items.map((c, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--site-ink)' }}>{c.title}</h3>
              {c.body ? <p style={{ marginTop: 10, fontSize: 14, color: 'var(--site-muted)', lineHeight: 1.55 }}>{c.body}</p> : null}
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}

function Testimonials({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const items = (get<Array<{ quote: string; attribution?: string; avatar_url?: string }>>(block, 'items') ?? []) as Array<{
    quote: string
    attribution?: string
    avatar_url?: string
  }>
  return (
    <Section alt>
      <Container>
        {heading ? <SectionHeader heading={heading} center /> : null}
        <div style={{ marginTop: heading ? 32 : 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {items.map((t, i) => (
            <figure key={i} style={{ margin: 0, background: '#fff', borderRadius: 12, padding: 24, border: '1px solid rgba(0,0,0,0.06)' }}>
              <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--site-ink)' }}>
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              {t.attribution ? (
                <figcaption style={{ marginTop: 14, fontSize: 13, color: 'var(--site-muted)', fontWeight: 700 }}>
                  — {t.attribution}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      </Container>
    </Section>
  )
}

function Faq({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading') ?? 'Frequently asked questions'
  const items = (get<Array<{ question: string; answer: string }>>(block, 'items') ?? []) as Array<{ question: string; answer: string }>
  return (
    <Section>
      <Container narrow>
        <SectionHeader heading={heading} center />
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((q, i) => (
            <details
              key={i}
              style={{
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '18px 22px',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15, color: 'var(--site-ink)', listStyle: 'none' }}>
                {q.question}
              </summary>
              <div style={{ marginTop: 12, fontSize: 14, color: 'var(--site-muted)', lineHeight: 1.6 }}>
                <MarkdownLite source={q.answer} />
              </div>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  )
}

function BulletList({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const items = (get<Array<{ item: string }>>(block, 'items') ?? []) as Array<{ item: string }>
  return (
    <Section>
      <Container narrow>
        {heading ? <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--site-ink)' }}>{heading}</h2> : null}
        <ul style={{ marginTop: 16, paddingLeft: 22, color: 'var(--site-ink)', lineHeight: 1.7 }}>
          {items.map((b, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {b.item}
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}

function Cta({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading') ?? ''
  const sub = get<string>(block, 'sub')
  const label = get<string>(block, 'label') ?? ''
  const href = get<string>(block, 'href') ?? '#'
  return (
    <Section alt>
      <Container narrow>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--site-ink)', margin: 0 }}>{heading}</h2>
          {sub ? <p style={{ marginTop: 12, color: 'var(--site-muted)', fontSize: 16 }}>{sub}</p> : null}
          <Link
            href={href}
            style={{
              display: 'inline-block',
              marginTop: 24,
              background: 'var(--site-primary)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              padding: '14px 28px',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        </div>
      </Container>
    </Section>
  )
}

function FinalCta({ block, ctx }: { block: Block; ctx: RenderContext }) {
  const eyebrow = get<string>(block, 'eyebrow')
  const heading = get<string>(block, 'heading') ?? ''
  const sub = get<string>(block, 'sub')
  const label = get<string>(block, 'primary_cta_label') ?? 'Get started'
  const href = get<string>(block, 'primary_cta_href') ?? '#'
  const showPhone = get<boolean>(block, 'show_phone') ?? true
  return (
    <section
      style={{
        background: 'var(--site-ink)',
        color: '#fff',
        padding: '96px 0',
        textAlign: 'center',
      }}
    >
      <Container narrow>
        {eyebrow ? (
          <p
            style={{
              display: 'inline-block',
              color: 'var(--site-accent)',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 2,
              marginBottom: 16,
            }}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 style={{ fontSize: 40, fontWeight: 800, margin: 0, lineHeight: 1.15 }}>{heading}</h2>
        {sub ? <p style={{ marginTop: 16, fontSize: 17, opacity: 0.85, lineHeight: 1.55 }}>{sub}</p> : null}
        <div style={{ marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href={href}
            style={{
              background: 'var(--site-accent)',
              color: 'var(--site-ink)',
              fontWeight: 800,
              fontSize: 15,
              padding: '16px 30px',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
          {showPhone && ctx.phone.display ? (
            <a
              href={`tel:${ctx.phone.tel}`}
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                padding: '16px 22px',
                borderRadius: 999,
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              Call {ctx.phone.display}
            </a>
          ) : null}
        </div>
      </Container>
    </section>
  )
}

function Prose({ block }: { block: Block }) {
  const md = get<string>(block, 'markdown') ?? ''
  return (
    <Section>
      <Container narrow>
        <MarkdownLite source={md} />
      </Container>
    </Section>
  )
}

function ImageBlock({ block }: { block: Block }) {
  const url = get<string>(block, 'url') ?? ''
  const alt = get<string>(block, 'alt') ?? ''
  const caption = get<string>(block, 'caption')
  if (!url) return null
  return (
    <Section>
      <Container>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} style={{ display: 'block', maxWidth: '100%', borderRadius: 12 }} />
        {caption ? <p style={{ marginTop: 12, fontSize: 13, color: 'var(--site-muted)', textAlign: 'center' }}>{caption}</p> : null}
      </Container>
    </Section>
  )
}

function Embed({ block }: { block: Block }) {
  const html = get<string>(block, 'html') ?? ''
  return (
    <Section>
      <Container>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
      </Container>
    </Section>
  )
}

function CustomHtml({ block }: { block: Block }) {
  const html = get<string>(block, 'html') ?? ''
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
}

function Disclosure({ block }: { block: Block }) {
  const md = get<string>(block, 'markdown') ?? ''
  return (
    <section style={{ background: 'rgba(0,0,0,0.03)', padding: '24px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
      <Container narrow>
        <div style={{ fontSize: 12, color: 'var(--site-muted)', lineHeight: 1.55 }}>
          <MarkdownLite source={md} />
        </div>
      </Container>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Site Footer                                 */
/* -------------------------------------------------------------------------- */

function SiteFooter({ block, ctx }: { block: Block; ctx: RenderContext }) {
  const columns = (get<Array<{ heading: string; links?: Array<{ label: string; href: string }> }>>(block, 'columns') ?? []) as Array<{
    heading: string
    links?: Array<{ label: string; href: string }>
  }>
  const legalMd = get<string>(block, 'legal_md') ?? ctx.site.default_disclaimer_md ?? ''
  return (
    <footer style={{ background: 'var(--site-ink)', color: '#fff', padding: '64px 0 40px', marginTop: 'auto' }}>
      <Container>
        <div style={{ display: 'grid', gridTemplateColumns: `2fr ${columns.map(() => '1fr').join(' ')}`, gap: 32 }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--site-accent)' }}>{ctx.site.name}</p>
            {ctx.site.org_address ? <p style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>{ctx.site.org_address}</p> : null}
            {ctx.phone.display ? (
              <p style={{ marginTop: 10, fontSize: 13 }}>
                <a href={`tel:${ctx.phone.tel}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
                  {ctx.phone.display}
                </a>
              </p>
            ) : null}
            {ctx.site.support_email ? (
              <p style={{ marginTop: 4, fontSize: 13 }}>
                <a href={`mailto:${ctx.site.support_email}`} style={{ color: '#fff', opacity: 0.8, textDecoration: 'none' }}>
                  {ctx.site.support_email}
                </a>
              </p>
            ) : null}
          </div>
          {columns.map((col, i) => (
            <div key={i}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, opacity: 0.6, margin: 0 }}>
                {col.heading}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(col.links ?? []).map((l, j) => (
                  <li key={j}>
                    <Link href={l.href} style={{ color: '#fff', opacity: 0.8, fontSize: 14, textDecoration: 'none' }}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {legalMd ? (
          <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12, opacity: 0.65, lineHeight: 1.6 }}>
            <MarkdownLite source={legalMd} />
          </div>
        ) : null}
      </Container>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */
/*                            Section header helper                           */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  eyebrow,
  heading,
  sub,
  center,
}: {
  eyebrow?: string
  heading?: string
  sub?: string
  center?: boolean
}) {
  if (!heading && !eyebrow && !sub) return null
  return (
    <div style={{ textAlign: center ? 'center' : 'left', maxWidth: center ? 700 : undefined, margin: center ? '0 auto' : undefined }}>
      {eyebrow ? (
        <p
          style={{
            color: 'var(--site-primary)',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 2,
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </p>
      ) : null}
      {heading ? (
        <h2 style={{ fontSize: 36, fontWeight: 800, color: 'var(--site-ink)', margin: 0, lineHeight: 1.15 }}>{heading}</h2>
      ) : null}
      {sub ? <p style={{ marginTop: 12, fontSize: 17, color: 'var(--site-muted)', lineHeight: 1.55 }}>{sub}</p> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Video                                   */
/* -------------------------------------------------------------------------- */

// Parse a YouTube id from any of the common URL shapes (watch?v=, youtu.be,
// embed/, shorts/). Falls back to whatever the user typed if it's already an
// 11-char id.
function parseYouTubeId(input: string): string {
  if (!input) return ''
  const direct = input.trim()
  if (/^[\w-]{11}$/.test(direct)) return direct
  const m =
    direct.match(/[?&]v=([\w-]{11})/) ||
    direct.match(/youtu\.be\/([\w-]{11})/) ||
    direct.match(/youtube\.com\/embed\/([\w-]{11})/) ||
    direct.match(/youtube\.com\/shorts\/([\w-]{11})/)
  return m ? m[1] : direct
}

// Vimeo ids are all-numeric, typically 7–10 digits. Accept a bare id OR a
// vimeo.com URL.
function parseVimeoId(input: string): string {
  if (!input) return ''
  const direct = input.trim()
  if (/^\d{6,12}$/.test(direct)) return direct
  const m = direct.match(/vimeo\.com\/(\d+)/)
  return m ? m[1] : direct
}

function Video({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const provider = (get<string>(block, 'provider') ?? 'youtube') as 'youtube' | 'vimeo' | 'url'
  const raw = get<string>(block, 'video_id') ?? ''
  const aspect = (get<string>(block, 'aspect_ratio') ?? '16:9') as '16:9' | '4:3' | '1:1'
  const caption = get<string>(block, 'caption')

  let src = ''
  if (provider === 'youtube') src = `https://www.youtube.com/embed/${parseYouTubeId(raw)}`
  else if (provider === 'vimeo') src = `https://player.vimeo.com/video/${parseVimeoId(raw)}`
  else src = raw

  if (!src) return null

  const aspectStyle = { aspectRatio: aspect.replace(':', ' / ') as string }
  const isFile = provider === 'url' && /\.(mp4|webm|ogv|mov)$/i.test(src)

  return (
    <Section>
      <Container>
        {heading ? <SectionHeader heading={heading} /> : null}
        <div
          style={{
            marginTop: heading ? 24 : 0,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            background: '#000',
            ...aspectStyle,
            position: 'relative',
          }}
        >
          {isFile ? (
            <video
              src={src}
              controls
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          ) : (
            <iframe
              src={src}
              title={heading ?? 'Video'}
              loading="lazy"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          )}
        </div>
        {caption ? (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--site-muted)', textAlign: 'center' }}>{caption}</p>
        ) : null}
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Gallery                                  */
/* -------------------------------------------------------------------------- */

function Gallery({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const columnsStr = (get<string>(block, 'columns') ?? '3') as '2' | '3' | '4'
  const columns = Number(columnsStr) || 3
  const images =
    (get<Array<{ image_url?: string; alt?: string; caption?: string }>>(block, 'images') ?? []) as Array<{
      image_url?: string
      alt?: string
      caption?: string
    }>
  if (images.length === 0) return null
  return (
    <Section>
      <Container>
        {heading ? <SectionHeader heading={heading} /> : null}
        <div
          style={{
            marginTop: heading ? 32 : 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 16,
          }}
        >
          {images.map((it, i) => (
            <figure key={i} style={{ margin: 0, borderRadius: 10, overflow: 'hidden', background: '#0001' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                loading="lazy"
                decoding="async"
                src={it.image_url}
                alt={it.alt ?? ''}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '4 / 3' }}
              />
              {it.caption ? (
                <figcaption style={{ padding: '8px 12px', fontSize: 12, color: 'var(--site-muted)' }}>{it.caption}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Logo Cloud                                 */
/* -------------------------------------------------------------------------- */

function LogoCloud({ block }: { block: Block }) {
  const heading = get<string>(block, 'heading')
  const grayscale = get<boolean>(block, 'grayscale') ?? true
  const logos =
    (get<Array<{ image_url?: string; alt?: string; href?: string }>>(block, 'logos') ?? []) as Array<{
      image_url?: string
      alt?: string
      href?: string
    }>
  if (logos.length === 0) return null
  const filter = grayscale ? 'grayscale(1)' : 'none'
  const opacity = grayscale ? 0.7 : 1
  return (
    <Section>
      <Container>
        {heading ? (
          <p
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--site-muted)',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              marginBottom: 32,
            }}
          >
            {heading}
          </p>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 40,
            alignItems: 'center',
            justifyItems: 'center',
          }}
        >
          {logos.map((l, i) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                loading="lazy"
                decoding="async"
                src={l.image_url}
                alt={l.alt ?? ''}
                style={{ maxHeight: 48, maxWidth: '100%', filter, opacity, objectFit: 'contain' }}
              />
            )
            return l.href ? (
              <Link key={i} href={l.href}>
                {img}
              </Link>
            ) : (
              <div key={i}>{img}</div>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Spacer                                   */
/* -------------------------------------------------------------------------- */

function Spacer({ block }: { block: Block }) {
  const size = (get<string>(block, 'size') ?? 'md') as 'sm' | 'md' | 'lg' | 'xl'
  const showDivider = get<boolean>(block, 'show_divider') ?? false
  const px = { sm: 32, md: 64, lg: 96, xl: 128 }[size] ?? 64
  return (
    <div style={{ height: px, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {showDivider ? (
        <Container>
          <hr style={{ border: 0, borderTop: '1px solid var(--site-border, rgba(0,0,0,0.08))', margin: 0 }} />
        </Container>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Fallbacks                                 */
/* -------------------------------------------------------------------------- */

function FallbackEmpty() {
  return (
    <Section>
      <Container narrow>
        <p style={{ textAlign: 'center', color: 'var(--site-muted)' }}>This page has no content blocks yet.</p>
      </Container>
    </Section>
  )
}

function FallbackUnknown({ blockType }: { blockType: string }) {
  return (
    <div
      style={{
        margin: '12px auto',
        maxWidth: 760,
        padding: 16,
        border: '2px dashed #C03A2B',
        background: 'rgba(192,58,43,0.05)',
        color: '#C03A2B',
        borderRadius: 8,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      Unknown block type: <strong>{blockType}</strong> — add a renderer in <code>BlockRenderer.tsx</code>.
    </div>
  )
}
