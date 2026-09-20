export type WebsiteSection = { id: string } & Record<string, unknown>

export const addSection = (
  sections: WebsiteSection[],
  section: WebsiteSection,
  at?: number,
): WebsiteSection[] => {
  const next = [...sections]
  const index = at == null ? next.length : Math.max(0, Math.min(at, next.length))
  next.splice(index, 0, section)
  return next
}

export const reorderSection = (sections: WebsiteSection[], from: number, to: number): WebsiteSection[] => {
  if (from < 0 || from >= sections.length || to < 0 || to >= sections.length || from === to) {
    return [...sections]
  }
  const next = [...sections]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export const deleteSection = (sections: WebsiteSection[], id: string): WebsiteSection[] =>
  sections.filter((section) => section.id !== id)

export const hideSection = (hidden: string[], id: string): string[] =>
  hidden.includes(id) ? [...hidden] : [...hidden, id]

export const showSection = (hidden: string[], id: string): string[] =>
  hidden.filter((entry) => entry !== id)

export type SectionSnapshot = {
  sections: WebsiteSection[]
  hidden: string[]
}

export const pushUndo = (stack: SectionSnapshot[], snapshot: SectionSnapshot, limit = 50): SectionSnapshot[] =>
  [...stack, snapshot].slice(-limit)

export const popUndo = (stack: SectionSnapshot[]): { stack: SectionSnapshot[]; snapshot: SectionSnapshot | null } => {
  if (stack.length === 0) return { stack: [], snapshot: null }
  const next = stack.slice(0, -1)
  return { stack: next, snapshot: stack[stack.length - 1] }
}

export const resolvePublicBlocks = (page: {
  status?: string
  body_blocks?: unknown
  published_blocks?: unknown
}): unknown[] => {
  const live = page.published_blocks
  if (Array.isArray(live)) return live
  return Array.isArray(page.body_blocks) ? page.body_blocks : []
}
