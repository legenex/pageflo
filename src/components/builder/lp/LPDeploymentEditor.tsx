// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * The LP deployment editor.
 *
 * A deployment is the composition the product is actually made of: TEMPLATE x
 * BRAND x DOMAIN x PATH x QUIZ FLOW x QUIZ SKIN x copy x destinations x pixels.
 * It used to be one flat card of eight fields, which drew every one of those
 * decisions at the same weight and put the most consequential of them - which
 * template a visitor sees - in a dropdown of names.
 *
 * Three tabs, the same shell the quiz deployment editor uses, because they are
 * the same job under two kinds of content and an operator should not have to
 * learn the surface twice:
 *
 *   General            what this placement IS, and what it looks like
 *   Destination URL's  where it sends people, per placement
 *   Tracking & Pixels  what it reports, per placement
 *
 * There is deliberately NO render-mode selector. A landing page is a standalone
 * page; an "embed" mode would be a control that has to be set to the only value
 * that works, offered purely so the two editors look alike.
 */

import { useEffect, useState } from 'react'
import { Eye, Save, Trash2 } from 'lucide-react'

import { T, Btn, Input, Select, Label, Pill, TopBar, genId } from '../ui'
import { SectionHeading } from './SectionHeading'
import { TemplateGallery } from '@/components/builder/templates/TemplateGallery'
import { BrandQuickEdit } from '../brand/BrandQuickEdit'
import { PIXEL_PROVIDERS } from '@/components/builder/quiz/config'
import { selectableOptions } from '@/lib/selectable'
import {
  DESTINATION_HINTS,
  DESTINATION_KEYS,
  DESTINATION_LABELS,
  destinationOrigin,
  isSafeDestinationUrl,
  resolveDestination,
} from '@/lib/quiz-destinations'
import { domainOptionLabel, isDomainSelectable } from '@/lib/domain-eligibility'
import {
  displayDeploymentUrl,
  effectiveDeploymentUrl,
  toDomainLike,
  NO_SERVABLE_HOST_LABEL,
} from '@/lib/deployment-url'

const NEUTRAL = '__neutral__'

/* ------------------------------------------------------------ destinations */

/**
 * Per-deployment destination overrides.
 *
 * Shows the URL each destination will ACTUALLY resolve to and where that value
 * came from, rather than an empty box that hides an inherited value. An empty
 * override is not "no destination" - it means "use the brand's" - and the panel
 * says so, so nobody sets a redirect they think is unconfigured.
 */
