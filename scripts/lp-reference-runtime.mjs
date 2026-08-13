/**
 * Running the design handoff's own component logic, once, at extraction time.
 *
 * Every reference page carries a `<script type="text/x-dc">` holding a small
 * React-ish component: a state object and a `renderVals()` that returns the
 * values the markup interpolates. Most of the twelve use it only for the
 * annotation toggle, which the chrome strip already removes. One does not.
 *
 * `case_type_router` builds its eight case-type cards and four quiz options
 * from arrays inside that script and repeats them with the handoff's own
 * `<sc-for>` directive. So its content is NOT IN ITS MARKUP: the markup holds
 * `{{ct.name}}` and the words live in a JavaScript array. Extracting it without
 * this produced a template with twenty-six unresolved placeholders and two loop
 * bodies that would have rendered `{{ct.name}}` to a visitor, which is why the
 * repo's own audit records that template as 105 of 174 elements.
 *
 * The alternative was to transcribe those arrays into our code by hand. That
 * makes the design and the port drift the moment the handoff changes, which is
 * the exact failure the generated modules exist to prevent. Running the
 * reference's own logic keeps one source of truth.
 *
 * WHY THIS IS SAFE. It runs in `node:vm` with no `require`, no `process`, no
 * filesystem and no network, over a file the developer already chose to check
 * out, at BUILD time only. Nothing here ships, nothing here runs on the server,
 * and nothing here runs against user input. It is the same trust level as a
 * config file that exports a function.
 *
 * WHAT IT PRODUCES. The component's INITIAL state, and only that. A static
 * export cannot reproduce "click a card and the page repaints" - that is
 * genuine interactivity and it is recorded as lost rather than faked. What it
 * does reproduce is exactly what the reference shows on load, which is what a
 * visitor sees and what the operator is editing.
 */
import { createContext, runInContext } from 'node:vm'

/** A `React.createElement` that emits an HTML string instead of a fiber. */
const VOID = new Set(['path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'br', 'img', 'use', 'stop'])

const ATTR_NAME = (k) =>
  ({
    className: 'class',
    strokeWidth: 'stroke-width',
    strokeLinecap: 'stroke-linecap',
    strokeLinejoin: 'stroke-linejoin',
    strokeDasharray: 'stroke-dasharray',
    fillRule: 'fill-rule',
    clipRule: 'clip-rule',
    viewBox: 'viewBox',
    xmlnsXlink: 'xmlns:xlink',
  })[k] ?? k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const createElement = (tag, props, ...children) => {
  const attrs = Object.entries(props ?? {})
    // `key` is React bookkeeping and never reaches the DOM. A function prop is
    // an event handler, which a static export cannot carry.
    .filter(([k, v]) => k !== 'key' && typeof v !== 'function' && v != null && v !== false)
    .map(([k, v]) => (v === true ? ` ${ATTR_NAME(k)}` : ` ${ATTR_NAME(k)}="${esc(v)}"`))
    .join('')
  const inner = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (VOID.has(tag) && inner === '') return `<${tag}${attrs} />`
  return `<${tag}${attrs}>${inner}</${tag}>`
}

/**
 * Evaluate a reference page's component and return its `renderVals()`.
 *
 * Returns `{}` when the page has no component or the component throws — a
 * template whose logic we cannot run must still extract, and the placeholders
 * it leaves behind are then reported by the slot validator rather than swallowed.
 */
export const runReferenceComponent = (pageHtml) => {
  const m = /<script[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(pageHtml)
  if (!m) return { values: {}, note: 'no component script' }

  const sandbox = {
    React: { createElement },
    console: { log() {}, warn() {}, error() {} },
    // The handoff's base class. Its only contract that renderVals relies on is
    // `this.props` and `this.state`; `setState` exists so a handler can be
    // constructed without throwing, and does nothing because we only ever read
    // the initial render.
    DCLogic: class {
      constructor() { this.props = {} }
      setState() {}
    },
    __out: null,
  }
  createContext(sandbox)

  try {
    runInContext(`${m[1]}\n__out = new Component().renderVals();`, sandbox, { timeout: 2000 })
  } catch (err) {
    return { values: {}, note: `component threw: ${err instanceof Error ? err.message : String(err)}` }
  }

  const values = sandbox.__out
  return values && typeof values === 'object'
    ? { values, note: '' }
    : { values: {}, note: 'renderVals returned no object' }
}

/* ------------------------------------------------------------------- sc-for */

/** Find the matching close tag for an element, honouring nesting. */
const matchingClose = (html, tag, from) => {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'g')
  re.lastIndex = from
  let depth = 0
  let m
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) {
      if (depth === 0) return { start: m.index, end: m.index + m[0].length }
      depth--
    } else depth++
  }
  return null
}

const substitute = (fragment, resolve) =>
  // An attribute whose whole value is a placeholder that resolves to a function
  // is an event handler with nothing behind it in a static page, so the
  // attribute is removed entirely rather than left holding "undefined".
  fragment
    .replace(/\s+[\w:-]+="\{\{\s*[\w.]+\s*\}\}"/g, (whole) => {
      const key = /\{\{\s*([\w.]+)\s*\}\}/.exec(whole)?.[1] ?? ''
      const v = resolve(key)
      if (v === undefined) return whole
      if (typeof v === 'function') return ''
      const name = /\s+([\w:-]+)=/.exec(whole)?.[1] ?? ''
      return ` ${name}="${esc(v)}"`
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key) => {
      const v = resolve(key)
      if (v === undefined || typeof v === 'function') return whole
      // An icon element is already a serialised SVG string; everything else is
      // text and is escaped, because these values come from the reference's own
      // data and must not be able to introduce markup by accident.
      return typeof v === 'string' && v.startsWith('<') ? v : esc(v)
    })

/**
 * Expand every `<sc-for>` and substitute the component's values.
 *
 * `hint-placeholder-count` is deliberately ignored: it is the handoff's hint
 * for how many skeleton items to draw when there is no data, and there IS data
 * here. Using the real list length is what makes the export show the eight case
 * types the design shows rather than eight copies of a placeholder.
 */
export const expandReference = (html, values) => {
  const resolveWith = (scope) => (key) => {
    const [head, ...rest] = key.split('.')
    let v = Object.prototype.hasOwnProperty.call(scope, head) ? scope[head] : values[head]
    for (const part of rest) {
      if (v == null || typeof v !== 'object') return undefined
      v = v[part]
    }
    return v
  }

  let out = html
  let loops = 0
  let guard = 0
  for (;;) {
    if (guard++ > 64) break
    const open = /<sc-for\b([^>]*)>/.exec(out)
    if (!open) break
    const close = matchingClose(out, 'sc-for', open.index + open[0].length)
    if (!close) break

    const listKey = /list="\{\{\s*([\w.]+)\s*\}\}"/.exec(open[1])?.[1] ?? ''
    const alias = /\bas="([\w-]+)"/.exec(open[1])?.[1] ?? 'item'
    const body = out.slice(open.index + open[0].length, close.start)
    const list = Array.isArray(values[listKey]) ? values[listKey] : []

    const expanded = list.map((item) => substitute(body, resolveWith({ [alias]: item }))).join('')
    out = out.slice(0, open.index) + expanded + out.slice(close.end)
    loops++
  }

  // Page-level values, after the loops so a loop body's own alias wins.
  out = substitute(out, resolveWith({}))
  return { html: out, loops }
}
