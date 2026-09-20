'use client'

/**
 * Public advertorial renderer, also mounted by the builder preview.
 *
 * Template chrome (header, article shell, footer) is structurally different
 * per template id. Brand identity reskins colour, logo, phone and legal copy.
 * Copy comes from the master; this file does not read deployment overrides.
 */

import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, Phone, ShieldAlert } from 'lucide-react'
import { resolveTokens } from '@/components/builder/lp/render'
import { advertorialChrome, type AdvertorialChrome } from '@/lib/advertorial-templates'

export type AdvertorialSection = {
  id?: string
  type: string
  content?: unknown
}

export type AdvertorialQuizLink = {
  domain: string
  path: string
  name?: string
}

type BrandLike = {
  displayName?: string
  shortName?: string
  name?: string
  logoUrl?: string
  tagline?: string
  colors?: { primary?: string; accent?: string }
  contact?: { callNumber?: string; callCtaText?: string }
  cta?: { label?: string }
  legal?: Record<string, string | undefined>
  urls?: { privacy?: string; terms?: string }
  bottomSection?: {
    enabled?: boolean
    badgeText?: string
    headline?: string
    subline?: string
    primaryButtonText?: string
    secondaryButtonText?: string
    microCopy?: string
    verifiedText?: string
  }
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

const tokens = (text: unknown, brand: BrandLike, quiz: AdvertorialQuizLink | null): string => {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : ''
  const ctx = quiz
    ? { fullUrl: `https://${quiz.domain}${quiz.path}`, path: quiz.path, domain: quiz.domain, name: quiz.name || '' }
    : null
  const out = resolveTokens(text, { brand, quiz: ctx })
  return typeof out === 'string' ? out : text
}

const callDigits = (brand: BrandLike): string => (brand.contact?.callNumber || '').replace(/[^\d+]/g, '')

const quizHref = (quiz: AdvertorialQuizLink | null, brand: BrandLike): string => {
  if (quiz) return `https://${quiz.domain}${quiz.path}`
  const digits = callDigits(brand)
  return digits ? `tel:${digits}` : '#'
}

const ctaLabel = (brand: BrandLike): string =>
  brand.cta?.label || brand.contact?.callCtaText || 'See if you qualify'

const disclaimerOf = (brand: BrandLike): string =>
  brand.legal?.disclaimer || brand.legal?.defaultDisclaimer || ''

const privacyOf = (brand: BrandLike): string => brand.legal?.privacyUrl || brand.urls?.privacy || ''
const termsOf = (brand: BrandLike): string => brand.legal?.termsUrl || brand.urls?.terms || ''

function Header({
  chrome,
  brand,
  quiz,
  primary,
  accent,
}: {
  chrome: AdvertorialChrome
  brand: BrandLike
  quiz: AdvertorialQuizLink | null
  primary: string
  accent: string
}) {
  const name = brand.displayName || brand.name || 'Brand'
  const mark = brand.shortName?.[0] || name[0] || 'B'
  const digits = callDigits(brand)
  const phone = brand.contact?.callNumber
  const logo = brand.logoUrl

  if (chrome.headerVariant === 'masthead') {
    return (
      <header data-adv-header="masthead" style={{ background: chrome.headerBg, color: chrome.headerInk, fontFamily: chrome.headlineFont }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '18px 24px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: chrome.muted }}>
            {brand.tagline || 'Special report'}
          </div>
          <div style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '6px 0 8px' }}>
            {logo ? <img src={logo} alt={name} style={{ height: 36, margin: '0 auto' }} /> : name}
          </div>
          <div style={{ borderTop: `3px solid ${chrome.ruleColor}`, borderBottom: `1px solid ${chrome.ruleColor}`, padding: '6px 0', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
            {phone ? <a href={`tel:${digits}`} style={{ color: chrome.headerInk, textDecoration: 'none', fontWeight: 700 }}>{phone}</a> : <span>{name}</span>}
          </div>
        </div>
      </header>
    )
  }

  if (chrome.headerVariant === 'classified') {
    return (
      <header data-adv-header="classified" style={{ background: chrome.headerBg, color: chrome.headerInk, fontFamily: chrome.headlineFont }}>
        <div style={{ background: '#7f1d1d', color: '#fecaca', fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', textAlign: 'center', padding: '8px 16px' }}>
          Confidential // not for public release
        </div>
        <div style={{ maxWidth: chrome.articleMaxWidth, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {logo ? <img src={logo} alt={name} style={{ height: 22, filter: 'brightness(0) invert(1)' }} /> : name}
          </div>
          <a href={quizHref(quiz, brand)} style={{ color: '#fde68a', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            File a report
          </a>
        </div>
      </header>
    )
  }

  if (chrome.headerVariant === 'dossier') {
    return (
      <header data-adv-header="dossier" style={{ background: chrome.headerBg, color: chrome.headerInk, fontFamily: chrome.headlineFont }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'stretch', gap: 16 }}>
          <div style={{ background: primary, color: '#fff', padding: '10px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
            File
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `2px solid ${primary}` }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.7 }}>Investigation</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{name}</div>
            </div>
            {phone ? (
              <a href={`tel:${digits}`} style={{ color: chrome.headerInk, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                {phone}
              </a>
            ) : null}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header
      data-adv-header="story-bar"
      className="adv-header"
      style={{
        background: chrome.headerBg,
        color: chrome.headerInk,
        borderBottom: `1px solid ${chrome.ruleColor}`,
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: chrome.articleFont,
        maxWidth: 1200,
        margin: '0 auto',
      }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {logo ? (
          <img src={logo} alt={name} style={{ height: 28 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
            <div style={{ width: 26, height: 26, borderRadius: 5, background: primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{mark}</div>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13.5 }}>{name}</span>
          </div>
        )}
      </div>
      {phone ? (
        <a href={`tel:${digits}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: chrome.headerInk, fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          <Phone size={14} /> {phone}
        </a>
      ) : null}
      <a
        href={quizHref(quiz, brand)}
        style={{
          padding: '9px 18px',
          background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
          color: '#fff',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}
      >
        {ctaLabel(brand)} <ArrowRight size={14} />
      </a>
    </header>
  )
}

function Footer({
  chrome,
  brand,
  quiz,
  primary,
}: {
  chrome: AdvertorialChrome
  brand: BrandLike
  quiz: AdvertorialQuizLink | null
  primary: string
}) {
  const name = brand.displayName || brand.name || ''
  const digits = callDigits(brand)
  const phone = brand.contact?.callNumber
  const disclaimer = disclaimerOf(brand)
  const copyright = tokens(brand.legal?.copyright || '', brand, quiz)
  const privacy = privacyOf(brand)
  const terms = termsOf(brand)

  const links = (
    <div style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
      {terms ? <a href={terms} style={{ color: 'inherit', textDecoration: 'none' }}>Terms</a> : null}
      {privacy ? <a href={privacy} style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</a> : null}
    </div>
  )

  if (chrome.footerVariant === 'broadsheet') {
    return (
      <footer data-adv-footer="broadsheet" style={{ background: chrome.footerBg, color: chrome.footerInk, fontFamily: chrome.articleFont, fontSize: 12, padding: '28px 24px 36px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', borderTop: `3px double ${chrome.ruleColor}`, paddingTop: 16, display: 'grid', gap: 8, textAlign: 'center' }}>
          <div style={{ fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{name}</div>
          {phone ? <a href={`tel:${digits}`} style={{ color: 'inherit', fontWeight: 700 }}>{phone}</a> : null}
          <div>{copyright}</div>
          {links}
          {disclaimer ? <p style={{ margin: '12px 0 0', fontSize: 11, lineHeight: 1.6, color: chrome.muted }}>{tokens(disclaimer, brand, quiz)}</p> : null}
        </div>
      </footer>
    )
  }

  if (chrome.footerVariant === 'dark-leak') {
    return (
      <footer data-adv-footer="dark-leak" style={{ background: chrome.footerBg, color: chrome.footerInk, fontFamily: chrome.articleFont, fontSize: 12, padding: '32px 24px' }}>
        <div style={{ maxWidth: chrome.articleMaxWidth, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f87171', marginBottom: 10 }}>Classification: restricted</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <span>{name}</span>
            {phone ? <a href={`tel:${digits}`} style={{ color: '#fde68a' }}>{phone}</a> : null}
            {links}
          </div>
          {disclaimer ? <p style={{ marginTop: 16, fontSize: 11, lineHeight: 1.6, opacity: 0.75 }}>{tokens(disclaimer, brand, quiz)}</p> : null}
        </div>
      </footer>
    )
  }

  if (chrome.footerVariant === 'source-notes') {
    return (
      <footer data-adv-footer="source-notes" style={{ background: chrome.footerBg, color: chrome.footerInk, fontFamily: chrome.articleFont, fontSize: 12.5, padding: '28px 24px 40px', borderTop: `1px solid ${chrome.ruleColor}` }}>
        <div style={{ maxWidth: chrome.articleMaxWidth, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8, color: primary }}>Sources and legal</div>
          {disclaimer ? <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>{tokens(disclaimer, brand, quiz)}</p> : null}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: chrome.muted }}>
            <span>{copyright || `© ${new Date().getFullYear()} ${name}`}</span>
            {phone ? <a href={`tel:${digits}`} style={{ color: 'inherit' }}>{phone}</a> : null}
            {links}
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer data-adv-footer="simple" style={{ background: chrome.footerBg, color: chrome.footerInk, fontFamily: chrome.articleFont, fontSize: 13, lineHeight: 1.55, paddingTop: 36, paddingBottom: 28 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(20px, 4vw, 32px)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 160, color: '#fff', fontWeight: 700 }}>{brand.logoUrl ? <img src={brand.logoUrl} alt={name} style={{ height: 26, filter: 'brightness(0) invert(1)' }} /> : name}</div>
        <div style={{ flex: '1 1 200px', textAlign: 'center' }}>
          {phone ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Prefer to call us?</div>
              <a href={`tel:${digits}`} style={{ fontSize: 17, color: '#fff', fontWeight: 700, textDecoration: 'none' }}>{phone}</a>
            </>
          ) : null}
        </div>
        <div style={{ flex: '1 1 200px', textAlign: 'right', fontSize: 12 }}>
          <div style={{ marginBottom: 6 }}>{copyright}</div>
          {links}
        </div>
      </div>
      {disclaimer ? (
        <div style={{ maxWidth: 1100, margin: '24px auto 0', padding: '20px clamp(20px, 4vw, 32px) 0', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, lineHeight: 1.6, opacity: 0.8 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>Disclaimer: </span>
          {tokens(disclaimer, brand, quiz)}
        </div>
      ) : null}
    </footer>
  )
}

function BottomCta({
  brand,
  quiz,
  primary,
  accent,
  font,
}: {
  brand: BrandLike
  quiz: AdvertorialQuizLink | null
  primary: string
  accent: string
  font: string
}) {
  const bs = brand.bottomSection
  if (bs && bs.enabled === false) return null
  const href = quizHref(quiz, brand)
  const headline = bs?.headline || `Find out where you stand with ${brand.displayName || 'us'}`
  const subline = bs?.subline
  const primaryText = bs?.primaryButtonText || ctaLabel(brand)
  return (
    <div style={{ padding: '32px 20px 56px', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
          borderRadius: 20,
          padding: 'clamp(28px, 4vw, 48px) clamp(20px, 3.5vw, 40px)',
          color: '#fff',
          textAlign: 'center',
          fontFamily: font,
        }}
      >
        {bs?.badgeText ? (
          <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 999, background: 'rgba(0,0,0,0.25)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            {bs.badgeText}
          </div>
        ) : null}
        <h2 style={{ fontSize: 'clamp(24px, 3.6vw, 34px)', margin: '0 0 12px', fontWeight: 800 }}>{tokens(headline, brand, quiz)}</h2>
        {subline ? <p style={{ margin: '0 0 22px', opacity: 0.92 }}>{tokens(subline, brand, quiz)}</p> : null}
        <a
          href={href}
          className="adv-cta-buttons"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 26px',
            background: '#fff',
            color: primary,
            borderRadius: 10,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {primaryText} <ArrowRight size={16} />
        </a>
        {bs?.microCopy ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 12 }}>{tokens(bs.microCopy, brand, quiz)}</div> : null}
      </div>
    </div>
  )
}

function renderSection(
  section: AdvertorialSection,
  brand: BrandLike,
  quiz: AdvertorialQuizLink | null,
  chrome: AdvertorialChrome,
  primary: string,
  accent: string,
): ReactNode {
  const t = (s: unknown) => tokens(s, brand, quiz)
  const body: CSSProperties = { fontFamily: chrome.articleFont, color: chrome.ink }
  switch (section.type) {
    case 'kicker':
      return (
        <div style={{ ...body, fontSize: 12, color: primary, fontWeight: 700, letterSpacing: chrome.kickerTracking, textTransform: 'uppercase', marginBottom: 16 }}>
          {t(section.content)}
        </div>
      )
    case 'headline':
      return (
        <h1 style={{ ...body, fontFamily: chrome.headlineFont, fontSize: 'clamp(28px, 4.5vw, 44px)', lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 18px' }}>
          {t(section.content)}
        </h1>
      )
    case 'sub_headline':
      return (
        <h2 style={{ ...body, fontFamily: chrome.headlineFont, fontSize: 'clamp(20px, 2.8vw, 26px)', lineHeight: 1.25, fontWeight: 700, margin: '36px 0 14px' }}>
          {t(section.content)}
        </h2>
      )
    case 'byline':
      return <div style={{ ...body, fontSize: 13.5, color: chrome.muted, marginBottom: 28 }}>{t(section.content)}</div>
    case 'dateline':
      return (
        <div style={{ ...body, fontSize: 12, color: chrome.muted, marginBottom: 16, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t(section.content)}
        </div>
      )
    case 'lede':
      return (
        <p style={{ ...body, fontSize: 19, lineHeight: 1.6, fontStyle: 'italic', fontWeight: 500, margin: '0 0 24px', borderLeft: `3px solid ${primary}`, paddingLeft: 18 }}>
          {t(section.content)}
        </p>
      )
    case 'paragraph':
      return <p style={{ ...body, fontSize: 17, lineHeight: 1.75, color: chrome.ink, margin: '0 0 18px' }}>{t(section.content)}</p>
    case 'pull_quote':
      return (
        <blockquote style={{ ...body, fontSize: 22, lineHeight: 1.45, fontStyle: 'italic', fontWeight: 600, margin: '28px 0', padding: '8px 0 8px 22px', borderLeft: `4px solid ${primary}` }}>
          {t(section.content)}
        </blockquote>
      )
    case 'callout_box': {
      const c = asObj(section.content)
      return (
        <aside style={{ margin: '28px 0', padding: 'clamp(18px, 3vw, 26px)', borderRadius: 12, background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`, color: '#fff', fontFamily: chrome.articleFont, display: 'flex', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldAlert size={22} color="#fff" />
          </div>
          <div>
            {asStr(c.headline) ? <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{t(c.headline)}</div> : null}
            {asStr(c.text) ? <div style={{ fontSize: 14.5, opacity: 0.92, lineHeight: 1.55 }}>{t(c.text)}</div> : null}
          </div>
        </aside>
      )
    }
    case 'stat_block': {
      const c = asObj(section.content)
      return (
        <div style={{ margin: '28px 0', padding: '28px 24px', background: chrome.headerVariant === 'classified' ? '#0b1220' : '#f8fafc', border: `1px solid ${chrome.ruleColor}`, borderRadius: 12, textAlign: 'center', fontFamily: chrome.articleFont }}>
          <div style={{ fontSize: 'clamp(36px, 6vw, 56px)', color: primary, fontWeight: 800, lineHeight: 1 }}>{t(c.value)}</div>
          <div style={{ fontSize: 14, color: chrome.muted, marginTop: 10 }}>{t(c.label)}</div>
          {asStr(c.source) ? <div style={{ fontSize: 11, color: chrome.muted, marginTop: 8, fontStyle: 'italic' }}>{asStr(c.source)}</div> : null}
        </div>
      )
    }
    case 'bullet_list': {
      const items = Array.isArray(asObj(section.content).items) ? (asObj(section.content).items as unknown[]) : []
      return (
        <ul style={{ ...body, margin: '14px 0 24px', paddingLeft: 22, fontSize: 17, lineHeight: 1.7 }}>
          {items.map((it, i) => (
            <li key={i} style={{ marginBottom: 8 }}>{t(it)}</li>
          ))}
        </ul>
      )
    }
    case 'numbered_list': {
      const items = Array.isArray(asObj(section.content).items) ? (asObj(section.content).items as unknown[]) : []
      return (
        <ol style={{ margin: '14px 0 24px', paddingLeft: 0, listStyle: 'none', fontFamily: chrome.articleFont }}>
          {items.map((it, i) => (
            <li key={i} style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 999, background: primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{i + 1}</div>
              <div style={{ ...body, fontSize: 17, lineHeight: 1.65, paddingTop: 4 }}>{t(it)}</div>
            </li>
          ))}
        </ol>
      )
    }
    case 'image_block': {
      const c = asObj(section.content)
      return (
        <figure style={{ margin: '24px 0' }}>
          {asStr(c.url) ? (
            <img loading="lazy" decoding="async" src={asStr(c.url)} alt={asStr(c.alt)} style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: 200, background: chrome.ruleColor, borderRadius: 10 }} />
          )}
          {asStr(c.caption) ? <figcaption style={{ fontSize: 12.5, color: chrome.muted, textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>{t(c.caption)}</figcaption> : null}
        </figure>
      )
    }
    case 'cta_inline': {
      const c = asObj(section.content)
      const href =
        asStr(c.linkType) === 'call'
          ? `tel:${callDigits(brand)}`
          : asStr(c.linkType) === 'external'
            ? asStr(c.externalUrl) || '#'
            : quizHref(quiz, brand)
      return (
        <div style={{ margin: '32px 0', padding: 'clamp(22px, 4vw, 32px)', borderRadius: 14, background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`, color: '#fff', fontFamily: chrome.articleFont, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            {asStr(c.headline) ? <div style={{ fontSize: 'clamp(18px, 2.6vw, 22px)', fontWeight: 700, marginBottom: 6 }}>{t(c.headline)}</div> : null}
            {asStr(c.subline) ? <div style={{ fontSize: 14.5, opacity: 0.92 }}>{t(c.subline)}</div> : null}
          </div>
          <a href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 22px', background: '#fff', color: primary, borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
            {asStr(c.buttonText) || 'Check my case'} <ArrowRight size={16} />
          </a>
        </div>
      )
    }
    case 'divider':
      return <hr style={{ border: 'none', borderTop: `1px solid ${chrome.ruleColor}`, margin: '36px 0' }} />
    case 'disclaimer': {
      const c = asObj(section.content)
      const text = c.useDefault !== false ? disclaimerOf(brand) : asStr(c.customText)
      return (
        <div style={{ ...body, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${chrome.ruleColor}`, fontSize: 11.5, color: chrome.muted, lineHeight: 1.6 }}>
          {t(text)}
        </div>
      )
    }
    default:
      return null
  }
}

export function AdvertorialRuntime({
  advertorial,
  brand,
  quizLink,
  ctaMode = 'button',
  embedSlot = null,
}: {
  advertorial: { templateId?: string | null; sections?: unknown[] }
  brand: BrandLike | null | undefined
  quizLink?: AdvertorialQuizLink | null
  ctaMode?: 'button' | 'embed'
  embedSlot?: ReactNode
}) {
  const chrome = advertorialChrome(advertorial.templateId)
  const b: BrandLike = brand || {}
  const primary = b.colors?.primary || '#1d8df6'
  const accent = b.colors?.accent || primary
  const quiz = quizLink || null
  const sections = Array.isArray(advertorial.sections)
    ? (advertorial.sections as AdvertorialSection[])
    : []

  return (
    <div
      className="adv-public-root"
      data-adv-template={chrome.id}
      data-adv-header={chrome.headerVariant}
      data-adv-footer={chrome.footerVariant}
      style={{ backgroundColor: chrome.pageBackground, color: chrome.ink, minHeight: '100%' }}
    >
      <style>{`
        @media (max-width: 640px) {
          .adv-public-root .adv-header { flex-wrap: wrap !important; padding: 12px 18px !important; gap: 10px !important; }
          .adv-public-root h1 { font-size: clamp(26px, 7vw, 32px) !important; }
          .adv-public-root h2 { font-size: clamp(22px, 6vw, 28px) !important; }
        }
      `}</style>
      <Header chrome={chrome} brand={b} quiz={quiz} primary={primary} accent={accent} />
      <article
        data-adv-template={chrome.id}
        style={{
          maxWidth: chrome.articleMaxWidth,
          margin: '0 auto',
          padding: 'clamp(32px, 5vw, 64px) clamp(20px, 4vw, 32px)',
          backgroundColor: chrome.articleSurface,
          color: chrome.ink,
          fontFamily: chrome.articleFont,
        }}
      >
        {sections.map((s, i) => (
          <div key={s.id || i}>{renderSection(s, b, quiz, chrome, primary, accent)}</div>
        ))}
      </article>
      {ctaMode === 'embed' && embedSlot ? embedSlot : <BottomCta brand={b} quiz={quiz} primary={primary} accent={accent} font={chrome.articleFont} />}
      <Footer chrome={chrome} brand={b} quiz={quiz} primary={primary} />
    </div>
  )
}
