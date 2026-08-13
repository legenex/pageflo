/**
 * Resolve a ported template's colour declaration to an opaque hex.
 *
 * The twelve write every colour as `var(--lp-nNNN, #originalhex)`, which is what
 * makes them render as the reference with no variables set and recolour to a
 * brand when they are. That form is perfect for CSS and useless to anything that
 * has to REASON about the colour — and one thing does: the quiz mounted inside a
 * landing page derives its own text colours against the surface it sits on, and
 * a surface it cannot read is a surface it cannot check.
 *
 * So this is the small bridge. Given the variables the wrapper actually sets, it
 * answers what a declaration will paint as. It is not a CSS parser: it handles
 * the two forms the generated templates contain — a bare hex, and a `var()` with
 * a hex fallback, nested one level because `var(--a, var(--b, #hex))` is
 * expressible even though the extractor does not currently emit it.
 *
 * An unresolvable declaration returns null rather than a guess. A caller that
 * gets null must fall back to something it knows is opaque; inventing white here
 * would put white-on-white one bad brand away, which is the failure the colour
 * system exists to make unreachable.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Split `var(--name, fallback)` into its parts, respecting nested parentheses. */
const splitVar = (decl: string): { name: string; fallback: string } | null => {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(decl.trim())
  if (!m) return null
  return { name: m[1], fallback: (m[2] ?? '').trim() }
}

/**
 * The colour a declaration paints as, given the variables in scope.
 *
 * `depth` bounds the recursion so a variable table that points at itself cannot
 * hang a render. Four levels is more nesting than any generated template has and
 * far less than a loop needs.
 */
export const resolveCssColor = (
  declaration: string | null | undefined,
  vars: Record<string, string> = {},
  depth = 4,
): string | null => {
  const decl = (declaration ?? '').trim()
  if (!decl || depth < 0) return null
  if (HEX.test(decl)) return decl.toLowerCase()

  const v = splitVar(decl)
  if (!v) return null

  const set = vars[v.name]
  if (set) {
    const resolved = resolveCssColor(set, vars, depth - 1)
    if (resolved) return resolved
  }
  return resolveCssColor(v.fallback, vars, depth - 1)
}
