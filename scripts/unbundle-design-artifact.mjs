/**
 * Unpack a supplied design artifact into readable files.
 *
 *   node scripts/unbundle-design-artifact.mjs <bundled.html> <outDir>
 *
 * WHY THIS EXISTS. The design artifacts in `quizzes/` and `review/` are
 * SELF-EXTRACTING pages: a small loader plus a `script[type="__bundler/manifest"]`
 * holding every asset as base64, mostly gzipped, keyed by uuid — and a
 * `script[type="__bundler/template"]` holding the document that references them.
 * Nothing readable survives a grep, which is exactly how a source-of-truth audit
 * ends up reading the implementation instead of the source and calling it
 * agreement. `grep "PRESENTATION MODES" quizzes/Standalone-Quiz-States.html`
 * returns nothing, and the string is right there once the page is unpacked.
 *
 * The loader also nests: a root document's manifest carries the page bundles its
 * iframes point at, addressed as `about:blank#<uuid>`. Those inner pages are
 * themselves whole bundled documents, so the extraction recurses.
 *
 * Writes each asset under `<outDir>/assets/<uuid>.<ext>`, the top-level document
 * as `<outDir>/index.html`, and a `manifest.json` naming every asset with its
 * mime and byte length so an auditor can see what is in the bundle without
 * opening a browser.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
  console.error('usage: node scripts/unbundle-design-artifact.mjs <bundled.html> <outDir>')
  process.exit(2)
}

/** The text of a `script[type="__bundler/<name>"]` block, unescaped. */
const scriptBlock = (html, name) => {
  const open = new RegExp(`<script[^>]*type=["']__bundler/${name}["'][^>]*>`, 'i')
  const m = open.exec(html)
  if (!m) return null
  const start = m.index + m[0].length
  const end = html.indexOf('</script>', start)
  return end < 0 ? null : html.slice(start, end)
}

const decode = (entry) => {
  const bin = Buffer.from(entry.data ?? '', 'base64')
  if (!entry.compressed) return bin
  try {
    return gunzipSync(bin)
  } catch {
    // Report rather than silently write a corrupt asset: a truncated bundle is
    // a fact about the supplied material and the auditor has to know.
    return null
  }
}

const extFor = (mime) => {
  const m = String(mime ?? '')
  if (m.includes('html')) return 'html'
  if (m.includes('css')) return 'css'
  if (m.includes('javascript')) return 'js'
  if (m.includes('json')) return 'json'
  if (m.includes('svg')) return 'svg'
  if (m.includes('png')) return 'png'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('webp')) return 'webp'
  if (m.includes('woff2')) return 'woff2'
  if (m.includes('woff')) return 'woff'
  if (m.startsWith('font/') || m.includes('font')) return 'ttf'
  return 'bin'
}

const write = (p, buf) => {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, buf)
}

const index = []
let assetCount = 0
let nested = 0

/**
 * Unpack one bundled document. `label` names it in the index; nested page
 * bundles recurse under their own uuid so an iframe's design is a real file.
 */
const unpack = (html, dir, label) => {
  const rawManifest = scriptBlock(html, 'manifest')
  const rawTemplate = scriptBlock(html, 'template')
  if (!rawManifest || !rawTemplate) {
    // Not a bundle — an ordinary page. Keep it as-is; it is still source.
    write(join(dir, 'index.html'), Buffer.from(html, 'utf8'))
    index.push({ label, kind: 'plain-html', bytes: html.length })
    return
  }

  let manifest
  let template
  try {
    manifest = JSON.parse(rawManifest)
    template = JSON.parse(rawTemplate)
  } catch (err) {
    console.error(`  !! ${label}: manifest/template did not parse (${err.message})`)
    return
  }

  for (const [uuid, entry] of Object.entries(manifest)) {
    const bytes = decode(entry)
    if (!bytes) {
      index.push({ label, uuid, mime: entry.mime, error: 'could not decompress' })
      continue
    }
    const mime = String(entry.mime ?? '')
    const ext = extFor(mime)
    const path = join(dir, 'assets', `${uuid}.${ext}`)
    write(path, bytes)
    assetCount++
    index.push({ label, uuid, mime, ext, bytes: bytes.length, path })

    // A nested PAGE bundle is a whole document in its own right. Recursing is
    // what makes an iframe's design readable rather than a uuid in a src.
    if (ext === 'html') {
      const inner = bytes.toString('utf8')
      if (inner.includes('__bundler/manifest')) {
        nested++
        unpack(inner, join(dir, 'nested', uuid), `${label} > ${uuid}`)
      }
    }
  }

  write(join(dir, 'index.html'), Buffer.from(String(template), 'utf8'))
}

const html = readFileSync(src, 'utf8')
console.log(`unbundling ${src}`)
unpack(html, outDir, src.split('/').pop())
write(join(outDir, 'manifest.json'), Buffer.from(JSON.stringify(index, null, 2), 'utf8'))
console.log(`  ${assetCount} assets, ${nested} nested page bundle(s) -> ${outDir}`)
