import { mapWordpressPages, wordpressRestUrl } from '../src/lib/site-builder/wordpress-import.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

t(wordpressRestUrl('https://example.com/blog').includes('/wp-json/wp/v2/pages'), 'REST URL uses wp-json pages')
t(!wordpressRestUrl('https://example.com').includes('example.com/blog'), 'REST URL is origin-scoped')

const mapped = mapWordpressPages([
  {
    slug: 'about',
    title: { rendered: 'About <em>Us</em>' },
    content: { rendered: '<p>Hello from WordPress</p>' },
  },
  { slug: 'empty', title: { rendered: 'Empty' }, content: { rendered: '   ' } },
])
t(mapped.length === 1, 'empty WP pages are skipped')
t(mapped[0]?.title === 'About Us', 'title HTML is stripped')
t(mapped[0]?.slug === '/about', 'slug is a site path')
t(mapped[0]?.status === 'draft', 'imported WP pages land as drafts, not live')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
