'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { invalidateHostCache } from '@/lib/site-resolver'
import { invokeLLM } from '@/lib/ai/invoke'
import { homeBlocksForVertical, starterQuizSteps, starterLandingPage } from '@/lib/starter-content'
import { seedStarterFunnelsForBrand } from '@/lib/funnel-samples'
import { VERTICALS } from '@/lib/verticals'
import { env } from '@/lib/pageflo/env'

/**
 * The accepted vertical values, derived from the one list in
 * `src/lib/verticals.ts` rather than restated. A second copy is how a form
 * offers an option this action then rejects, which is what the general
 * verticals added in 20260901_233000 would otherwise have caused.
 */
const VERTICAL_VALUES = VERTICALS.map((v) => v.value) as [string, ...string[]]
const VERTICAL = z.enum(VERTICAL_VALUES)

const Common = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers, hyphens'),
  vertical: VERTICAL,
})

const Blank = Common.extend({ mode: z.literal('blank') })
const Duplicate = Common.extend({ mode: z.literal('duplicate'), source_site_id: z.number() })
const AITemplate = Common.extend({
  mode: z.literal('ai-template'),
  brief: z.string().min(10),
})

const CreateInput = z.discriminatedUnion('mode', [Blank, Duplicate, AITemplate])

const DEFAULT_PAGES = [
  { slug: '/', template_key: 'home', title: 'Home', uses_shared_template: false },
  { slug: '/partners', template_key: 'partners', title: 'Our Partners', uses_shared_template: true },
  { slug: '/privacy', template_key: 'privacy', title: 'Privacy Notice', uses_shared_template: true },
  { slug: '/privacy-policy', template_key: 'privacy-policy', title: 'Privacy Policy', uses_shared_template: true },
  { slug: '/terms-of-service', template_key: 'terms', title: 'Terms of Service', uses_shared_template: true },
  { slug: '/submitted', template_key: 'submitted', title: 'Thank you', uses_shared_template: true },
  { slug: '/thanks', template_key: 'thanks-dq', title: 'Thank you', uses_shared_template: true },
  { slug: '/tcpa', template_key: 'tcpa', title: 'TCPA Consent', uses_shared_template: true },
  { slug: '/disclosures', template_key: 'disclosures', title: 'Advertising Disclosures', uses_shared_template: true },
] as const

const DEFAULT_BRAND = {
  primary: '#0B1F3A',
  accent: '#E8B14B',
  surface: '#F7F5F0',
  ink: '#0E1116',
  muted: '#5C6470',
  font_heading: 'Inter',
  font_body: 'Inter',
}

const PHONE_BANK = ['(833) 555-0411', '(833) 555-0422', '(833) 555-0433', '(833) 555-0444', '(833) 555-0455']

const previewHostFor = (slug: string): string => `${slug}.${env('previewDomain') || 'preview.legenex.com'}`

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

type SuccessResult = {
  ok: true
  site: { id: number; slug: string; name: string }
  preview_host: string
}

type FailureResult = { ok: false; error: string }