const DestinationsPanel = ({ draft, brand, onChange }) => {
  const overrides = draft.destinationOverrides || {}
  const ctx = { deployment: overrides, brand: brand?.urls }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeading
        eyebrow="Routing"
        title="Destination URL's"
        hint={
          'The quiz embedded in this page sends people to a destination by NAME, so this placement can route somewhere different from the brand default without editing the quiz. Leave a field blank to inherit.' +
          (brand ? '' : ' Pick a brand on the General tab to see what would be inherited.')
        }
      />
      {DESTINATION_KEYS.map((key) => {
        const value = overrides[key] || ''
        const resolved = resolveDestination(key, ctx)
        const origin = destinationOrigin(key, ctx)
        const invalid = value && !isSafeDestinationUrl(value)
        return (
          <div key={key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Label style={{ marginBottom: 0 }}>{DESTINATION_LABELS[key]}</Label>
              <Pill color={origin === 'deployment' ? T.primary : origin === 'brand' ? T.info : T.textMute}>
                {origin === 'deployment' ? 'THIS DEPLOYMENT' : origin === 'brand' ? 'FROM BRAND' : 'SITE DEFAULT'}
              </Pill>
            </div>
            <Input mono value={value} onChange={(e) => onChange(key, e.target.value)} placeholder={resolved} />
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              resolves to {resolved}
            </div>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 2 }}>{DESTINATION_HINTS[key]}</div>
            {invalid ? (
              <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>
                Not a usable link. Use a full https:// address or a path starting with /.
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- tracking */

const TrackingPanel = ({ draft, update }) => {
  const pixels = draft.pixels || {}
  const updPixel = (provider, p) => update({ pixels: { ...pixels, [provider]: { ...(pixels[provider] || {}), ...p } } })
  const updUtm = (p) => update({ utm: { ...(draft.utm || {}), ...p } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div>
        <SectionHeading
          eyebrow="Attribution"
          title="UTM defaults"
          hint="Used when no UTM parameters are present in the URL. Parameters captured from the visitor's link always win."
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><Label>Source</Label><Input mono value={(draft.utm || {}).source || ''} onChange={(e) => updUtm({ source: e.target.value })} placeholder="meta" /></div>
          <div><Label>Medium</Label><Input mono value={(draft.utm || {}).medium || ''} onChange={(e) => updUtm({ medium: e.target.value })} placeholder="cpc" /></div>
          <div><Label>Campaign</Label><Input mono value={(draft.utm || {}).campaign || ''} onChange={(e) => updUtm({ campaign: e.target.value })} placeholder="mva_q1" /></div>
        </div>
      </div>

      <div>
        <SectionHeading
          eyebrow="Measurement"
          title="Pixels & CAPI providers"
          hint="Configured per placement, so two deployments of one template can report to two different ad accounts. Credentials are stored on the deployment and used server side."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PIXEL_PROVIDERS.map((p) => {
            const cfg = pixels[p.id] || { enabled: false }
            return (
              <div key={p.id} style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: cfg.enabled ? 12 : 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, backgroundColor: `${p.color}22`, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>{p.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: T.textMute }}>{p.fields.length} configuration field{p.fields.length === 1 ? '' : 's'}</div>
                  </div>
                  <button
                    onClick={() => updPixel(p.id, { enabled: !cfg.enabled })}
                    style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: cfg.enabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${cfg.enabled ? T.success : T.border}`, color: cfg.enabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {cfg.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
                {cfg.enabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.fields.map(([fkey, flabel]) => (
                      <div key={fkey}><Label>{flabel}</Label><Input mono value={cfg[fkey] || ''} onChange={(e) => updPixel(p.id, { [fkey]: e.target.value })} /></div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ editor */

export const LPDeploymentEditor = ({
  deployment,
  templates,
  brands,
  quizzes,
  quizTemplates,
  onBrandSaved,
  onSave,
  onDelete,
  onCancel,
  onToast,
  onPreview,
}) => {
  const [draft, setDraft] = useState(deployment)
  const [tab, setTab] = useState('general')
  /*
   * A save in flight. Not cosmetic: the server treats only an all-digit id as an
   * existing row, so the client-minted `ldep_*` id on a NEW deployment is
   * ignored and every submit INSERTS. A second click before the first settles is
   * therefore a second deployment, not a no-op — production rows 19 and 20 are
   * that pair, identical in every field, eight seconds apart, same operator.
   */
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(deployment); setTab('general'); setSaving(false) }, [deployment?.id])
  if (!draft) return null

  const update = (p) => setDraft((d) => ({ ...d, ...p }))

  const brand = brands.find((b) => b.id === draft.brandId) || null
  const template = templates.find((t) => t.id === draft.landingPageId) || null

  /*
   * ONE calculation, shared with the list, the preview button and the public
   * router. The header, the Final URL box and the link a visitor is given are
   * three views of this object and can no longer disagree — which they did, on
   * a saved deployment, in three different ways. See src/lib/deployment-url.ts.
   */
  const brandDomains = brand?.__domains ?? []
  const effective = effectiveDeploymentUrl({
    boundHost: draft.domain,
    brandDomains,
    path: draft.path,
  })
  const finalURL = displayDeploymentUrl(effective)

  // Pickers go through one helper so an archived record is never offered and a
  // saved reference to one is never silently dropped. See src/lib/selectable.ts.
  const quizOptions = selectableOptions({
    records: quizzes,
    selectedId: draft.quizId,
    toRecord: (q) => ({ id: q.id, label: q.name, status: q.isArchived ? 'archived' : q.isPublished ? 'published' : 'draft' }),
  })

  /*
   * Eligibility comes from the ONE contract, not a second opinion typed here.
   *
   * This picker used to require `status === 'active' && sslStatus === 'active'`
   * inline. That rejected every PREVIEW host, because a preview row is created
   * active with `ssl_status: 'unknown'` and no preview host has ever been
   * through certificate issuance. So the editor reported "No domain ready for
   * this brand" about a domain the public router serves, the publish preflight
   * passes, and `domainEligibility` calls eligible — four surfaces, two answers.
   * Ineligible domains are offered disabled with the reason, so "why is my
   * domain not in the list" still has an answer on screen.
   */
  const domainOptions = selectableOptions({
    records: brandDomains,
    selectedId: draft.domain,
    toRecord: (d) => ({ id: d.host, label: domainOptionLabel(toDomainLike(d)), status: 'published' }),
    isEligible: (_rec, d) => isDomainSelectable(toDomainLike(d)),
  })

  /*
   * The quiz skin. The chosen LANDING PAGE recommends one - the twelve and the
   * twenty were drawn from the same handoff and eleven of the quiz templates
   * name the LP they belong to - so "no override" is a named choice here rather
   * than a blank, and the operator can see what they are inheriting.
   */
  const recommendedId = template?.recommendedQuizTemplateId || ''
  const recommended = quizTemplates.find((q) => q.templateId === recommendedId) || null
  const quizTemplateOptions = selectableOptions({
    records: quizTemplates,
    selectedId: draft.embeddedQuizTemplateId,
    toRecord: (q) => ({
      id: q.templateId,
      label: `${q.name}${q.code ? `  ${q.code}` : ''}`,
      status: q.archivedAt ? 'archived' : 'published',
    }),
    isEligible: (_rec, q) => q.isEnabled && !q.rendererError,
  })

  const destinationCount = Object.keys(draft.destinationOverrides || {}).length

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'destinations', label: `Destination URL's${destinationCount ? ' · OVERRIDE' : ''}` },
    { id: 'tracking', label: 'Tracking & Pixels' },
  ]

  const handleSave = () => {
    if (saving) return
    if (!draft.landingPageId) { onToast?.({ message: 'Pick a landing page template first.', type: 'error' }); setTab('general'); return }
    if (!draft.brandId) { onToast?.({ message: 'Pick a brand first.', type: 'error' }); setTab('general'); return }
    // A deployment with no path normalizes to '/', which the public resolver
    // hands back to the Site's home page. It would save and never serve.
    if (!String(draft.path || '').trim()) { onToast?.({ message: 'Give this deployment a path, for example /c/mva.', type: 'error' }); setTab('general'); return }
    const bad = Object.entries(draft.destinationOverrides || {}).find(([, v]) => v && !isSafeDestinationUrl(v))
    if (bad) { onToast?.({ message: `${DESTINATION_LABELS[bad[0]] || bad[0]} is not a usable link.`, type: 'error' }); setTab('destinations'); return }

    setSaving(true)
    const result = onSave({ ...draft, id: draft.id || genId('ldep'), status: draft.status || 'draft', path: draft.path || '' })
    // The caller returns a promise on the real save path. Guarding on `then`
    // rather than assuming keeps this correct for any caller that does not.
    if (result && typeof result.then === 'function') result.then(() => setSaving(false), () => setSaving(false))
    else setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        crumbs="ADMIN / FUNNELS / LANDING PAGES / DEPLOYMENT"
        title={draft.name || template?.name || 'New deployment'}
        onBack={onCancel}
        actions={
          <>
            {draft.id && <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onPreview?.(draft)}>Preview</Btn>}
            {draft.id && <Btn variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(draft.id)}>Delete</Btn>}
            <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" size="sm" icon={Save} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Deployment'}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: T.bg }}>
        <div style={{ padding: '24px 40px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 24, color: T.text, fontWeight: 700, letterSpacing: '-0.025em', fontFamily: '"JetBrains Mono", monospace' }}>
              {effective.host ? `${effective.host}${effective.path === '/' ? '' : effective.path}` : NO_SERVABLE_HOST_LABEL}
            </div>
            <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 4 }}>
              {template?.name || 'no template'} {'·'} {brand?.displayName || 'no brand'} {'·'} {(draft.status || 'draft').toUpperCase()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 22, overflowX: 'auto' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                data-deployment-tab={t.id}
                aria-current={tab === t.id ? 'true' : undefined}
                onClick={() => setTab(t.id)}
                style={{ padding: '11px 14px', backgroundColor: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.id ? T.primary : 'transparent'}`, color: tab === t.id ? T.text : T.textMute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div>
                <SectionHeading
                  eyebrow="Placement"
                  title="Where this page lives"
                  hint="One template can be deployed many times. This is the row that binds it to a brand, a domain and a path, and it is what a visitor actually reaches."
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <Label>Deployment name</Label>
                    <Input value={draft.name || ''} onChange={(e) => update({ name: e.target.value })} placeholder="eg CMC Recovery Story / Truck Campaign" />
                    <div style={{ fontSize: 11, color: T.textMute, marginTop: 5 }}>An internal label so you can tell deployments apart in the list.</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <Label>Quiz flow</Label>
                      <Select value={draft.quizId || ''} onChange={(e) => update({ quizId: e.target.value })}>
                        <option value="">None (page with no form)</option>
                        {quizOptions.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' · ARCHIVED' : ''}</option>)}
                      </Select>
                      <div style={{ fontSize: 11, color: T.textMute, marginTop: 5, lineHeight: 1.5 }}>
                        The flow this page runs, chosen directly. Embedding a quiz no longer requires publishing a separate standalone quiz page first.
                      </div>
                      {draft.quizDeploymentId && !draft.quizId && (
                        <div style={{ fontSize: 11, color: T.warning, marginTop: 5, lineHeight: 1.5 }}>
                          This deployment still points at standalone quiz deployment {draft.quizDeploymentId}. Pick a flow above to move it over; the old pointer is kept until you do.
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Brand</Label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Changing the brand clears the domain: a host belongs
                              to one brand, and keeping it would write a
                              cross-tenant reference the server then refuses. */}
                          <Select value={draft.brandId || ''} onChange={(e) => update({ brandId: e.target.value, domain: '' })}>
                            <option value="">Pick a brand</option>
                            {selectableOptions({
                              records: brands,
                              selectedId: draft.brandId,
                              toRecord: (b) => ({ id: b.id, label: b.displayName, status: b.status === 'archived' ? 'archived' : 'published' }),
                            }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
                          </Select>
                        </div>
                        {/* Beside the picker, because the moment you notice a
                            colour is wrong is the moment you are looking at
                            which brand is set. */}
                        <BrandQuickEdit brand={brand} onSaved={onBrandSaved} align="right" />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div>
                      <Label>Domain</Label>
                      <Select value={draft.domain || ''} onChange={(e) => update({ domain: e.target.value })} disabled={!draft.brandId}>
                        <option value="">
                          {!draft.brandId ? 'Pick a brand first' : domainOptions.length === 0 ? 'No domain ready for this brand (preview URL will be used)' : 'No domain attached (use preview URL)'}
                        </option>
                        {domainOptions.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}</option>)}
                      </Select>
                      <div style={{ fontSize: 11, color: T.textMute, marginTop: 5, lineHeight: 1.5 }}>
                        Domains come from the brand. Manage them in <span style={{ color: T.text }}>Brands {'›'} Domains</span>.
                      </div>
                      {domainOptions.some((o) => o.disabled) && (
                        <div style={{ fontSize: 10.5, color: T.warning, marginTop: 4 }}>
                          A domain shown greyed out is not ready to serve traffic. Its status and certificate both have to be active.
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Path</Label>
                      <Input mono value={draft.path || ''} onChange={(e) => update({ path: e.target.value })} placeholder="/c/your-path" />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'start' }}>
                    <div>
                      <Label>Status</Label>
                      <Select value={draft.status || 'draft'} onChange={(e) => update({ status: e.target.value })}>
                        <option value="draft">Draft</option>
                        <option value="live">Live</option>
                        <option value="paused">Paused</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Final URL</Label>
                      <div style={{ padding: '7px 10px', backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: effective.url ? T.text : T.warning, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {finalURL}
                      </div>
                      {/* What this URL IS, said plainly. The old badge read
                          "PREVIEW URL" whenever no domain was bound, including
                          when the URL shown was not a preview host at all. */}
                      <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {effective.hostSource === 'brand-preview' && <Pill color={T.info}>PREVIEW HOST</Pill>}
                        {effective.hostSource === 'brand-primary' && !draft.domain && <Pill color={T.info}>BRAND PRIMARY</Pill>}
                        {effective.certificateUnverified && <Pill color={T.warning}>CERTIFICATE UNVERIFIED</Pill>}
                        {effective.problem ? <Pill color={T.danger}>{effective.problem.toUpperCase()}</Pill> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <SectionHeading
                  eyebrow="Design"
                  title="Landing page template"
                  hint={
                    brand
                      ? `Every card is a real render in ${brand.displayName}'s own colours, through the same token path the live page uses. What you see is what this deployment becomes.`
                      : 'Every card is a real render. Pick a brand above to see these templates in that brand’s colours.'
                  }
                />
                <TemplateGallery
                  kind="lp"
                  templates={templates}
                  brands={brands}
                  brandId={draft.brandId || NEUTRAL}
                  selectedId={draft.landingPageId}
                  onSelect={(t) => update({ landingPageId: t.id })}
                  emptyMessage="No landing page templates in the library yet."
                />
              </div>

              <div>
                <SectionHeading
                  eyebrow="Form"
                  title="Embedded quiz appearance"
                  hint="The skin the embedded flow is drawn in. Leave it on the recommendation unless this placement needs to look different from the template it sits in."
                />
                <div style={{ maxWidth: 520 }}>
                  <Label>Quiz template</Label>
                  <Select
                    value={draft.embeddedQuizTemplateId || ''}
                    onChange={(e) => update({ embeddedQuizTemplateId: e.target.value })}
                    disabled={!draft.quizId}
                  >
                    <option value="">
                      {recommended
                        ? `Use this template's recommendation (${recommended.name})`
                        : recommendedId
                          ? `Use this template's recommendation (${recommendedId})`
                          : "Use this template's recommendation"}
                    </option>
                    {quizTemplateOptions.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' · ARCHIVED' : ''}</option>)}
                  </Select>
                  {!draft.quizId && (
                    <div style={{ fontSize: 11, color: T.textMute, marginTop: 5 }}>
                      Pick a quiz flow above first. With no flow there is nothing to skin.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'destinations' && (
            <DestinationsPanel
              draft={draft}
              brand={brand}
              onChange={(key, value) => {
                const next = { ...(draft.destinationOverrides || {}) }
                // A blank field means INHERIT, so the key is removed rather than
                // stored empty - an empty string would override the brand's URL
                // with nothing.
                if (value.trim()) next[key] = value.trim()
                else delete next[key]
                update({ destinationOverrides: next })
              }}
            />
          )}

          {tab === 'tracking' && <TrackingPanel draft={draft} update={update} />}
        </div>
      </div>
    </div>
  )
}
