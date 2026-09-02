'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { invokeLLM } from '@/lib/ai/invoke'
import { safeFetch } from '@/lib/net/ssrf'
import { BlockSchema, normalizeAIBlocks } from '@/lib/builder/block-schemas'

// Clone a public URL into a new Page. We fetch the source HTML, hand it to
// the model with the full Pages body_blocks schema, and the model returns
// a structured list of blocks that closely mirrors the source layout. The
// new page is created in draft so the user can review before publishing.

const CLONE_SCHEMA = z.object({
  title: z.string().describe('Short page title suitable for a browser tab (e.g. "Home", "Services", "About").'),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  body_blocks: z.array(BlockSchema).describe('Page sections, top to bottom, mapped to the closest matching block type.'),
})

// Strip everything that isn't visible page copy / structure so the model gets
// a concise input. We keep heading levels, paragraphs, lists, image alt text,
// and anchor labels — drop scripts, styles, comments, SVG paths.
const stripHtml = (html: string, maxChars = 60_000): string => {
  let s = html
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > maxChars) s = s.slice(0, maxChars) + ' …[truncated]'
  return s
}

type CloneResult =
  | { ok: true; id: string | number }
  | { ok: false; error: string }

export async function createPageFromUrl(args: {
  siteId: number | string
  siteSlug: string
  slug: string
  status: string
  sourceUrl: string
}): Promise<CloneResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  let sourceUrl = (args.sourceUrl || '').trim()
  if (!sourceUrl) return { ok: false, error: 'Source URL is required' }
  if (!/^https?:\/\//i.test(sourceUrl)) sourceUrl = 'https://' + sourceUrl

  let slug = (args.slug || '').trim()
  if (!slug) return { ok: false, error: 'Slug is required' }
  if (slug !== '/' && !slug.startsWith('/')) slug = '/' + slug

  // Try a regular browser-ish UA first; some sites short-circuit unknown
  // bots with a minimal SEO snapshot. If the body looks too thin (SPA, paywall,
  // anti-bot), retry as Googlebot — many sites pre-render specifically for
  // crawlers. Two attempts is enough to be useful without becoming abusive.
  const UAS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ]
  let html = ''
  let lastError: string | null = null
  for (const ua of UAS) {
    // `safeFetch`, not `fetch`: the address is typed by an operator and read by
    // the SERVER, which can reach the metadata endpoint and the database that
    // the operator cannot. It re-admits the host on every redirect hop, so a
    // public URL that 302s to 127.0.0.1 is refused at the hop rather than
    // followed. See lib/net/ssrf.
    const res = await safeFetch(sourceUrl, {
      method: 'GET',
      headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    if (!res.ok) {
      lastError = res.reason
      continue
    }
    if (res.body.length > html.length) html = res.body
    // Anything over ~30 KB is plenty to extract real content from; stop early.
    if (html.length > 30_000) break
  }
  if (!html) {
    return { ok: false, error: lastError ? `Could not fetch source URL: ${lastError}` : 'Could not fetch source URL.' }
  }

  const cleaned = stripHtml(html)

  // Heuristic SPA / paywall guard: if the stripped HTML is unusable, bail
  // BEFORE spending an LLM call and BEFORE creating a near-empty page that
  // the user has to clean up. We also count visible-text tokens (very rough)
  // so a 60 KB single-page-app shell with mostly script tags is caught even
  // after stripping.
  const textOnly = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 1000 || textOnly.length < 400) {
    return {
      ok: false,
      error:
        `${sourceUrl} returned only a minimal HTML shell (${textOnly.length} chars of visible text). ` +
        `This usually means the page is client-side rendered (single-page app) or behind a paywall / bot wall. ` +
        `Try a server-rendered URL (often /sitemap.xml lists them), or build the page manually.`,
    }
  }

  let cloned: z.infer<typeof CLONE_SCHEMA>
  try {
    cloned = await invokeLLM({
      schema: CLONE_SCHEMA,
      schemaName: 'cloned_page',
      system: [
        'You convert a public marketing/landing-page URL into a structured list of body_blocks for a PageFlo Page.',
        'Read the HTML body content, identify each visible section top-to-bottom, and emit ONE block per section using the closest matching blockType.',
        '',
        'Mapping rules:',
        '- Top navigation/header bar -> nav_header (links array, cta_label, cta_href).',
        '- Main above-the-fold hero -> hero. Put the full headline (including any accented second line) into `heading`. Set `image_url` only if the hero uses an image background or right-side photo.',
        '- A strip of small trust badges right under the hero -> trust_strip with one item per badge (value = the wordmark text).',
        '- "Our services / We specialize in" 3-4 up cards -> services_grid.',
        '- Numbered or stepped process explainer (1/2/3) -> how_it_works.',
        '- Customer testimonials/quotes -> testimonials.',
        '- Past results / settlement amounts -> recent_wins (amount string includes the $ and units).',
        '- Frequently Asked Questions accordions -> faq.',
        '- Final closing CTA section -> final_cta.',
        '- Generic 2-up / 3-up content cards -> cards.',
        '- Single image with caption -> image. Generic long-form copy -> prose with markdown.',
        '- Bulleted eligibility lists or "who we help" lists -> bullet_list.',
        '- Site footer with multiple link columns + legal text -> site_footer.',
        '',
        'Preserve the source copy verbatim where possible. If the source uses banned vocabulary (em-dashes, "vibes", "leverage", "synergy", "in today\'s world"), rewrite to remove them. Do NOT invent statistics, settlement amounts, or testimonials that are not in the source.',
        'If you genuinely cannot identify any usable section from the input, prefer fewer high-quality blocks over filler. Do NOT emit a single prose block whose body is an apology like "Could not extract content" — the caller handles that case separately.',
      ].join('\n'),
      user: [
        `Source URL: ${sourceUrl}`,
        '',
        'Stripped page HTML (scripts/styles/comments removed):',
        cleaned,
      ].join('\n'),
      maxTokens: 8192,
      enforceNoBannedVocab: true,
    })
  } catch (err) {
    return { ok: false, error: `AI clone failed: ${err instanceof Error ? err.message : 'unknown error'}` }
  }

  const payload = await getPayload({ config })
  try {
    const dup = await payload.find({
      collection: 'pages',
      where: { and: [{ site: { equals: args.siteId } }, { slug: { equals: slug } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (dup.docs.length > 0) {
      return { ok: false, error: `A page with slug "${slug}" already exists on this site.` }
    }

    const created = await payload.create({
      collection: 'pages',
      data: {
        site: args.siteId,
        title: cloned.title || 'Cloned page',
        slug,
        status: args.status || 'draft',
        template_key: 'custom',
        uses_shared_template: false,
        meta_title: cloned.meta_title || null,
        meta_description: cloned.meta_description || null,
        body_blocks: normalizeAIBlocks(cloned.body_blocks as Array<Record<string, unknown>>),
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    return { ok: true, id: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}
