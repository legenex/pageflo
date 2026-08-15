// @ts-nocheck -- moved verbatim from the ported builder preview, whose brand and
// section shapes are untyped. Run `pnpm generate:types` on the server to restore
// typing across the funnel builder.
'use client'

/**
 * Page chrome around a quiz: the brand's body sections, and the palette they
 * are painted with.
 *
 * Lifted out of `builder/quiz/preview.tsx` so the public quiz surface can draw
 * page chrome without importing the builder's flow-preview module — which also
 * pulls a server-action import and the whole quiz editor into the public
 * bundle. Nothing here changed in the move.
 */

import { CheckCircle2, Phone } from 'lucide-react'

import { ICON_OPTIONS } from '@/components/builder/body-sections'
import { getTemplateConfig } from '@/components/builder/quiz/templates'
import { onPrimaryText, getSafeTextColor, getSafeMutedColor, deriveBrandSurface } from '@/lib/builder/color-system'

/**
 * The contrast-safe palette for the standalone PAGE background: the surface
 * body sections and the header/footer chrome sit on. Distinct from the card
 * palette because page bg != card surface for most of the twenty.
 */
/**
 * @param ground  the opaque colour the chrome will actually sit on.
 *
 * Passed in by the surface because the CANVAS is the composition's, not the
 * template config's: four of the compositions deliberately ground on the
 * alternate tone rather than on the page colour. Deriving chrome text against
 * `pageBg` while the composition painted something else is the same class of
 * bug the whole colour system exists to prevent - and it is reachable, because
 * a brand that states a dark `cardBg` and a light `background` makes those two
 * grounds opposite ends of the range. Falls back to the template's page colour
 * so every existing caller keeps its answer.
 */
export const resolvePagePalette = (brand, templateId, progressForm = null, ground = null) => {
  // The ground comes from the template's OWN resolver, which is brand-derived.
  // This used to hardcode a cream page for the editorial template and fall back
  // to a navy for everything else, so a brand's background was ignored twice
  // over: once by the template and once by the fallback.
  const tc = getTemplateConfig(templateId, progressForm)
  const base = ground || tc.pageBg(brand)
  const text = getSafeTextColor(base).hex
  const muted = getSafeMutedColor(text, base).hex
  const cardSurface = deriveBrandSurface(brand?.colors?.cardBg || base, brand?.colors?.primary || base, { hueBlend: 0.05 })
  const cardText = getSafeTextColor(cardSurface).hex
  const cardMuted = getSafeMutedColor(cardText, cardSurface).hex
  return { base, text, muted, cardSurface, cardText, cardMuted, onPrimary: onPrimaryText(brand?.colors?.primary || base) }
}

export const renderBodySection = (section, brand, deployment, pal) => {
  if (!section.enabled) return null
  const cfg = section.config || {}
  const C = brand.colors
  // pal is the resolved PAGE palette (text/muted verified against the page bg,
  // cardText/cardSurface verified against the inner card). Falls back to a
  // dark-page assumption only if a caller forgot to pass it.
  const P = pal || { text: C.textOnDark, muted: `${C.textOnDark}b3`, cardSurface: C.cardBg, cardText: C.textOnDark, cardMuted: `${C.textOnDark}b3`, onPrimary: onPrimaryText(C.primary) }
  const fontFamily = `"${brand.typography.headlineFont}", sans-serif`
  const phoneNumber = brand.contact.callNumber

  if (section.type === 'CallCTA') {
    return <div key={section.id} style={{ padding: '40px 24px', textAlign: 'center', fontFamily }}>
      <div style={{ fontSize: 18, color: P.text, marginBottom: 16, fontWeight: 500 }}>{cfg.headline || "If you'd prefer to speak to someone right away, please call:"}</div>
      <a href={`tel:${(phoneNumber || '').replace(/[^0-9+]/g, '')}`} style={{ fontSize: 32, color: C.primary, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <Phone size={26} /> {phoneNumber}
      </a>
    </div>
  }

  if (section.type === 'TrustBlock') {
    const stats = cfg.statsCard || {}
    return <div key={section.id} style={{ padding: '60px 24px', fontFamily, color: P.text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.15, marginBottom: 14, letterSpacing: '-0.015em', color: P.text }}>{cfg.headline || "We'll Never Stop Fighting For You"}</div>
          <div style={{ fontSize: 15, color: P.muted, marginBottom: 22, lineHeight: 1.5 }}>{cfg.subheadline}</div>
          {(cfg.bullets || []).map((b, i) => {
            const Icon = ICON_OPTIONS[b.icon] || CheckCircle2
            return <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: `${C.primary}33`, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} /></div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45, color: P.text }}>{b.text}</div>
            </div>
          })}
          {cfg.ctaText && <button style={{ marginTop: 18, padding: '14px 28px', backgroundColor: C.primary, color: P.onPrimary, border: 'none', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily }}>{cfg.ctaText}</button>}
        </div>
        <div style={{ backgroundColor: P.cardSurface, border: `1px solid ${C.primary}33`, borderRadius: 14, padding: 28, textAlign: 'center', color: P.cardText }}>
          {stats.badge && <div style={{ display: 'inline-block', padding: '5px 12px', backgroundColor: `${C.primary}22`, color: C.primary, fontSize: 12, fontWeight: 600, borderRadius: 999, marginBottom: 14, letterSpacing: '0.02em' }}>{stats.badge}</div>}
          <div style={{ fontSize: 11, color: P.cardMuted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>{stats.label}</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: C.primary, letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.value}</div>
          {stats.description && <div style={{ fontSize: 13, color: P.cardMuted, marginTop: 14, lineHeight: 1.45 }}>{stats.description}</div>}
        </div>
      </div>
    </div>
  }

  if (section.type === 'RecentWins') {
    return <div key={section.id} style={{ padding: '60px 24px', fontFamily, color: P.text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.015em', color: P.text }}>{cfg.headline}</div>
          <div style={{ fontSize: 14.5, color: P.muted, lineHeight: 1.45, maxWidth: 640, margin: '0 auto' }}>{cfg.subheadline}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {(cfg.wins || []).map((w, i) => <div key={i} style={{ backgroundColor: P.cardSurface, border: `1px solid ${C.primary}33`, borderRadius: 12, padding: '24px 20px', textAlign: 'center', color: P.cardText }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>{w.amount}</div>
            <div style={{ fontSize: 13.5, color: P.cardText, fontWeight: 500 }}>{w.name}</div>
            <div style={{ fontSize: 12, color: P.cardMuted, marginTop: 2 }}>{w.location}</div>
          </div>)}
        </div>
        {cfg.ctaText && <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button style={{ padding: '14px 32px', backgroundColor: C.primary, color: P.onPrimary, border: 'none', borderRadius: 999, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily }}>{cfg.ctaText}</button>
        </div>}
      </div>
    </div>
  }

  if (section.type === 'Disclaimer') {
    const text = cfg.useDefault ? brand.legal.defaultDisclaimer : cfg.customText
    return <div key={section.id} style={{ padding: '24px', textAlign: 'center', fontFamily, fontSize: 11.5, color: P.muted, lineHeight: 1.5, maxWidth: 900, margin: '0 auto' }}>{text}</div>
  }

  if (section.type === 'CustomHTML') {
    return <div key={section.id} style={{ fontFamily, color: P.text }} dangerouslySetInnerHTML={{ __html: cfg.html || '' }} />
  }

  return null
}