export async function createSite(rawInput: unknown): Promise<SuccessResult | FailureResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsed = CreateInput.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
  }
  const input = parsed.data
  const payload = await getPayload({ config })

  // Slug uniqueness check.
  const slugConflict = await payload.find({
    collection: 'sites',
    where: { slug: { equals: input.slug } },
    limit: 1,
    overrideAccess: true,
  })
  if (slugConflict.docs[0]) return { ok: false, error: `slug "${input.slug}" already exists` }

  // Build the Site doc per mode. New Sites are created as drafts and only flip to
  // 'active' once the operator fills the production-required fields and explicitly
  // publishes them. The public router refuses to serve drafts.
  let siteData: Record<string, unknown> = {
    name: input.name,
    slug: input.slug,
    status: 'draft' as const,
    vertical: input.vertical,
    tagline: '',
    default_phone: PHONE_BANK[Math.floor(Math.random() * PHONE_BANK.length)],
    default_phone_tel: '',
    org_name: input.name,
    support_email: `support@${input.slug}.legenex.com`,
    brand: DEFAULT_BRAND,
    default_tone: 'empathetic' as const,
  }

  let pagesToClone: Array<{
    title: string
    slug: string
    template_key: string
    uses_shared_template: boolean
    body_blocks?: unknown
  }> = []

  if (input.mode === 'duplicate') {
    const sourceRes = await payload.find({
      collection: 'sites',
      where: { id: { equals: input.source_site_id } },
      limit: 1,
      overrideAccess: true,
    })
    const source = sourceRes.docs[0]
    if (!source) return { ok: false, error: 'source site not found' }
    siteData = {
      ...siteData,
      brand: source.brand ?? DEFAULT_BRAND,
      tagline: source.tagline ?? '',
      default_disclaimer_md: source.default_disclaimer_md ?? '',
      default_tone: source.default_tone ?? 'empathetic',
    }
    const sourcePages = await payload.find({
      collection: 'pages',
      where: { site: { equals: source.id } },
      limit: 200,
      overrideAccess: true,
    })
    pagesToClone = sourcePages.docs.map((p) => ({
      title: p.title,
      slug: p.slug,
      template_key: p.template_key,
      uses_shared_template: Boolean(p.uses_shared_template),
      body_blocks: p.body_blocks,
    }))
  }

  if (input.mode === 'ai-template') {
    // Single LLM call: get brand direction (name suggestion override allowed, plus tagline + palette).
    try {
      const Schema = z.object({
        tagline: z.string(),
        primary_color: z.string(),
        accent_color: z.string(),
        ink_color: z.string(),
        surface_color: z.string(),
        default_disclaimer: z.string(),
      })
      const ai = await invokeLLM({
        system: `You design legal-vertical brand systems for an attorney lead-gen platform. Output one set of brand tokens that fits the vertical and brief. Color tokens must be valid hex codes. The disclaimer must be neutral, attorney-advertising-safe, no medical or legal advice. Do not use em dashes.`,
        user: `Vertical: ${input.vertical}\nBrand name: ${input.name}\nBrief: ${input.brief}\n\nReturn brand direction.`,
        schema: Schema,
        schemaName: 'brand_direction',
        model: 'claude-sonnet-4-6',
        enforceNoBannedVocab: true,
      })
      siteData = {
        ...siteData,
        tagline: ai.tagline,
        default_disclaimer_md: ai.default_disclaimer,
        brand: {
          ...DEFAULT_BRAND,
          primary: ai.primary_color,
          accent: ai.accent_color,
          ink: ai.ink_color,
          surface: ai.surface_color,
        },
      }
    } catch (err) {
      // AI failure: fall through with defaults so the Site still gets created.
      const msg = err instanceof Error ? err.message : 'unknown'
      siteData.tagline = `${input.name} — see if you may qualify.`
      siteData.brand = DEFAULT_BRAND
      console.warn('[createSite ai-template] LLM failed, using defaults:', msg)
    }
  }

  // 1. Create the Site
  const created = (await payload.create({
    collection: 'sites',
    data: siteData as never,
    user: user as never,
    overrideAccess: false,
  })) as { id: number }
  const siteId = Number(created.id)

  // 2. Create preview Domain (always primary on creation; promoted away when custom verifies)
  const previewHost = previewHostFor(input.slug)
  await payload.create({
    collection: 'domains',
    data: {
      site: siteId,
      host: previewHost,
      kind: 'preview',
      primary: true,
      status: 'active',
    } as never,
    overrideAccess: true,
  })
  invalidateHostCache()

  // 3. Create the default Pages. For a fresh (non-duplicated) Site we seed the
  // home page with a real, vertical-appropriate starter block layout so a new
  // site is never empty ("This page has no content blocks yet"). Duplicated
  // sites keep their cloned blocks.
  const isFreshSite = pagesToClone.length === 0
  const starterHome = isFreshSite ? homeBlocksForVertical(input.vertical) : null
  const pages = pagesToClone.length > 0 ? pagesToClone : (DEFAULT_PAGES as unknown as typeof pagesToClone)
  for (const page of pages) {
    const body_blocks = page.slug === '/' && starterHome ? starterHome : page.body_blocks
    await payload.create({
      collection: 'pages',
      data: {
        site: siteId,
        title: page.title,
        slug: page.slug,
        status: 'published' as const,
        template_key: page.template_key,
        uses_shared_template: page.uses_shared_template,
        body_blocks,
        published_at: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    })
  }

  // 4. Empty TrackingConfig singleton
  await payload.create({
    collection: 'tracking-configs',
    data: { site: siteId } as never,
    overrideAccess: true,
  })

  // 5. Seed a starter Quiz + Landing Page for fresh sites so the funnel is
  // ready to edit, not blank. (Duplicated sites are left to their cloned set.)
  if (isFreshSite) {
    let quizId: number | null = null
    try {
      const quiz = (await payload.create({
        collection: 'quizzes',
        data: {
          site: siteId,
          name: `${input.name} Intake`,
          slug: '/quiz',
          status: 'published' as const,
          description: 'Starter qualifying quiz. Edit the steps to match your intake.',
          steps: starterQuizSteps(),
          dq_destination_slug: '/thanks',
          submitted_destination_slug: '/submitted',
        } as never,
        overrideAccess: true,
      })) as { id: number }
      quizId = Number(quiz.id)
    } catch (err) {
      console.warn('[createSite] starter quiz creation failed:', err instanceof Error ? err.message : err)
    }

    try {
      const lp = starterLandingPage()
      await payload.create({
        collection: 'landing-pages',
        data: {
          site: siteId,
          name: `${input.name} Landing Page`,
          slug: '/lp',
          status: 'published' as const,
          ...(quizId ? { quiz: quizId } : {}),
          hero: lp.hero,
          body_sections: lp.body_sections,
          social_proof: lp.social_proof,
          meta_title: `${input.name} — Free case review`,
        } as never,
        overrideAccess: true,
      })
    } catch (err) {
      console.warn('[createSite] starter landing page creation failed:', err instanceof Error ? err.message : err)
    }
  }

  // Auto-seed a starter Funnel Landing Page deployment + Quiz deployment on
  // the new Site. Every brand should land with working funnel content from
  // day one, whether it was created via Brand Identities or directly under
  // Sites. Idempotent + never-throwing — seeding failure shouldn't roll the
  // Site creation back.
  try {
    const seeded = await seedStarterFunnelsForBrand(payload, siteId)
    if (!seeded.ok) {
      console.warn('[createSite] starter funnels not seeded:', seeded.error)
    }
  } catch (err) {
    console.warn('[createSite] starter funnels not seeded:', err instanceof Error ? err.message : err)
  }

  revalidatePath('/admin/sites')
  revalidatePath('/admin/landing-pages')
  revalidatePath('/admin/quizzes')
  return {
    ok: true,
    site: { id: siteId, slug: input.slug, name: input.name },
    preview_host: previewHost,
  }
}

export async function suggestSlug(name: string): Promise<{ slug: string; available: boolean }> {
  const base = slugify(name)
  if (!base) return { slug: '', available: false }
  const payload = await getPayload({ config })
  const exists = await payload.find({
    collection: 'sites',
    where: { slug: { equals: base } },
    limit: 1,
    overrideAccess: true,
  })
  return { slug: base, available: exists.docs.length === 0 }
}
