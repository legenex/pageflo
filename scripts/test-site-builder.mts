import {
  addSection,
  deleteSection,
  hideSection,
  popUndo,
  pushUndo,
  reorderSection,
  resolvePublicBlocks,
  showSection,
  type WebsiteSection,
} from '../src/lib/site-builder/sections.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const a: WebsiteSection = { id: 'a', blockType: 'hero' }
const b: WebsiteSection = { id: 'b', blockType: 'prose' }
const c: WebsiteSection = { id: 'c', blockType: 'cta' }

const added = addSection([a, c], b, 1)
t(added.map((s) => s.id).join('') === 'abc', 'addSection inserts at index')

const moved = reorderSection([a, b, c], 2, 0)
t(moved.map((s) => s.id).join('') === 'cab', 'reorderSection moves a section')

const removed = deleteSection([a, b, c], 'b')
t(removed.map((s) => s.id).join('') === 'ac', 'deleteSection removes by id')

const hidden = hideSection(['a'], 'b')
t(hidden.includes('a') && hidden.includes('b'), 'hideSection appends')
t(showSection(hidden, 'a').join('') === 'b', 'showSection removes')

const stack = pushUndo([], { sections: [a], hidden: [] })
const popped = popUndo(stack)
t(popped.snapshot?.sections[0]?.id === 'a', 'undo stack restores the last snapshot')
t(popped.stack.length === 0, 'popUndo shortens the stack')

t(
  JSON.stringify(resolvePublicBlocks({ status: 'published', body_blocks: [a], published_blocks: [b] })) === JSON.stringify([b]),
  'public render prefers published_blocks',
)
t(
  JSON.stringify(resolvePublicBlocks({ status: 'published', body_blocks: [a] })) === JSON.stringify([a]),
  'legacy published pages without a snapshot still serve body_blocks',
)
t(
  JSON.stringify(resolvePublicBlocks({ status: 'draft', body_blocks: [a], published_blocks: [] })) === JSON.stringify([]),
  'empty published snapshot stays empty rather than falling back',
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
