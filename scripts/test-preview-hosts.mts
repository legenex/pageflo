import {
  classifyHost,
  isPreviewHost,
  previewAliasHosts,
  previewHostForSlug,
  previewRoot,
  previewRoots,
} from '../src/lib/pageflo/hosts.ts'
import { brandServesOnHost } from '../src/lib/site-visibility.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

delete process.env.PAGEFLO_PREVIEW_DOMAIN
delete process.env.PAGEFLO_LEGACY_PREVIEW_DOMAIN
delete process.env.LEGALOS_PREVIEW_DOMAIN
process.env.PAGEFLO_APP_HOST = 'app.pageflo.io'
process.env.PAGEFLO_MARKETING_HOST = 'pageflo.io'
process.env.PAGEFLO_LEGACY_APP_HOSTS = 'os.legenex.com'
process.env.PAGEFLO_LEGACY_HOST_REDIRECT = 'false'

t(previewRoot() === 'preview.pageflo.io', 'canonical preview root defaults to preview.pageflo.io')
t(previewRoots().includes('preview.legenex.com'), 'legacy preview.legenex.com remains in the preview suffix set')
t(previewHostForSlug('acme') === 'acme.preview.pageflo.io', 'new Brands mint a PageFlo preview host')
t(isPreviewHost('acme.preview.pageflo.io'), 'PageFlo preview hosts classify as preview')
t(isPreviewHost('acme.preview.legenex.com'), 'legacy preview hosts still classify as preview')
t(
  previewAliasHosts('acme.preview.pageflo.io').includes('acme.preview.legenex.com'),
  'PageFlo preview aliases to the legacy suffix',
)
t(
  previewAliasHosts('acme.preview.legenex.com').includes('acme.preview.pageflo.io'),
  'legacy preview aliases to the PageFlo suffix',
)
t(previewAliasHosts('app.pageflo.io').length === 0, 'the app host is not a preview alias')
t(classifyHost('app.pageflo.io') === 'app', 'app.pageflo.io is reserved as the application host')
t(classifyHost('os.legenex.com') === 'legacy-app', 'os.legenex.com remains the legacy application host')
t(classifyHost('acme.preview.pageflo.io') === 'tenant', 'preview hosts resolve as tenants, not reserved console hosts')
t(classifyHost('pageflo.io') === 'marketing', 'pageflo.io is the marketing host')

t(brandServesOnHost('active', 'claims.example.com') === true, 'an active Brand serves on a custom host')
t(brandServesOnHost('draft', 'acme.preview.pageflo.io') === true, 'a draft Brand serves on its PageFlo preview host')
t(brandServesOnHost('draft', 'acme.preview.legenex.com') === true, 'a draft Brand serves on the legacy preview host')
t(brandServesOnHost('paused', 'acme.preview.pageflo.io') === true, 'a paused Brand is still previewable')
t(brandServesOnHost('draft', 'claims.example.com') === false, 'a draft Brand does not serve on a custom domain')
t(brandServesOnHost('paused', 'claims.example.com') === false, 'a paused Brand does not serve on a custom domain')
t(brandServesOnHost('archived', 'acme.preview.pageflo.io') === false, 'an archived Brand never serves')
t(brandServesOnHost('active', 'acme.preview.pageflo.io') === true, 'an active Brand still serves on preview')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
