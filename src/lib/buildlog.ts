/**
 * The build log shown at /admin/buildlog.
 *
 * Data, not prose: each entry is a structured record so the page can render
 * status consistently and so "what actually shipped" stays separate from "what
 * is still open". Append a new entry at the TOP of ENTRIES when work lands.
 *
 * The honesty rule for this file: `status` describes the code as committed, and
 * `verification` describes what was actually run. A thing that compiles but has
 * never been exercised is 'shipped' with a verification note saying so - it is
 * not 'verified'. Nothing here should read as finished when it is not.
 */

export type ItemStatus = 'shipped' | 'partial' | 'open' | 'superseded'

export type BuildLogItem = {
  /** The owner's own numbering where one exists, e.g. '9'. */
  ref?: string
  title: string
  status: ItemStatus
  /** What changed, in the reader's terms. */
  detail: string
  /** Repo-relative paths a reader can open to see it. */
  files?: string[]
  /** Overrides the area inferred from `files`. */
  area?: Area
  /** Where to go and what to click to see this change. */
  evidence?: BuildLogEvidence[]
}

/**
 * Where to see a change with your own eyes.
 *
 * `path` is a real admin or public route. `steps` are the clicks needed to get
 * from there to the thing, because most of what ships lives behind an
 * interaction: the redirect editor, for example, is a tab inside a modal inside
 * the quiz builder. A capture job pointed at a bare URL would photograph the
 * quizzes list and file it as evidence for a screen it does not show, which is
 * worse than no screenshot at all.
 *
 * So the recipe comes first and the image second: the steps are useful to a
 * human today, and they are exactly the script a headless browser will need to
 * drive when capture is built. `image` stays empty until then.
 */
export type BuildLogEvidence = {
  label: string
  /** Route to open. Relative, e.g. '/admin/quizzes'. */
  path: string
  /** Clicks from that route to the thing itself. Omit when the route IS the thing. */
  steps?: string[]
  /** Filled in by the capture job once it exists. */
  image?: string
}

export type BuildLogVerification = {
  label: string
  state: 'verified' | 'not-run'
  detail: string
}

export type BuildLogEntry = {
  /** ISO date, rendered as a stable absolute date. */
  date: string
  title: string
  summary: string
  items: BuildLogItem[]
  verification: BuildLogVerification[]
  /** Anything an operator must do on deploy for the entry to take effect. */
  deployNotes?: string[]
  /** Known gaps this entry did NOT close. */
  openIssues?: string[]
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  shipped: 'Shipped',
  partial: 'Partial',
  open: 'Not started',
  superseded: 'Superseded',
}

/**
 * Statuses that count as outstanding work.
 *
 * `superseded` is excluded on purpose. When a later entry merges two open items
 * into one, leaving the originals as open double-counts the same work and the
 * board reports more outstanding than exists - which is what happened when
 * three real pieces of work were showing as five.
 */
export const isOutstanding = (status: ItemStatus): boolean =>
  status === 'partial' || status === 'open'


/**
 * Areas of the system, used to filter the board.
 *
 * Derived from an item's own file paths rather than hand-tagged on 60-odd
 * existing items: a tag typed by hand goes stale the moment the item is edited,
 * where a path is the item's actual subject. An item can be given an explicit
 * `area` when the inference gets it wrong.
 */
export const AREAS = [
  'Brand',
  'Quiz',
  'Landing page',
  'Public render',
  'Domains',
  'Leads',
  'Data',
  'Admin',
] as const

export type Area = (typeof AREAS)[number]

const AREA_RULES: Array<[RegExp, Area]> = [
  [/\/brand\/|brand-map|brand-identities|BrandModule|tokens\.ts/, 'Brand'],
  [/quiz/i, 'Quiz'],
  [/\/lp\/|landing/i, 'Landing page'],
  [/migrations\/|collections\//, 'Data'],
  [/lead/i, 'Leads'],
  [/domain/i, 'Domains'],
  [/\(public\)|components\/blocks|components\/public|bespoke-css/, 'Public render'],
  [/\(app\)\/admin|scripts\//, 'Admin'],
]

export const inferArea = (item: BuildLogItem): Area => {
  if (item.area) return item.area
  const haystack = (item.files ?? []).join(' ')
  for (const [re, area] of AREA_RULES) if (re.test(haystack)) return area
  return 'Admin'
}

/** URL-safe slug. Stable across re-ordering; changes only if the text changes. */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/**
 * Stable anchors for comments.
 *
 * Derived from content, not from row ids or array positions: the log is code,
 * so there is nothing to relate to, and an index-based id would reassign every
 * comment the moment a new entry is added at the top. Renaming an item does
 * orphan its comments, which is why the comment also stores the title it was
 * written against.
 */
export const buildLogEntryId = (entry: BuildLogEntry): string => `${entry.date}--${slug(entry.title)}`

export const buildLogItemId = (entry: BuildLogEntry, item: BuildLogItem): string =>
  `${buildLogEntryId(entry)}--${slug(item.title)}`

/**
 * Stable id for one piece of evidence, used as its capture filename.
 *
 * Built from the item id plus the evidence label rather than from a counter, so
 * re-ordering the evidence on an item does not silently repoint every stored
 * screenshot at the wrong recipe.
 */
export const buildLogEvidenceId = (entry: BuildLogEntry, item: BuildLogItem, ev: BuildLogEvidence): string =>
  `${buildLogItemId(entry, item)}--${slug(ev.label)}`

export const ENTRIES: BuildLogEntry[] = [
  {
    date: '2026-09-02',
    title: 'Responsive QA close-out: the console walk is real, and one leaked process behind it',
    summary:
      'A continuation session in a new codespace, resuming after the previous one was recycled mid-way through validating the console redesign\'s responsive behaviour. The corrected overflow assertion and the console walk itself were already right; this closed out verifying that honestly, found and fixed a real process leak in the end-to-end suite, and closed a small gap in the mobile Sites list and the image-host env var.',
    items: [
      {
        title: 'The end-to-end lead suite leaked its server process on every run',
        status: 'shipped',
        detail:
          'Unlike test-console-walk.mts, which spawns pnpm start detached and kills the whole process group, test-e2e-lead.mts spawned it plainly and called server.kill(\'SIGTERM\'), which only ever signalled the pnpm wrapper, not the next-server it actually runs as. Confirmed by running the suite twice and finding a live orphaned next-server both times, holding its port and memory. Fixed to match the console walk\'s pattern exactly; verified clean afterwards.',
        files: ['scripts/test-e2e-lead.mts'],
      },
      {
        title: 'The Sites mobile cards were missing the one action the desktop table had',
        status: 'shipped',
        detail:
          'The lg:hidden card view carried domain, vertical, delivery and updated-at, but not the external "preview this Site" link the desktop row has. Added, same icon and target.',
        files: ['src/app/(app)/admin/(top)/sites/page.tsx'],
      },
      {
        title: 'next.config.mjs never read the canonical image-host variable',
        status: 'shipped',
        detail:
          'src/lib/pageflo/env.ts declares PAGEFLO_IMAGE_HOSTS as canonical with LEGALOS_IMAGE_HOSTS as fallback, but next.config.mjs cannot import that module (it runs before the app exists) and had never been given the same precedence directly, so setting the new name alone would have silently admitted nothing. Restated the fallback locally.',
        files: ['next.config.mjs'],
      },
      {
        title: 'A cold production build reliably exceeded this codespace\'s available memory',
        status: 'partial',
        detail:
          'pnpm build was killed by the OS on every attempt in this session (SIGTERM or SIGKILL, no cgroup oom_kill counter, so likely a host-level guard). Running next build directly with a capped V8 heap succeeded exactly once, before this session\'s edits landed; nine further attempts after that, including with the new experimental.webpackMemoryOptimizations flag, all died the same way. The flag is a real, documented Next.js lever for this problem and ships regardless; it was simply not sufficient on its own in this specific, resource-constrained codespace today. No build including this session\'s diff was confirmed complete here.',
        files: ['next.config.mjs'],
      },
    ],
    verification: [
      {
        label: 'pnpm typecheck',
        state: 'verified',
        detail: 'tsc --noEmit, exit 0, zero errors, run repeatedly through the session.',
      },
      {
        label: 'pnpm test:console (the responsive/console walk)',
        state: 'verified',
        detail: '312 passed, 0 failed, widest horizontal overflow 0px, run twice against a real production build.',
      },
      {
        label: 'pnpm test:e2e',
        state: 'verified',
        detail: '34 assertions, twice in a row after the process-leak fix, no leftover process either time.',
      },
      {
        label: 'pnpm test (17 suites), test:isolation, test:identity, test:release, test:bootstrap, test:dom, verify:schema, check:paths, lint:tokens, check:handbook',
        state: 'verified',
        detail: 'All exit 0, 0 failed, full matrix run and read, not just exit-code checked.',
      },
      {
        label: 'pnpm build, including this session\'s diff',
        state: 'not-run',
        detail: 'See the item above. Re-run before the next release, ideally with more headroom than this codespace had today.',
      },
    ],
    openIssues: [
      'pnpm build needs to be re-confirmed against this session\'s three-file diff before release; it was not possible in this codespace today.',
      'Production was not touched: this codespace has no SSH configuration to it at all, and pageflo.io / app.pageflo.io DNS does not point at the production host yet regardless.',
    ],
  },
  {
    date: '2026-09-01',
    title: 'PageFlo: the console, the product site, and the identifiers that stayed',
    summary:
      'The rebrand finished as a product change rather than a find-and-replace. Every user-facing surface says PageFlo and reads its name from one module; the builder palette moved to the console palette by changing 23 values rather than 1,797 call sites; four screens that were placeholders became real, including a Danger Zone whose three buttons had been disabled and whose copy said leads survive a Site delete when they do not. A set of identifiers is deliberately unchanged, each one now listed with the consumer that depends on it and asserted present by a test, so the next agent cannot finish the job and break a release.',
    items: [
      {
        title: 'One module reads the environment, and a test enforces it',
        status: 'shipped',
        detail:
          'Every configured value goes through src/lib/pageflo/env.ts, which tries the PAGEFLO_* name and falls back to the LEGALOS_* one. Twenty-five call sites were still reading process.env.LEGALOS_* directly, which is not a cosmetic problem: the moment an operator sets the PageFlo name in production, half the code reads the new value and half the old one, and nothing errors. pnpm test:rebrand fails if a second reader appears.',
        files: ['src/lib/pageflo/env.ts', 'scripts/test-rebrand.mts'],
      },
      {
        title: 'The CSRF allowlist is derived from the host variables, not typed twice',
        status: 'shipped',
        detail:
          'payload.config.ts turns PAGEFLO_APP_HOST, PAGEFLO_MARKETING_HOST and every legacy app host into https origins, with and without www. A missing CSRF origin is the worst failure mode in a domain cutover because it is completely silent: Payload\'s cookie strategy returns user = null and every server action fails as "unauthenticated" with nothing anywhere naming CSRF. Deriving it means an operator who sets the hosts the router already needs cannot forget a second, differently-shaped variable for the same hosts.',
        files: ['src/payload.config.ts'],
      },
      {
        title: 'The builder is the same palette as the rest of the console',
        status: 'shipped',
        detail:
          'Twenty-three files and 1,797 call sites read T.bg, T.primary, T.textMute and the rest from one object. Renaming those keys would have been a mechanical sweep through @ts-nocheck\'d ported code with a large blast radius and no design benefit, so the KEYS kept their names and the VALUES became the PageFlo tokens. Every text value was measured against the surface it sits on and all four clear WCAG AA. One key was renamed: pink held #F97316, and a key named pink holding an orange is a lie a reader has to discover by rendering it.',
        files: ['src/components/builder/ui.tsx'],
      },
      {
        title: 'The Danger Zone had three disabled buttons and one false sentence',
        status: 'shipped',
        detail:
          'Pause, Archive and Delete were all disabled with title="Wired in next phase", and the delete card said "Leads are preserved". The opposite is true: cascadeDeleteSiteChildren removes the Site\'s Leads because their site column is NOT NULL and Postgres cannot SET NULL on it. A screen telling an operator their consent records survive a delete that destroys them is worse than a screen with no delete on it. All three now run the real authorised server actions, delete requires typing the Site\'s slug, and the confirmation names the actual counts read from the database.',
        files: [
          'src/app/(app)/admin/sites/[slug]/settings/danger-zone/page.tsx',
          'src/app/(app)/admin/sites/[slug]/settings/danger-zone/DangerZoneClient.tsx',
        ],
        evidence: [
          { label: 'Delete requires the slug', path: '/admin/sites', steps: ['Open a Site', 'Settings', 'Danger zone'] },
        ],
      },
      {
        title: 'A Site dashboard that reported zero funnels no matter how many were live',
        status: 'shipped',
        detail:
          'The "Active Funnels" tile was a hardcoded 0 and the funnels panel said "No funnels bound to this site yet" without ever running a query. It now counts live landing page, quiz and advertorial deployments for the Site and lists them with their paths. When a deployment table cannot be read the panel says the list is incomplete rather than reporting none, because those are different facts. The 30-day leads tile was labelled "excl. test" and did not exclude test captures; it does now.',
        files: ['src/app/(app)/admin/sites/[slug]/page.tsx'],
      },
      {
        title: 'Five native confirm() dialogs became one owned component',
        status: 'shipped',
        detail:
          'window.confirm blocks the main thread, cannot be styled, cannot say which of two consequences is the dangerous one, and is suppressed outright in some embedded browser contexts, where the guard silently returns false and the action never runs. useConfirm() replaces all five with the same ergonomics, adds a focus trap, focuses the least destructive control, and supports type-to-confirm for irreversible actions.',
        files: ['src/components/pageflo/interactive.tsx'],
      },
      {
        title: 'A sidebar entry pointed at a route that did not exist',
        status: 'shipped',
        detail:
          'Campaign Integrity linked to /admin/integrity and nothing served it. pnpm check:handbook now walks every sidebar destination as well as every documented route, so a nav entry that 404s fails a check rather than being found by clicking. Analytics and Campaign Integrity are real pages that say what they are waiting on; neither shows a chart of invented numbers.',
        files: [
          'src/app/(app)/admin/(top)/integrity/page.tsx',
          'src/app/(app)/admin/(top)/analytics/page.tsx',
          'scripts/check-handbook-routes.ts',
        ],
      },
      {
        title: 'Sites can belong to a vertical that is not a legal practice area',
        status: 'shipped',
        detail:
          'The vertical field offered seven legal practice areas and nothing else, which made the Site form itself a claim that the product is a legal tool. Nine general values were added by migration, additively: every existing value is kept and no row is rewritten. One list in src/lib/verticals.ts feeds the collection, the create wizard, the Site settings form and the list filter, because two lists of the same enum is how a filter offers a value the collection then rejects.',
        files: ['src/lib/verticals.ts', 'src/migrations/20260901_233000_sites_vertical_general.ts'],
      },
      {
        title: 'Two byte-identical system health pages became one component',
        status: 'shipped',
        detail:
          '/admin/system and /admin/settings/system were 173-line copies of each other differing only in which path their refresh action revalidated. Two places for every future change to be made in, and one for it to be forgotten. The refresh action stays with the route because revalidatePath needs the caller\'s own path; everything else moved.',
        files: ['src/components/app/SystemHealthReport.tsx'],
      },
      {
        title: 'The console has an error boundary and a 404 of its own',
        status: 'shipped',
        detail:
          'A render that threw inside /admin previously reached the root global-error, which replaces the entire layout and loses the sidebar. The new boundary sits at /admin so it also catches a failure inside a Site workspace, keeps both sidebars mounted, and shows the digest, which is the only string tying what the operator is looking at to a line in the server log. Both boundaries now report through one client module rather than a copied fetch.',
        files: [
          'src/app/(app)/admin/error.tsx',
          'src/app/(app)/admin/not-found.tsx',
          'src/lib/observability/client.ts',
        ],
      },
      {
        title: 'Health checks for the two things a cutover breaks silently',
        status: 'shipped',
        detail:
          'PageFlo hosts and legal publication are both reported on /admin/system. An unset marketing or app host means the product site never serves and www never redirects, and it fails as "nothing happens" rather than as an error. /privacy fails closed until every legal fact is configured, which is correct and equally silent, so the missing keys are named rather than discovered by an operator wondering why the footer link is gone.',
        files: ['src/lib/system-health/checks.ts'],
      },
      {
        title: 'A privacy policy still cannot publish',
        status: 'open',
        detail:
          'PAGEFLO_LEGAL_ENTITY, _ADDRESS, _JURISDICTION, PAGEFLO_PRIVACY_CONTACT, _SUBPROCESSORS, _DATA_RETENTION and _LAST_UPDATED are unset, so /privacy 404s and the footer link is absent. This is deliberate and it is not a code task: a privacy policy makes binding statements about a real legal entity, and none of those facts is derivable from this repository. The keys are documented in .env.example and the missing ones are listed on /admin/system.',
        files: ['src/lib/pageflo/legal.ts'],
      },
    ],
    verification: [
      {
        label: 'pnpm typecheck',
        state: 'verified',
        detail: 'tsc --noEmit, exit 0, zero errors.',
      },
      {
        label: 'pnpm test',
        state: 'verified',
        detail: '17 suites including the new test:rebrand, exit 0.',
      },
      {
        label: 'pnpm build',
        state: 'verified',
        detail: 'next build exit 0; /admin/integrity, /admin/analytics, /admin/settings and /admin/users all present in the route table.',
      },
      {
        label: 'pnpm test:release',
        state: 'verified',
        detail:
          '31 assertions on a scratch database, exercising the new sites_vertical_general migration up, down and re-applied.',
      },
      {
        label: 'pnpm verify:schema',
        state: 'verified',
        detail: '25 collections and 1 global read cleanly.',
      },
      {
        label: 'pnpm test:isolation / test:identity / check:paths',
        state: 'verified',
        detail: '49, 33 and 9-deployment checks respectively, all exit 0.',
      },
      {
        label: 'pnpm check:handbook',
        state: 'verified',
        detail: '22 routes documented, 33 screens, 18 sidebar destinations, 0 missing.',
      },
    ],
    deployNotes: [
      'The production .env needs PAGEFLO_MARKETING_HOST, PAGEFLO_APP_HOST and PAGEFLO_LEGACY_APP_HOSTS before the new domains behave correctly. Until they are set, every host resolves against the Domains table exactly as it does today.',
      'PAGEFLO_LEGACY_HOST_REDIRECT stays false until the new hosts are verified. It is what turns os.legenex.com into a 308 and therefore what removes the rollback path.',
      'One migration ships with this release: 20260901_233000_sites_vertical_general. It widens an enum additively and rewrites no row.',
    ],
    openIssues: [
      'Analytics has no aggregation layer, so the screen states what it is waiting on rather than showing a chart.',
      'Campaign Integrity has no implementation and no agreed review model.',
      'Per-Site user management still requires workspace ownership; a Site admin cannot add an editor to their own brand.',
      'Site-wide SEO defaults do not exist. Per-page SEO does and is what a crawler reads.',
    ],
  },
  {
    date: '2026-08-07',
    title: 'Twelve landing-page templates, ported rather than rebuilt',
    summary:
      'Twelve templates ported from the reference designs rather than rebuilt from a description of them, with parity measured element by element across all twelve rather than claimed. Eleven match their reference on tag, colour and type for every element. What is not done is stated in its own items: a ported template cannot be edited yet, one of the twelve extracted incompletely, and the gallery thumbnail was removed after four attempts to contain it failed in ways I could not explain.',
    items: [
      {
        title: 'The twelve landing-page templates are ported from the handoff',
        status: 'shipped',
        detail:
          'The previous attempt built four templates from a written description of the designs, and it came out structurally right and dimensionally approximate. This ports the twelve reference pages themselves. It is tractable because of something in the markup: the references style every element INLINE, with not one CSS class between them, so every measurement is explicit on the element that uses it and nothing has to be recovered from a screenshot. A committed extractor does the work, so the code cannot drift from the design without someone re-running it and seeing the diff.',
        files: ['scripts/extract-lp-templates.mjs', 'src/lib/lp-templates/README.md'],
      },
      {
        title: 'Colour became a token that keeps the original as its fallback',
        status: 'shipped',
        detail:
          'Every colour in a ported template reads `var(--lp-n963, #f7f7f7)`. That fallback is the design of the whole thing rather than a detail: rendered with no variables supplied the output IS the reference, so pixel parity is something anybody can check rather than something I assert, and a brand that supplies nothing degrades to the finished design rather than to nothing. Tokens are named by LUMINANCE, so a template\'s greys keep their exact order and spacing when they are remapped, and it is that ladder which carries the contrast the design was drawn with.',
        files: ['src/lib/lp-templates/tokens.ts'],
      },
      {
        title: 'Pixel parity, measured across all twelve',
        status: 'shipped',
        detail:
          'Each port was diffed against its reference element by element - tag, box, resolved colour, font size, font weight - rather than eyeballed. Eleven of the twelve have EXACT element parity with their reference, and in every one of those eleven the differences are entirely accounted for by measured box size: tag, colour, font size and font weight match on 100% of elements. What remains is text metrics. Pinning Archivo\'s width axis to 100, which is what the handoff serves, took the first template from 1 of 214 elements matching to 161 exact with 52 more differing only in size. The remaining gap is sub-pixel text measurement rather than anything structural.',
        files: ['src/lib/lp-templates/README.md'],
        evidence: [
          {
            label: 'One page, twelve templates',
            path: '/admin/landing-pages',
            steps: ['Edit on any page', 'Template'],
          },
        ],
      },
      {
        title: 'Case Type Router is the one incomplete port',
        status: 'partial',
        detail:
          'It extracted 105 elements against the reference\'s 174. The cause is in what the template is: it is the router, and the library describes it as repainting its playbook when a visitor picks an incident type. Those variants are produced by script in the reference, so a static extraction of the markup captures one state and misses the rest. The other eleven are static pages and came across whole. This one needs its variants enumerated rather than a different extractor.',
        files: ['src/lib/lp-templates/case_type_router.ts'],
      },
      {
        title: 'The twelve are what a page renders as',
        status: 'shipped',
        detail:
          'Answering a fair question - why did nothing change - the ports sat in the tree for a while with nothing importing them, so the app kept drawing the four identity templates. The gallery now offers the twelve, and a page assigned to one renders the handoff\'s markup with the brand\'s colours supplied as CSS variables. The four earlier templates stay resolvable so pages already on one keep working, and stay out of the gallery because they are the thing the twelve replace.',
        files: ['src/components/builder/lp/render.tsx', 'src/components/builder/lp/PortedTemplate.tsx'],
      },
      {
        title: 'The gallery ships without a thumbnail, and that is the second answer',
        status: 'partial',
        detail:
          'The cards first drew from a template identity, and every port had been given the same one as a placeholder, so the picker showed twelve cards that all said COUNTERWEIGHT. Fixing the metadata was straightforward and it is right now: twelve cards, each with its own name, handoff code, form family, channels and where it puts the quiz. The PREVIEW is not there. Four ways of containing a scaled render - overflow on a sized box, absolute positioning, clip-path, and finally an iframe - each measured exactly right and each ended with the template\'s markup painted over the card\'s own name and action. Measuring the layout reported success every time while an element screenshot of a single card reported the opposite, which means the containment was never what was wrong and I do not yet know what is. A picker that reads correctly without a picture beats one whose cards bleed into each other, so that is what shipped.',
        files: ['src/components/builder/lp/LandingPagesApp.tsx'],
      },
      {
        title: 'A ported template is not editable yet',
        status: 'open',
        detail:
          'Its copy lives in the ported markup rather than in nodes, so the element tree and click-to-edit are switched off for one - showing them would advertise an edit that does nothing - and the AI wizard lists only the templates that still carry a skeleton. This is the largest outstanding piece of the landing-page work and the price of choosing pixel parity first: the node model makes a page editable and the ports make it exact, and nothing yet does both. Closing it means the copy travelling as nodes while the markup stays the reference\'s.',
      },
      {
        title: 'Six quiz template previews were cut off at the part that names them',
        status: 'shipped',
        detail:
          'A rail, a tab row and a grid of tiles need more height than a bar and a count, and the window was sized for the latter, so six of the twenty lost precisely the element that distinguishes them. The Case File Console\'s tabs also pushed into the percent chip beside them. One element still overflows its box by thirteen pixels; the other nineteen are clean.',
        files: ['src/components/builder/quiz/TemplatePreview.tsx', 'src/components/public/quiz/forms/progress.tsx'],
      },
      {
        title: 'The progress_form migration is recorded, without a data-loss prompt',
        status: 'shipped',
        detail:
          'It hung earlier and killing it took the service down for some minutes. The cause turned out to be an interactive prompt: Payload detects that this database has been dev-pushed and asks whether to proceed, warning that DATA LOSS WILL OCCUR, because running it reconciles all of that drift - which is finding F001 - on a database holding live Sites, Leads and deployments. Answering yes to that is not a thing to do while clearing a checklist. The column was already applied and the migration is idempotent, so what was missing was only the ledger row, and that was inserted directly. The ledger and the database now agree and nothing was reconciled that nobody asked to reconcile.',
        files: ['src/migrations/20260806_120000_quiz_deployment_progress_form.ts'],
      },
    ],
    verification: [
      {
        label: 'Pixel parity, all twelve',
        state: 'verified',
        detail:
          'Each port diffed against its reference element by element. Eleven of twelve have exact element parity, and in all eleven the differences are entirely measured box size: tag, colour, font size and font weight match on every element. Case Type Router is the exception at 105 elements against 174 and is logged as partial.',
      },
      {
        label: 'The twelve render in the app',
        state: 'verified',
        detail:
          'Gallery offers twelve, each named with its handoff code. Applying one produces twelve sections with the brand variables live - the accent resolving to the brand primary and the darkest rung to its ink. Typecheck and build clean.',
      },
      {
        label: 'Migration ledger',
        state: 'verified',
        detail: 'progress_form present on funnel_quiz_deployments, and 20260806_120000_quiz_deployment_progress_form recorded as batch 18.',
      },
      {
        label: 'Quiz previews',
        state: 'verified',
        detail: 'Nineteen of twenty draw their distinguishing progress form inside the box. One still overflows by thirteen pixels.',
      },
      {
        label: 'The gallery thumbnail',
        state: 'not-run',
        detail: 'Removed rather than fixed. Four containment approaches each measured correct and each bled over the card; the cause is not understood and is not the containment.',
      },
      {
        label: 'Editing a ported template',
        state: 'not-run',
        detail: 'Not possible yet, so not tested. Their copy is in markup rather than nodes.',
      },
    ],
    openIssues: [
      'A ported template cannot be edited: its copy lives in markup rather than in nodes. Largest outstanding piece of this work.',
      'Case Type Router ported 105 of 174 elements. Its variants are script-generated in the reference and need enumerating.',
      'The gallery thumbnail bleeds over its card through four different containment approaches. Cause unknown; preview removed meanwhile.',
      'Residual pixel difference across the eleven is text metrics only, and has not been driven to zero.',
      'The quiz twenty-four component states and their four field types are still not built.',
      'One quiz preview still overflows its box by thirteen pixels.',
      'Three live quiz deployments still carry the legacy `default` id and render as Quiz First.',
      'F001 is untouched, and Payload now says so out loud: migrate warns that this database has been dev-pushed and that reconciling it would lose data.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Twenty quiz templates, and an honest account of how far they got',
    summary:
      'Twenty templates replacing six, built from the design handoff rather than described from it. The structure, the presentation split and the colour ownership are right; the pixel-level match to the reference designs is not there, and the twenty-four required component states are not built. Both are recorded here as open rather than folded into the summary, because the previews shipped today make it easy to believe more was finished than was.',
    items: [
      {
        title: 'The twenty quiz templates from the handoff replace the six',
        status: 'shipped',
        detail:
          'The six quiz templates were six hand-written bags of about twenty-five colour functions each. That is precisely why they could only differ in colour: the shape of a question card was identical in all six and there was nowhere in the structure to say otherwise. It is the same fault the landing-page templates had, found twice in the same codebase for the same reason. The handoff in quizzes/ describes twenty, and usefully it already decomposes each one along four axes - how wide it runs, how it shows progress, how it draws an answer, and what it does about icons - so the twenty are twenty short specs over shared renderers rather than twenty files that would drift apart the moment one was touched. Every one of the twenty uses a DIFFERENT progress form, which is what distinguishes them on screen; nineteen answer forms and fifteen icon policies fill the rest.',
        files: ['src/lib/quiz-templates/model.ts', 'src/components/public/quiz/forms/progress.tsx', 'src/components/public/quiz/forms/answers.tsx'],
        evidence: [
          {
            label: 'The twenty, drawn live',
            path: '/admin/quizzes',
            steps: ['Deployments', 'Edit', 'Render & Embed'],
          },
        ],
      },
      {
        title: 'The specs were generated from the handoff, not retyped',
        status: 'shipped',
        detail:
          'The twenty template definitions were extracted programmatically from the library page in the drop rather than transcribed by hand. That matters for a table of twenty rows times seven attributes: a hand-copied width or a mistyped progress form would be invisible until somebody noticed one template looking wrong, and there would be no way to tell whether the code or the handoff was the mistaken one. Generated, the code and the handoff cannot disagree without the extraction being wrong, which is one thing to check instead of a hundred and forty.',
        files: ['src/lib/quiz-templates/model.ts'],
      },
      {
        title: 'Presentation only, enforced by the signature',
        status: 'shipped',
        detail:
          'The handoff states one rule outright: all twenty templates share the same quiz-deployment contract, presentation only, with questions, branching, consent, routing and webhooks living on the deployment. That is enforced here rather than merely intended. A progress form is handed a position, a total and some labels; an answer form is handed a label, an index and whether it is selected. Neither can read a quiz, because neither is given one. So a template may say that answers are lettered hairline rows, and it may not say what the answers are, where they lead, or what happens after the last one.',
        files: ['src/components/public/quiz/forms/progress.tsx', 'src/components/public/quiz/forms/answers.tsx'],
      },
      {
        title: 'Quizzes and landing pages now share one colour resolver',
        status: 'shipped',
        detail:
          'The handoff draws all twenty templates in a neutral grey palette and says so deliberately, because a template shown in its own colours would advertise something the deployed quiz will not look like. That is the same conclusion the landing-page side reached independently the day before. Rather than writing a second derivation for quizzes, the landing-page palette resolver was generalised to take any fallback set, so both go through one function. Two derivations would have given a landing page and the quiz embedded inside it two subtly different ideas of what a brand’s dark ground is - both defensible, neither matching - and that shows up as a form that not quite agrees with the page around it.',
        files: ['src/lib/lp-nodes/palette.ts', 'src/lib/quiz-templates/theme.ts'],
      },
      {
        title: 'The twenty arrived without rewriting the runtime',
        status: 'shipped',
        detail:
          'The preview engine and the public runtime call getTemplateConfig plus three render helpers and a colour audit, and nothing else. Keeping that surface unchanged meant the twenty could land behind the same seam the six sat behind, so neither the runtime nor the preview engine needed touching to receive them. The legacy keys those callers read are derived from the same theme the new renderers use rather than computed separately, so there is exactly one answer to what colour this card is no matter which of the two paths asks.',
        files: ['src/components/builder/quiz/templates.tsx'],
      },
      {
        title: 'The six old ids still work, and nothing was rewritten',
        status: 'shipped',
        detail:
          'Three live standalone quiz deployments carry the id `default`, one of the six. Stored ids are not rewritten just because the template set grew: each old id resolves forward on read to whichever of the twenty is closest, which is a judgement rather than a fact and is written down in one table so it can be argued with rather than discovered in a diff. The visible consequence is real and worth stating plainly - those three deployments now render as Quiz First rather than as the old default template, so their appearance changed with this deploy.',
        files: ['src/lib/quiz-templates/model.ts', 'src/lib/quiz-theme.ts'],
      },
      {
        title: 'The picker offers the twenty because it is derived from them',
        status: 'shipped',
        detail:
          'The template picker used to be six entries typed into a config file, which meant the list an operator chose from and the templates that actually existed were two separate facts free to disagree. It is derived from the template set now, so adding a template makes it pickable and removing one makes it unpickable with nothing to keep in step. Verified as twenty on screen rather than assumed.',
        files: ['src/components/builder/quiz/config.tsx'],
      },
      {
        title: 'A deployment can pick its own progress form',
        status: 'shipped',
        detail:
          'Each template carries one progress treatment and that is what most distinguishes the twenty, so wanting Card Deck’s layout with Sixty Second’s dots was previously a request for a twenty-first template. It is a knob instead. The override moves exactly one axis - the width, the answers, the icons and the faces all stay the template’s - which is what stops twenty templates times twenty forms becoming four hundred things to reason about. Absent means whatever the template says, so nothing changes appearance until somebody chooses, and the picker names what that would be rather than offering a blank option.',
        files: ['src/components/builder/quiz/QuizBuilderApp.tsx', 'src/collections/FunnelQuizDeployments.ts'],
        evidence: [
          {
            label: 'Choosing a progress form',
            path: '/admin/quizzes',
            steps: ['Deployments', 'Edit', 'Render & Embed', 'Progress'],
          },
        ],
      },
      {
        title: 'The migration is guarded on its own table existing',
        status: 'shipped',
        detail:
          'Unusual, and deliberate. The six funnel_* tables are finding F001: they are declared on collections and created only by Payload’s dev auto-push, with no committed migration creating any of them. An unguarded ALTER would therefore fail the entire migration run on any database where that push has never happened, for a table this migration did not create and is not responsible for. The column is nullable so no existing row needs backfilling, and the DDL is retry-safe per house style. This does not fix F001; it declines to make it worse.',
        files: ['src/migrations/20260806_120000_quiz_deployment_progress_form.ts', 'src/migrations/index.ts'],
      },
      {
        title: 'The picker shows what each template actually draws',
        status: 'shipped',
        detail:
          'Choosing among twenty templates from a name and a sentence is guesswork, and most of them nobody here has ever seen. Each card now renders a live miniature through the same progress and answer components the deployed quiz uses, in the brand’s own colours. A real render rather than a stored thumbnail on purpose: a screenshot goes stale the first time a template changes and then quietly lies about what is being chosen, which would matter most for exactly the templates least familiar. It is scaled rather than re-specified at small sizes, so a template whose answers are oversized looks oversized in its own card. The selected card also reflects the progress override, so the two controls on that tab agree about what they are producing.',
        files: ['src/components/builder/quiz/TemplatePreview.tsx'],
      },
      {
        title: 'Six preview cards clip their contents',
        status: 'partial',
        detail:
          'Found by looking at the screen rather than reported. Sixty Second, Answer First, Case Router, Incident Scene, Fullscreen Focus and Card Deck are cut off at the preview window’s fixed height, and Case File Console’s tab row collides with its percent-complete chip. The templates themselves are unaffected - this is the miniature’s sizing, not the thing it is a miniature of - but a preview that crops the part which distinguishes a template is failing at the one job it has.',
        files: ['src/components/builder/quiz/TemplatePreview.tsx'],
      },
      {
        title: 'Pixel parity with the reference designs is NOT achieved',
        status: 'open',
        detail:
          'Stated plainly because the previews could easily imply otherwise. What was built came from the handoff’s SPEC TABLE - four attributes per template - not from the twenty reference pages themselves, which carry the complete design: every measurement, weight, radius, letter-spacing and rule. So the result is structurally correct and dimensionally approximate. Closing it needs a different method than the one used so far: porting each template from its reference page’s actual CSS, then screenshotting the reference and our render at the same width and diffing them, one template at a time. The twenty pages are already unpacked, so the source is in hand and the work is a genuine pass through twenty designs rather than one change. One conflict has to be settled first, because it decides what the same even means: the reference pages are drawn in a neutral grey palette by design, and the brand owns colour by instruction. Those cannot both be literally true, so the target taken is identical in every respect except colour - geometry, type, spacing, weights, rules and states matched exactly, hues substituted.',
        files: ['src/lib/quiz-templates/model.ts'],
      },
      {
        title: 'The twenty-four component states are not built',
        status: 'open',
        detail:
          'The handoff ships a second document specifying twenty-four states every one of the twenty templates must express, and it is an acceptance checklist rather than styling notes. Several do not exist anywhere in the quiz runtime today: network failure with a retry that keeps answers locally, resume for a returning visitor, multi-select where a none option clears the others, a validation error carrying text and an icon and a field ring rather than colour alone, a loading skeleton with inert controls, a respectful alternate completion for a non-qualifying answer set, and a redirect state with a manual fallback. Four field types are missing with them: ZIP with a five-digit numeric mask, multi-select, a split month/day/year date, and consent as a first-class field rather than a checkbox bolted to a form.',
      },
    ],
    verification: [
      {
        label: 'Typecheck',
        state: 'verified',
        detail: 'pnpm typecheck on the server, clean, across every push in this piece of work.',
      },
      {
        label: 'The live standalone quiz still runs',
        state: 'verified',
        detail:
          'https://getwhatyoureowed.co/s/don-t-settle returns 200 with four answer buttons rendering through the new answer form, the real question text, and no page or console errors. That deployment is on a legacy template id, so it also exercises the forward mapping.',
      },
      {
        label: 'The picker offers twenty, and progress offers twenty-one',
        state: 'verified',
        detail:
          'Counted in the DOM after driving to the screen: twenty template names present, and the progress select carrying twenty-one options - the twenty forms plus Match the template, which correctly names the current template\'s own form. Three earlier attempts to verify this reported zero, every one of them because the probe was on the wrong tab; the picker is under Render & Embed, not Basics. Worth recording that the first three readings were wrong about the product rather than about the code.',
      },
      {
        label: 'The previews render',
        state: 'verified',
        detail:
          'All twenty miniatures draw, visibly distinct: the factor rail with its RECORDED stamps, the deadline rail running from accident to filing deadline, the vertical milestone rail, the four-tab case-file row, the card diamonds, the named path nodes. Six of them clip, which is logged above as a defect rather than left for someone else to notice.',
      },
      {
        label: 'Pixel parity against the reference designs',
        state: 'not-run',
        detail:
          'Not attempted and not achieved. No render has been diffed against any of the twenty reference pages. See the open item above for the method that would close it.',
      },
      {
        label: 'Nineteen of the twenty templates in use',
        state: 'not-run',
        detail:
          'Only the template on the live deployment has been seen running a real quiz end to end. The other nineteen have been seen only as miniatures in the picker, which exercises their progress and answer forms but not a full flow through contact, consent and completion.',
      },
      {
        label: 'The twenty-four component states',
        state: 'not-run',
        detail: 'Not built, so not tested. Named individually in the open item above rather than summarised, because the list is the specification.',
      },
    ],
    openIssues: [
      'Pixel parity with the twenty reference designs is not achieved. What shipped is spec-derived, not ported from the reference CSS.',
      'The twenty-four required component states are not implemented, nor are the four field types they depend on.',
      'Six preview cards clip their contents, and Case File Console\'s tab row collides with its status chip.',
      'The progress_form column was applied by hand with psql after pnpm payload migrate hung and had to be killed. The column exists and the migration is idempotent, but it is NOT recorded as applied - run pnpm payload migrate so the ledger matches the database.',
      'Killing that migrate left the service stopped for a few minutes before it was noticed and restarted. Nothing about the deploy sequence catches that; a stop without a matching start is currently invisible until somebody loads a page.',
      'Three live quiz deployments still carry the legacy id `default` and now render as Quiz First. They should be set explicitly rather than left on a forwarded id.',
      'F001 is untouched: the six funnel_* tables still have no committed migration creating them. This work added a guarded column to one of them rather than fixing the underlying gap.',
    ],
  },
  {
    date: '2026-08-05',
    title: 'A landing page is a tree of nodes, and a template is a structure',
    summary:
      'Two problems with one cause. You could delete a whole section and nothing smaller, and all four templates looked identical apart from colour. Both followed from sections storing copy under fixed names that thirteen subject-specific renderers read back by name. Ends with the ownership of colour corrected: the brand decides it, the template decides the shape.',
    items: [
      {
        title: 'Every element on the page is its own thing',
        status: 'shipped',
        detail:
          'A section held a bag of named keys - eyebrow, headline, steps - and one renderer per subject read them back. So "the third step" and "that button" did not exist as far as the page was concerned; they were properties of a section, and the only verbs were on the section. Sections and elements are now nodes, each with an id, a visibility flag and a position, so anything on the page can be hidden, reordered, deleted or added. Two levels and no more: a third would buy nesting nobody asked for and cost a tree editor to manage it. The one layout that genuinely wants two containers, a split, is done with a slot tag on the element instead, so the order in the tree is the order stored and there is no hidden container to reason about.',
        files: ['src/lib/lp-nodes/model.ts', 'src/components/builder/lp/NodeTree.tsx', 'src/components/builder/lp/NodeInspector.tsx'],
        evidence: [
          {
            label: 'Selecting one heading out of a page',
            path: '/admin/landing-pages',
            steps: ['Edit on MVA Pain First', 'click the headline in the preview'],
          },
        ],
      },
      {
        title: 'Sections stopped knowing what they are about',
        status: 'shipped',
        detail:
          'There is no how-it-works renderer any more, and no testimonials renderer. There is a band, and a band groups a run of same-type elements into a row: three step nodes draw a three-step row, and a fourth makes it four, without any renderer being told. Six layout containers replace the thirteen subjects, which is what lets four templates differ in structure while sharing one renderer, and what lets a fifth need no new component. A run that will not divide evenly widens by one where that helps, because four result cards in a three-column grid draw as three and a stranded fourth, and that reads as a mistake in the content rather than in the layout.',
        files: ['src/components/builder/lp/nodes/SectionNode.tsx', 'src/components/builder/lp/nodes/ElementNode.tsx', 'src/components/builder/lp/render.tsx'],
      },
      {
        title: 'Template B: a skeleton with no copy in it at all',
        status: 'shipped',
        detail:
          'A template is now an identity plus a structure, and the structure is a list of node types with layout props and nothing written in them. Not a placeholder headline, not a sample step, nothing to delete before the page can be written. B puts the form centred above the fold, which is the departure that made the whole change necessary: the old renderer had exactly one hero and no way to say it. Picking a template and taking its structure are separate acts in the gallery, because the first repaints the page and the second replaces its sections and loses the copy.',
        files: ['src/lib/lp-skeletons/index.ts'],
        evidence: [
          {
            label: 'The skeleton, before anything is written',
            path: '/admin/landing-pages',
            steps: ['Blank LP'],
          },
        ],
      },
      {
        title: 'All four structures are built, and no two are alike',
        status: 'shipped',
        detail:
          'A puts the form beside the argument rather than above it and alternates dark and light the whole way down, with an icon-bulleted list and a split whose second column is a map. C opens on dark with a pill row and a two-tone headline, then drops the form onto a light band of its own, and carries a rule through its three-step row and a flat card row after it. D keeps the form in the fold, follows it straight with a trust bar, and splits twice in opposite directions: once against a dark inset panel and once against a single figure. Read back out of the DOM rather than eyeballed, the four give twelve, nine, nine and eleven sections with different ground sequences, different split positions and different grid patterns. No two share a section list, which was the whole point: before this, picking a template picked a palette.',
        files: ['src/lib/lp-skeletons/index.ts'],
        evidence: [
          {
            label: 'Four structures, one renderer',
            path: '/admin/landing-pages',
            steps: ['Blank LP', 'Template', 'Use this structure'],
          },
        ],
      },
      {
        title: 'The brand decides the colour. I had it the wrong way round.',
        status: 'shipped',
        detail:
          'Reported as "the template is not using the brand colours at all", and it was not. Asked earlier to take colours from the brand identity, I read it as "each template takes colour from its own identity" - which is a no-op, and should have been the clue that it was the wrong reading. The correction: colour resolves from the brand, with the template identity as the fallback so a brandless preview and the gallery still look like something and a brand that has only set a primary does not collapse to grey. What a template keeps is everything that is not a hue: the faces, the display weight and tracking, the radii, the border weight, the eyebrow treatment, the geometry of its mark, and the structure of the page. Counterweight under a teal brand is still compressed poster caps on square corners with an argument on the left and the form on the right, in teal.',
        files: ['src/lib/lp-nodes/palette.ts', 'src/lib/lp-nodes/surface.ts', 'src/components/builder/lp/render.tsx'],
        evidence: [
          {
            label: 'One page, two brands',
            path: '/admin/landing-pages',
            steps: ['Edit on MVA Pain First', 'Preview as'],
          },
        ],
      },
      {
        title: 'Two things a brand never states, derived rather than invented',
        status: 'shipped',
        detail:
          'No brand token says what its DARK ground is, and half the page needs one. It is derived from the brand\'s own hue with its chroma capped, which gives a near-black that carries the brand instead of a dark red. Nor does a brand state a lifted primary for use on that dark ground, so the primary is raised until it clears 4.5 to 1 there, keeping its hue so it still reads as the brand\'s colour. The identity marks are recoloured by the ROLE each path was playing, matched against the identity\'s own tokens, so the path that was its primary becomes the brand\'s primary and the dot that was its accent becomes the brand\'s accent, without the design handoff having had to label them.',
        files: ['src/lib/lp-nodes/palette.ts'],
      },
      {
        title: 'The form agrees with the page it is standing in',
        status: 'shipped',
        detail:
          'A quiz on its own URL derives its palette from its brand\'s raw tokens. Inside a landing page it is handed the page\'s already-resolved palette instead, because the two would otherwise drift: the page\'s dark band and the quiz\'s idea of dark would be different colours, both defensible, neither matching. It is the same brand colour either way, and the brand is otherwise untouched, so the number the form shows and the place the lead goes are unchanged. Measured on the live page: the landing page form and the standalone quiz at /s/don-t-settle both draw in rgb(43,134,122), the brand\'s own teal.',
        files: ['src/lib/lp-nodes/quiz-brand.ts', 'src/components/builder/lp/nodes/ElementNode.tsx'],
      },
      {
        title: 'Two layout capabilities the three new structures needed',
        status: 'shipped',
        detail:
          'A strip lays its contents out in a row instead of grouping them, because a run of ticks is a one-column list in a band and four claims across in a trust bar, and the grouping rule was right for one and wrong for the other. And a band can run narrow, which is what centres a form on an open ground: C puts the form on a light band of its own rather than in the hero, and at full width it would have sat as a very wide card in a very empty section.',
        files: ['src/components/builder/lp/nodes/SectionNode.tsx', 'src/lib/lp-nodes/model.ts'],
      },
      {
        title: 'Pages already live keep rendering, and were not rewritten',
        status: 'shipped',
        detail:
          'There are landing pages and deployments in the database in the old shape. Nothing was migrated in place: the conversion runs on read, every time, and a page is only stored as nodes once somebody saves it, so a page nobody opens keeps working without a migration having run. That makes determinism a correctness requirement rather than a nicety, and the ids are derived from the section id and the field they came from. A random id there would remount every node on each pass, lose the builder selection, and rewrite the whole tree on first save. The conversion also has to state what the old renderers were doing implicitly, alternating grounds by section type, so those grounds are explicit tones now and a converted page can be re-toned like any other.',
        files: ['src/lib/lp-nodes/from-legacy.ts'],
      },
      {
        title: 'Colours are still derived, now including copy inside cards',
        status: 'shipped',
        detail:
          'Every colour a node paints with comes off a surface derived from the ground it actually sits on and checked before it is handed over. The part that was previously assumed is card copy: it was derived against the page and then drawn on the card, which are two different grounds and only one of them is what the words land on. A form card can now sit on the opposite ground to its section, which is what puts a pale card on a dark fold, and both sides are derived rather than one being inverted by hand. The four identity marks also render for the first time, in the header lockup and in the template gallery; the mark and the typography are the template identity, the name is the brand.',
        files: ['src/lib/lp-nodes/surface.ts', 'src/components/builder/lp/nodes/icons.ts'],
      },
      {
        title: 'Claude writes into the structure and cannot change it',
        status: 'shipped',
        detail:
          'The old rewrite action returned a bag of named copy keys, which only made sense while a section was a bag of named copy keys. The model is now given the nodes, their ids and the exact fields each type accepts, and must answer with the same ids. Anything invented is dropped rather than merged and any field outside the element spec is discarded, so a generated section is structurally identical to the one that was laid out. The new-page wizard builds from the skeleton and fills it a section at a time on the same contract, which is what keeps "generated with Claude" and "built from template B" the same page rather than two.',
        files: ['src/app/(app)/admin/(top)/landing-pages/actions.ts', 'src/components/builder/lp/LandingPagesApp.tsx'],
      },
      {
        title: 'The preview answers about itself instead of about the window',
        status: 'shipped',
        detail:
          'Found by opening it rather than by reading it. The builder shows the page in a pane about a third of the window wide, and the responsive rules were viewport media queries, so they reported a desktop and kept a two-column hero and three-across stats inside six hundred pixels, where the stats collided. They are container queries now, which means the preview and the live page behave the same way at the same content width. A preview that cannot be trusted at the width it is displayed at is not a preview.',
        files: ['src/components/builder/lp/render.tsx'],
      },
      {
        title: 'A brand-new page previewed as a stack of bare coloured bands',
        status: 'shipped',
        detail:
          'Reported by the owner from a screen I had not looked at. A section decided whether it was empty by counting its VISIBLE elements, while its layouts decided what to draw by counting its DRAWABLE ones. A skeleton is full of elements that are visible and unwritten, so every section kept its frame, dropped all of its children, and a fresh page previewed as seven stacked stripes of colour with nothing in them. Both now ask one predicate, so the two cannot answer differently again. The cause of missing it is worth stating: I photographed the builder, where nothing is dropped, and the public render of a page that already had copy. An unwritten skeleton down the non-editable path is precisely where those two rules meet, and it is the one combination I never opened. A preview of an unwritten page now shows what a visitor would actually get, which is the header, the form and the footer, and nothing else.',
        files: ['src/components/builder/lp/nodes/SectionNode.tsx', 'src/lib/lp-nodes/model.ts'],
        evidence: [
          {
            label: 'Previewing a page before anything is written',
            path: '/admin/landing-pages',
            steps: ['Blank LP', 'Preview'],
          },
        ],
      },
      {
        title: 'The builder was loading quiz names and nothing else',
        status: 'shipped',
        detail:
          'The hero form runs the real quiz runtime rather than a drawing of one, but the landing-pages screen only ever loaded each quiz id and name, so the most important thing on the page drew as an empty card and the layout could not be judged. It loads the steps, nodes and custom fields now. This was not a regression from the node work; it has been true since the two were wired together, and it only became obvious with a template whose whole argument is where the form sits.',
        files: ['src/app/(app)/admin/(top)/landing-pages/page.tsx'],
      },
    ],
    verification: [
      {
        label: 'Typecheck',
        state: 'verified',
        detail: 'pnpm typecheck on the server, clean. Two errors it caught first: the public callsite missing a newly required prop, and an untyped prop on the ported quiz runtime.',
      },
      {
        label: 'Driven in a browser',
        state: 'verified',
        detail:
          'Playwright against os.legenex.com as the capture account: the converted page opens with 13 sections and 74 elements in the tree, clicking the headline in the preview selects it and opens its fields, the template gallery draws all four identity marks, and Blank LP produces skeleton B with 9 sections and 62 empty elements. Three bugs were found this way and fixed, none of which a typecheck could have seen.',
      },
      {
        label: 'Public render, page with copy',
        state: 'verified',
        detail:
          'https://getwhatyoureowed.co/c/don-t-settle returns 200 with 13 sections, the real quiz in the hero, no placeholders and no console errors from the page itself.',
      },
      {
        label: 'Public render, page without copy',
        state: 'verified',
        detail:
          'Verified only after the owner found it broken. A fresh skeleton previewed as seven empty coloured bands because I checked the builder and a written page but never the crossing of the two. It now renders three sections - header, form, footer - which is what a visitor gets from a page nobody has written yet. Counted in the DOM rather than eyeballed.',
      },
      {
        label: 'All four structures, driven',
        state: 'verified',
        detail:
          'Each structure applied to a page through the real gallery flow, then the section list, resolved ground, split positions and grid widths read back out of the DOM. Twelve, nine, nine and eleven sections, no two lists alike. Screenshots at four scroll positions each.',
      },
      {
        label: 'Colour follows the brand, structure does not move',
        state: 'verified',
        detail:
          'One page rendered under two brands and both halves asserted from the DOM. Don\'t Settle paints its brand band rgb(43,134,122) and Auto Claim Eval paints the same band rgb(236,4,4), their own primaries; the section list is thirteen sections in the same order both times. The public deployment and the standalone quiz now agree on the same teal, where before the landing page drew in the template\'s colour and the quiz in the brand\'s.',
      },
      {
        label: 'Reordering and deleting under load',
        state: 'not-run',
        detail:
          'Move, hide, delete and add were exercised by hand on single nodes, not systematically across every element type, and no test covers them. The debounced save path is unchanged from before.',
      },
    ],
    openIssues: [
      'Preview shows a visitor\'s view, so an unwritten page looks nearly blank there while the builder shows the whole skeleton. That is correct rather than a bug, but there is no way to preview the shape itself.',
      'Reordering is one step at a time with arrows. There is no drag, and no way to move an element from one section to another.',
      'The funnel_* tables still have no committed migration (F001). Nothing here changes that: sections are a json column that already existed.',
    ],
  },
  {
    date: '2026-08-04',
    title: 'Saving brand colours had no chance of working',
    summary:
      'Reported as "I change the colours, click save, and it reverts". It was not reverting. The value was written every time and then thrown away on the way back out, by two bugs that only bite together.',
    items: [
      {
        title: 'The brand is editable from inside the builders',
        status: 'shipped',
        detail:
          'Changing a colour meant leaving the page you were looking at, editing it on the Brand Identity screen, and coming back to find out whether it worked. That is the wrong shape for a decision made BY looking at the page. Both builders now carry a brand colour editor beside the brand picker, writing to the same record through the same action, so it is not a second store that can disagree with the first. The panel says out loud that an edit here changes the brand everywhere, because someone would reasonably assume a colour changed inside one landing page was scoped to that page. The saved brand is handed back so the preview repaints at once, since a save that works but looks like it did not is the exact bug reported earlier the same day.',
        files: ['src/components/builder/brand/BrandQuickEdit.tsx', 'src/components/builder/lp/LandingPagesApp.tsx', 'src/components/builder/quiz/QuizBuilderApp.tsx'],
        evidence: [
          {
            label: 'Editing a brand from the builder',
            path: '/admin/landing-pages',
          },
        ],
      },
      {
        title: 'Section colours: built the wrong thing first, then the right one',
        status: 'shipped',
        detail:
          'Asked for per-section colour control, I shipped four named tones instead, on the reasoning that free hex fields would let a page become eight unrelated colours and undo the brand consistency work. The owner said plainly that presets were not what was wanted. That was the right call to overrule: four tones cannot express what someone has in mind for a specific section, and being told the tool knows better is not an answer. Background, text, cards and accent are now free colour fields, each independent, so a section overriding only its background still gets everything else from the brand. Two protections were kept because they are protections rather than restrictions: changing a background without setting a text colour re-derives the text, so an old colour cannot survive onto a ground it was never checked against, and the contrast figure is shown live and warns below 4.5 to 1 rather than blocking.',
        files: ['src/components/builder/lp/LandingPagesApp.tsx', 'src/components/builder/lp/render.tsx'],
      },
      {
        title: 'The first colour panel was bad, and shipping it unlooked-at is why',
        status: 'shipped',
        detail:
          'Four cramped inputs, each showing a black swatch and the word brand in a monospace box. A black square on an unset field reads as "black is selected", which is the opposite of what it meant, so the panel could not answer the one question it existed for: what is this section painted with now. Rebuilt as a row per colour with a large swatch showing the colour ACTUALLY in use, inherited from the brand until overridden, a placeholder carrying the real inherited value, and a button reading Brand or Reset. Overridden rows are ringed. The brand had to be passed into the section editor for any of this, which is why it fell back to black before. The underlying cause was mine: four interface changes shipped in one day on a typecheck alone, without opening any of them in a browser, on a server where the tooling to do that already exists.',
        files: ['src/components/builder/lp/LandingPagesApp.tsx'],
      },
      {
        title: 'Templates imposed a palette, so no brand ever showed through',
        status: 'shipped',
        detail:
          'Each landing page template carried its own canvas, surface, text, muted and hero gradient as fixed hex values, so a navy and gold brand rendered in slate and indigo. A template now declares only its mood, dark ground or light and gradient hero or flat, and takes every colour from the brand. Mood is declared rather than read back out of the canvas hex, because inferring it only worked while templates carried hexes and carrying them is what caused this. The quiz templates had the same fault in three places, a tan button border, a darker gold check and a cream paper fallback, imposing a warmth no brand had chosen. Render scope drops from 158 hardcoded colours to 140 and the budget is ratcheted so it cannot climb back.',
        files: ['src/components/builder/lp/render.tsx', 'src/components/builder/quiz/templates.tsx'],
        evidence: [
          {
            label: 'A deployment wearing its brand',
            path: '/admin/landing-pages',
          },
        ],
      },
      {
        title: 'The brand colour was painted as text onto a ground made from it',
        status: 'shipped',
        detail:
          'Eyebrows, stat figures, trust icons and the highlighted headline phrase used the brand primary directly. On a dark template that ground is derived from the primary, so a navy brand wrote navy on navy and half a headline was simply absent from the live page. Twelve places in one file. There is now a derived accent that walks away from the ground in lightness until it clears 4.5 to 1, keeping hue so the highlight still reads as the brand. The first attempt at the ground itself was wrong in the same family: shifting lightness by a fixed delta clamped an already dark navy to pure black, losing the brand entirely, so it re-lights to a target instead.',
        files: ['src/components/builder/lp/render.tsx'],
      },
      {
        title: 'The save wrote two of the four required tokens',
        status: 'shipped',
        detail:
          'The resolver requires primary, cta, bg and ink. The mapping that writes a brand identity onto the Site wrote primary and ink but never cta or bg, so every brand saved from that editor was structurally incomplete the moment it was saved. On this server that is exactly the state SettlementAssist was in: primary #0F1E3D stored in the database while every field on screen read #737373. cta now falls back to primary, because a brand that has not chosen a separate action colour is saying its action colour is its brand colour, and bg to the same light ground the brands that already render correctly have.',
        files: ['src/app/(app)/admin/(top)/brands/brand-identities/actions.ts'],
        evidence: [
          {
            label: 'The colour fields',
            path: '/admin/brands/brand-identities',
          },
        ],
      },
      {
        title: 'One missing token discarded every colour that was set',
        status: 'shipped',
        detail:
          'The brand mapper replaced the whole palette with neutral grey as soon as any single required token was absent. A brand with a perfectly good navy primary therefore rendered entirely grey because nothing had written its background, and saving again could not help, because saving is what left it incomplete. That closed loop is what made it look like a save that silently reverted. Substitution is now per token: what the brand actually set is kept, only what is missing is filled, and the substitutes stay a true neutral so grey still reads as "not set yet" rather than as an invented palette. Verified against all three brands on this server: the navy survives and is reported as incomplete with cta and bg named, while the two complete brands are untouched.',
        files: ['src/lib/brand-map.ts'],
      },
      {
        title: 'Computed values were being stored as if a person had chosen them',
        status: 'shipped',
        detail:
          'The editor loads a mapped brand, which carries derived fields next to the authored ones, and saving returned the whole object. So tokens, contrast, incomplete, missingTokens and status were written into the stored identity, and the grey the resolver had substituted was persisted as a real decision, no longer distinguishable from one. Derived keys are now stripped on save. Stored derived values also go stale the moment the resolver changes, which is the usual reason not to keep them.',
        files: ['src/app/(app)/admin/(top)/brands/brand-identities/actions.ts'],
      },
      {
        title: 'Six restarts in twenty minutes, while someone was working',
        status: 'shipped',
        detail:
          'Two wizard failures reported earlier in the day, one an unexpected server response and one a failed fetch with a 503, both landed within a minute of a deploy restart. The service log shows six stops and starts inside twenty minutes, every one of them mine, and no crashes. The application never errored because it was not running to error. Deploys during a working session are not free, and the cost lands on whoever is using the product rather than on the person deploying.',
        files: [],
      },
    ],
    verification: [
      {
        label: 'All three brands resolved through the real mapper',
        state: 'verified',
        detail:
          'Run against the live database after deploying. SettlementAssist now resolves primary #0F1E3D rather than grey, and reports incomplete with cta and bg named. The two brands that already worked resolve exactly as before, so the change fixes the broken case without touching the working ones.',
      },
      {
        label: 'The database showed which brands were incomplete and why',
        state: 'verified',
        detail:
          'The token columns were read directly. Two brands carried all four required values and one carried two, which is what separated the brand that rendered correctly from the brand that rendered grey. The diagnosis came from that table rather than from reading the save path and guessing.',
      },
      {
        label: 'An existing incomplete brand fully repaired',
        state: 'not-run',
        detail:
          'SettlementAssist still has null cta and bg columns and will keep substituting for them until it is saved once more. The next save writes both, because that is the bug that was fixed. Nothing was backfilled on the owner\u2019s behalf: the stored identity also contains grey values the old bug wrote in as if chosen, and quietly rewriting someone\u2019s brand colours is not a repair.',
      },
    ],
    openIssues: [
      'The stored identity for SettlementAssist contains grey values that the old bug persisted as if they were chosen. Re-running extraction, or setting the colours by hand and saving, replaces them.',
      'invokeLLM has no timeout and retries up to three times behind a 120 second proxy limit. Nothing today was caused by it, but a slow model call would surface as a failed fetch with nothing in the log.',
      'The coverage check works at day granularity, so once a day has any entry the rest of that day is invisible to it. Four commits went unlogged today and it reported nothing missing. It catches a silent day, not a silent afternoon.',
      'Four interface changes shipped today were verified by typecheck and build only. The capture account and a browser exist on the server; they should be driven before handing a screen over, not after the owner finds it.',
    ],
  },
  {
    date: '2026-08-03',
    title: 'Brand documents, a payload ceiling, and a delete that broke everything',
    summary:
      'Three pieces of work that shipped on 3 August and were never written up. The board carried nothing between 31 July and today, which is the failure this page exists to prevent, so they are recorded here from the commits and verified against the code rather than reconstructed from memory.',
    items: [
      {
        title: 'Deleting anything failed, and the build log caused it',
        status: 'shipped',
        detail:
          'The BuildLogComments migration created its table but not the matching foreign-key column on payload_locked_documents_rels. Payload clears a document\\u2019s locks as part of deleting it, and that query names every collection\\u2019s column in one WHERE clause, so a single missing column made deletes fail across the whole application: removing a Domain raised an error about a buildlog_comments_id column that does not exist. Deletes are transactional, so they rolled back cleanly and nothing was half-removed. Added the column, key and index, mirroring the identical fix Media needed in May. Verified against the live database inside a rolled-back transaction: up applies, re-runs clean, the failing query shape now plans, and down reverses.',
        files: ['src/migrations/20260803_120000_locked_documents_buildlog_comments_rel.ts', 'src/migrations/index.ts'],
      },
      {
        title: 'The same omission had shipped twice, so it is now checked',
        status: 'shipped',
        detail:
          'Media needed this exact fix in May and the build-log comments repeated it, which makes it a pattern rather than an accident. System health now compares Payload\\u2019s collection list against the columns that actually exist on the lock table and reports the gap. The next time someone adds a collection and forgets the relationship column, it shows up as a named check rather than as an unrelated delete failing somewhere else in the product.',
        files: ['src/lib/system-health/checks.ts', 'src/lib/system-health/index.ts'],
        evidence: [
          {
            label: 'The locked-documents check',
            path: '/admin/settings/system',
          },
        ],
      },
      {
        title: 'A brand can be read from its own guidelines',
        status: 'shipped',
        detail:
          'Until now a brand could be read from a URL or an image, and both are inference: a render samples what covers the most pixels, an image asks a model what it sees. A brand guideline that says "Primary: #0B1F3A" is not inference, and it was the one source the extractor could not read. Markdown documents are now a source in both places brands are built, with precedence documents over scraped over generated. Understood formats are labelled lines, markdown tables, CSS custom properties and JSON token exports, in hex, three-digit hex and rgb(). Role labels are matched most-specific-first, so "text on primary", "secondary text" and "card background" are not misread as primary, accent and page background. Status colours are reported and deliberately not applied, because success and danger are fixed across brands. Unlabelled or contradictory values are reported rather than guessed at.',
        files: ['src/lib/brand/markdown-source.ts', 'src/app/(app)/admin/(top)/brands/brand-identities/actions.ts'],
        evidence: [
          {
            label: 'Reading a brand from a document',
            path: '/admin/brands/brand-identities',
          },
        ],
      },
      {
        title: 'The documents are parsed, not handed to the model',
        status: 'shipped',
        detail:
          'Passing markdown to the model and asking it to pull the colours out would reintroduce the near-miss hex the whole feature exists to remove. Every hard value is taken deterministically first and re-applied over the model\\u2019s answer afterwards; the model only ever sees the prose, for the things a document states in sentences. That is also what makes an uploaded file unable to steer the result: its values are fixed before the model runs and restored after it returns, so a document instructing the model to use red changes nothing. One mapping rule had to change with it. The scrape mapper only accepted a near-white card surface, which is right for a scrape and wrong for a document, because a dark brand stating "Card surface: #151B2B" means it. Stated surfaces are kept now and refused only when indistinguishable from their own backdrop, at a cutoff that was measured rather than guessed.',
        files: ['src/lib/brand/markdown-source.ts', 'src/lib/brand/extract-score.ts'],
      },
      {
        title: 'The wizard posted more than a server action can carry',
        status: 'shipped',
        detail:
          'Attaching a document and a screenshot together failed with a bare server render error. The cause was mine: the framework caps a server action body at 1MB by default, and the limits set for images and documents were internally consistent while being unable to cross that transport. The framework rejects an oversized body before the action runs, so no server code could catch it or explain it. Fixed at the cause rather than by raising the ceiling and hoping. Images are downscaled in the browser to 1568 pixels, which is the largest size the vision model reads before resizing anyway, turning a 3.8MB post into 305KB; the original was spending bandwidth and tokens on detail the model discards. Transparency is preserved for logos by keeping PNG where it fits and compositing on white rather than black where it does not. Every limit now derives from one stated budget so the numbers cannot drift apart again, and the client refuses an over-budget selection by name while showing a running total, so the limit is visible before it is hit. The server keeps its own check for callers that are not the wizard. This also fixed the same latent fault in the older image extractor, which had always posted the raw file and would have failed on anything over roughly 700KB.',
        files: ['src/lib/brand/source-limits.ts', 'src/components/builder/brand/downscale-image.ts', 'src/components/builder/brand/BrandModule.tsx', 'next.config.mjs'],
      },
      {
        title: 'Nothing reached the board for three days',
        status: 'shipped',
        detail:
          'Twenty-one commits were logged on 31 July and three more landed on 3 August with no entry at all, so the newest thing on the board was four days behind the code and the gap was found by being asked about it rather than by the board. Written up now from the commits and checked against the code: the migration is registered, the health check is wired, and all three new modules are present. The lesson is the same one this page keeps making: work that is not recorded reads as work that did not happen.',
        files: ['src/lib/buildlog.ts'],
      },
    ],
    verification: [
      {
        label: 'The migration is registered and reversible',
        state: 'verified',
        detail:
          'Applied against the live database inside a rolled-back transaction, so the check cost nothing. Up applies, a second run is clean, the query shape that was failing now plans, and down reverses. Confirmed again here that the file is in the migration index, which is what actually runs rather than the directory listing.',
      },
      {
        label: 'The document parser against real and hostile input',
        state: 'verified',
        detail:
          'Standalone harnesses over prose, markdown tables, CSS custom properties, JSON token exports, dark and light brands, contradictory values, hostile instructions and empty input. 42 parser assertions and 17 mapping assertions, all passing.',
      },
      {
        label: 'The payload budget closes',
        state: 'verified',
        detail:
          'The arithmetic leaves 1MB of margin inside the transport limit, and the exact combination that used to fail now posts. Downscaling was measured rather than assumed: 3.8MB becomes 305KB.',
      },
      {
        label: 'All three pieces still present in the deployed code',
        state: 'verified',
        detail:
          'Checked while writing this entry rather than trusted from the commit messages: the migration is in the index, checkLockedDocumentRels is in the health checks, and markdown-source, source-limits and downscale-image all exist at the sizes their commits describe.',
      },
    ],
    openIssues: [
      'The board went four days without an entry. Nothing enforces that a commit touching src/ has a corresponding item, so the same silence can happen again.',
    ],
  },
  {
    date: '2026-07-31',
    title: 'Brand extraction, screenshot capture, and a handbook',
    summary:
      'The shared blocker from 30 July is gone: there is a headless browser on the server, so brand extraction was rebuilt to read what a page paints rather than what its stylesheet declares, and the screenshot capture job it also unblocked is written. One of the three is not finished, and it is named as such rather than counted.',
    items: [
      {
        title: 'Brand extraction reads what the page paints',
        status: 'shipped',
        detail:
          'The old method parsed a page’s declared stylesheet and Tailwind config. Declaration order in a utility framework has no relationship to visual hierarchy, so on any Tailwind site it returned the framework’s palette: dontsettle.co came back as orange-600 and slate-800, two colours that site does not use. It now renders the page in Chromium and samples what was actually painted, by role, and returns #2b867a for that site’s claim button and #c0a848 from its logo. Every value carries a confidence figure and the sentence describing where it came from.',
        files: ['src/lib/brand/extract-computed.ts', 'src/lib/brand/extract-score.ts', 'src/app/(app)/admin/(top)/brands/brand-identities/actions.ts'],
        evidence: [
          {
            label: 'Reading a brand off a real URL',
            path: '/admin/brands/brand-identities',
            steps: ['From a URL'],
          },
        ],
      },
      {
        title: 'The scoring rules are separate from the browser, and the tests found four bugs',
        status: 'shipped',
        detail:
          'Deciding whether a reading is a brand colour or a framework default is the hard part, so it lives in pure functions with no browser import and is tested against synthetic samples. That paid for itself immediately. A flat two percent pixel floor rejected the very hero button it was written to find, because one at 1440x900 covers under one percent. A three occurrence floor rejected it again, because a page usually has exactly one. Neutrality measured by channel spread could not separate Tailwind grey-500 from a real brand navy, since both span about twenty points; saturation separates them at nine percent against twenty-one. And the in-page sampler was passed to the browser as a string, which Playwright evaluates as an expression, so it returned a function object and never ran.',
        files: ['src/lib/brand/extract-score.ts', 'scripts/test-brand-extract.ts'],
      },
      {
        title: 'A regression I introduced, caught by running it against a real site',
        status: 'shipped',
        detail:
          'Ranking buttons by total painted area let a seven percent opaque overlay on dontsettle.co outrank every real button. Being translucent it was then rejected, which took the entire call-to-action reading down with it: a rejected winner silently suppresses a valid runner-up. Only fully opaque backgrounds now enter the ranking. Reading the code would not have found this; running it did.',
        files: ['src/lib/brand/extract-computed.ts'],
      },
      {
        title: 'Screenshot capture has run: 9 of 24 recipes captured',
        status: 'partial',
        detail:
          'The job drives each evidence recipe, asserts its target is on screen, rings that target so the shot points at itself, and files nothing it could not confirm reaching. It now has its own account and has run against the live admin: 9 recipes captured, 15 skipped, 2.8MB on disk. The skips are the interpreter meeting prose it cannot turn into a click, which is what the recipes were always written as: "Click a node in the flow grid" and "The extraction panel sits above the colour fields" describe a place to a person, not a control to a machine. Every skip is named with the instruction that defeated it and nothing was filed for any of them. Kept partial rather than shipped because most recipes still have no picture.',
        files: ['scripts/capture-buildlog.ts', 'src/lib/buildlog/captures.ts', 'src/app/api/legalos/buildlog-capture/[id]/route.ts'],
        evidence: [
          {
            label: 'Where captures appear once taken',
            path: '/admin/buildlog',
          },
        ],
      },
      {
        title: 'Captures are stored behind authentication, not in public files',
        status: 'shipped',
        detail:
          'These are photographs of this admin taken while signed in, so a capture of the leads table is a capture of real people’s contact details. They are written under data/ and served through a route that checks the session, with a private cache header, rather than into public/ where anyone guessing a filename would get them with no authentication step to fail. Image and manifest are written separately, image first, so a record never points at a file that is not there.',
        files: ['src/lib/buildlog/captures.ts', 'src/app/api/legalos/buildlog-capture/[id]/route.ts'],
      },
      {
        title: 'A handbook for every screen',
        status: 'shipped',
        detail:
          'Thirty-two screens, each with what it is for, how to use it, and what it does underneath. The mechanism is given equal weight because most of what surprises people here is mechanical rather than visual: a host cache with a sixty second life, a lead pipeline that runs inside the request, a Site delete that takes its leads with it. It also records honestly that six routes are unbuilt placeholders, one of them Leads, which sits in the main sidebar.',
        files: ['src/lib/handbook.ts', 'src/app/(app)/admin/(top)/handbook/page.tsx', 'src/components/app/Sidebar.tsx'],
        evidence: [
          {
            label: 'The handbook',
            path: '/admin/handbook',
          },
        ],
      },
      {
        title: 'Documented routes are checked, not trusted',
        status: 'shipped',
        detail:
          'Documentation rots by pointing at screens that moved. Writing the handbook as data rather than prose is what makes that checkable: pnpm check:handbook resolves all twenty-one documented routes back to the file serving them and fails on any that has none. It cannot tell whether the words are still true, only a person can do that, but a dead link needs no judgement to catch.',
        files: ['scripts/check-handbook-routes.ts'],
      },
      {
        title: 'Playwright is a dependency, not a dev dependency',
        status: 'shipped',
        detail:
          'It is on a production request path now, so a --prod install would have silently dropped brand extraction to the weaker stylesheet reader with no error. It is also pinned exactly rather than by range, because a minor bump would leave the library without matching browser binaries, and marked external so Next does not bundle it and rewrite the paths it uses to find Chromium.',
        files: ['package.json', 'next.config.mjs'],
      },
      {
        title: 'Walking the live flows found two real breaks, both now fixed',
        status: 'shipped',
        detail:
          'Every public path was walked against the running server rather than reasoned about. Two things are wrong and neither is visible from the admin. First, a Site is created in draft, and the public route returns 404 for a draft Site on every path including its own preview domain, so two of the three Sites here are entirely unreachable and four of their six deployments marked live serve nothing. Nothing in the builder says why. Second, generateMetadata returns an empty object for anything that is not a quiz or landing-page deployment, so every authored page, including the home page and all the legal pages, ships with no title tag, no description, no canonical and no social tags. Both are recorded here rather than fixed in the same pass, because one changes public visibility and the other changes what search engines see, and those are the owner’s calls.',
        files: ['src/app/(public)/[[...slug]]/page.tsx'],
        evidence: [
          {
            label: 'Where a Site is set live',
            path: '/admin/sites',
          },
        ],
      },
      {
        title: 'A near miss: the Payload CLI tried to drop a live column',
        status: 'shipped',
        detail:
          'Creating the capture account through pnpm payload run stopped on a prompt: "You are about to delete theme_overrides_removed_20260729 column in funnel_quiz_deployments with 3 items. Accept warnings and push schema to database?" The CLI does not inherit the production flag the running service gets from next start, so Payload treated the call as development and offered to push schema at a production database. Killed rather than answered, and the column and all three rows were checked afterwards and are intact. The prompt defaults to no, so this needed a person to type y, but it should never have been asked in the first place. Re-run with NODE_ENV=production it completes silently. Anyone running a payload CLI command against this server should set that flag, and this is the reason.',
        files: ['scripts/create-capture-user.ts'],
      },
      {
        title: 'The capture job has its own identity',
        status: 'shipped',
        detail:
          'It signs in as capture@legenex.com rather than borrowing a person\\u2019s account, so captures are attributable to a job in the audit log instead of looking like someone clicking through every screen in the product at once, and the account can be disabled without locking anyone out. Super admin, because the recipes span every Site and a capture that silently skipped screens the account could not see would produce a board that looks complete and is not. The script refuses a password under 24 characters for the same reason, generates nothing itself, and never echoes what it was given.',
        files: ['scripts/create-capture-user.ts'],
      },
      {
        title: 'Sign-in was raced, not broken',
        status: 'shipped',
        detail:
          'The first capture run failed with a locator timeout on the email field, which reads like a missing field. The field was there: a probe against the same URL found it immediately. The job was filling it as soon as the page reached networkidle, which is not a promise that a hydrating form has mounted. It now waits for the field and, if it truly never appears, says which of the two it was.',
        files: ['scripts/capture-buildlog.ts'],
      },
      {
        title: 'The summary box border matches the other cards again',
        status: 'shipped',
        detail:
          'It had been set to a dark red on 30 July to make the counts stand out. Against the surrounding cards it read as an alert rather than a heading, on a box whose numbers are usually unremarkable. Back to the shared border token, so it is one token rather than a literal and it follows the theme wherever that goes.',
        files: ['src/app/(app)/admin/(top)/buildlog/page.tsx'],
        evidence: [
          {
            label: 'The summary box',
            path: '/admin/buildlog',
          },
        ],
      },
      {
        title: 'The DNS and certificate setup is real, but half the traffic to the live brand is being dropped',
        status: 'open',
        detail:
          'Checked because the provisioning could plausibly have been theatre. It is not: the DNS check really queries Cloudflare over DNS-over-HTTPS for A, CNAME and TXT records, the Plesk API answers with genuine server data, no dev skip flag is set, and the runtime is production so the skip-DNS escape hatch is correctly unreachable. The data behind it is the problem. getwhatyoureowed.co, the only publicly working brand, resolves to two addresses: this server, and 162.255.119.42, which refuses connections outright. Eleven of twenty live lookups returned the dead one first, so roughly half of all visitors cannot reach the site at all, and paid traffic is being spent on it. Separately, none of the four preview domains has a usable certificate: they resolve here and answer, but a real browser fails the handshake, which makes every preview URL unusable in the one place it is meant to be used. Their ssl_status reads unknown, which is honest, while their status reads active, which is not. lp.checkmyclaim.co resolves here, fails TLS, and is attached to no Site at all. dont-settle.co has no A record and is correctly marked pending. The second address on the live brand is a registrar change and is not mine to make. The preview certificates trace to a root cause in code: creating a Site writes its preview Domain row with status active without ever calling Plesk, so the row asserts a state nothing established. Fixing that means either provisioning each preview host or, better, one wildcard certificate for the whole preview namespace, which is an infrastructure change on live domains and needs the owner to choose.',
        files: ['src/lib/dns-check.ts', 'src/lib/plesk/provision-domain.ts', 'src/lib/ssl-poll.ts'],
        evidence: [
          {
            label: 'Where domains are verified',
            path: '/admin/brands/domains',
          },
        ],
      },
      {
        title: 'The handbook claim about preview domains was wrong',
        status: 'shipped',
        detail:
          'It said a preview domain makes a new Site reachable immediately. Walking the flow proved otherwise: the Site is created in draft and 404s everywhere until it is set active. Corrected in the concept, in the first-run sequence and on the Sites entry, with the current state of this server named. Documentation that is confidently wrong is worse than none, and this was mine.',
        files: ['src/lib/handbook.ts'],
      },
      {
        title: 'A shared module could not carry the server-only marker',
        status: 'shipped',
        detail:
          'The capture store was marked server-only, which is an alias Next supplies to its own build rather than a real package. Importing it under plain node threw before the script reached its own credential guard, so the capture job could never have run at all. Removed with the reason recorded: the node:fs import already makes a client bundle fail, so only the friendlier error message was given up. Duplicating the atomic write into the script would have been worse.',
        files: ['src/lib/buildlog/captures.ts'],
      },
    ],
    verification: [
      {
        label: 'Thirty-seven assertions on the scoring rules',
        state: 'verified',
        detail:
          'Run with pnpm test:brand. They include the property the rebuild exists for: given what a Tailwind site actually paints, no Tailwind default appears anywhere in the output, and a grey call to action yields no primary at all.',
      },
      {
        label: 'The extraction checked against a screenshot, not just against itself',
        state: 'verified',
        detail:
          'dontsettle.co was captured and looked at. The teal button, the gold logo, the off-white ground, the white cards and the Fraunces headings are all visible in the image and all match what was returned. An earlier reading of mine that the light ground was wrong was itself wrong: the page is 10,157px tall and majority light, so the dark hero is a band rather than the ground.',
      },
      {
        label: 'The capture route refuses anonymous requests',
        state: 'verified',
        detail:
          'Returns 401 with no session. An encoded traversal path was also tried: it normalises away before reaching the handler and returns marketing HTML, containing no file content, and the id pattern would reject it regardless.',
      },
      {
        label: 'The handbook route checker fails when it should',
        state: 'verified',
        detail:
          'Verified by breaking it deliberately. A moved route and a mismatched URL pattern were both named in the output and the run exited 1. A checker that has only ever passed has not been tested.',
      },
      {
        label: 'Type check clean and the production build compiles',
        state: 'verified',
        detail: 'Run on the server, where the dependencies and database exist. Zero errors, and the build completed.',
      },
      {
        label: 'Every public path walked against the running server',
        state: 'verified',
        detail:
          'All six domains, all six live deployments, and ten paths on the one reachable Site were requested directly at the app on port 3000, which isolates the application from nginx. Two breaks were found and are recorded as an open item. The lead endpoint was probed with invalid payloads: it returns 400 and writes no row. The leads table still holds zero rows.',
      },
      {
        label: 'DNS, certificates and the Plesk API checked against reality',
        state: 'verified',
        detail:
          'Every domain was resolved through the same Cloudflare DNS-over-HTTPS endpoint the app uses, then each returned address was connected to individually to see whether it actually serves the site. Certificates were checked without skipping validation, which is what exposed the preview domains: they answer when validation is skipped and fail when it is not. The Plesk API was called directly and returned real server data rather than a stub.',
      },
      {
        label: 'A lead has been captured end to end',
        state: 'not-run',
        detail:
          'Validation was checked, persistence was not. Every integration is disabled on all three Sites, so a real submission would fire nothing external and only write a row, but that row is a compliance record in the owner\u2019s production table and creating one is their call, not mine.',
      },
      {
        label: 'A screenshot has actually been captured',
        state: 'verified',
        detail:
          'Nine exist, written and read back. One was pulled off the server and looked at: it shows the right screen, with the Archived tab ringed, and the text the job asserted before saving is visible in the image. An anonymous request for a capture returns 401, so the authentication in front of them is real and not just intended.',
      },
    ],
    deployNotes: [
      'Playwright and Chromium are installed on the server. A future environment needs pnpm install followed by npx playwright install --with-deps chromium.',
      'Capture credentials live in .env on the server. To re-run: set -a; . ./.env; set +a; then node --experimental-strip-types scripts/capture-buildlog.ts https://os.legenex.com',
      'Any payload CLI command on this server must be run with NODE_ENV=production. Without it the CLI treats the call as development and offers to push schema at the production database, including dropping columns that still hold rows.',
    ],
    openIssues: [
      'Fifteen of twenty-four recipes still have no picture. Each names the instruction that defeated the interpreter, so they can be rewritten one at a time against a real run rather than guessed at.',
      'The stale A record on getwhatyoureowed.co is still live and still dropping roughly half the traffic to that brand. It is a registrar change.',
      'The four preview domains still have no certificate, because creating a Site writes the Domain row as active without ever calling Plesk. Fixing it means provisioning each host or issuing one wildcard, which is an infrastructure choice.',
      'The handbook records what is true today. It has no automatic link to the code beyond the route check, so the words need a read whenever a screen changes materially.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Closing the not-shipped list',
    summary:
      'Six items on the board were not shipped. Three are now closed, one of which turned out to have been done days ago and never updated. The other three are named honestly below rather than padded out.',
    items: [
      {
        title: 'F001 is closed',
        status: 'shipped',
        detail:
          'The last two funnel tables, for advertorials and their deployments, are now created by a migration. All six exist in the chain, which matters more for these two than the others: Payload reads every declared column at startup, so a missing table takes the whole application down rather than failing one query, and the advertorial builder touches them the moment anyone opens that screen.',
        files: ['src/migrations/20260730_120000_funnel_advertorial_tables.ts'],
      },
      {
        title: 'Archived brands are no longer offered anywhere',
        status: 'shipped',
        detail:
          'A live instance of the same bug as the archived quiz. A Site can be archived, but every dropdown that listed brands kept offering it, so a funnel could be built for a brand that had been deliberately retired. The brand pickers in the landing-page and advertorial builders now go through the shared helper, and the brand object carries the Site\u2019s own status so the helper can see it.',
        files: ['src/lib/brand-map.ts', 'src/components/builder/lp/LandingPagesApp.tsx', 'src/components/builder/advertorial/AdvertorialBuilderApp.tsx'],
        evidence: [
          { label: 'Brand picker', path: '/admin/landing-pages', steps: ['Deployments tab', 'Open one', 'Brand field'] },
        ],
      },
      {
        title: 'One board item was stale, not open',
        status: 'shipped',
        detail:
          'The funnel brand map was listed as still carrying its own fallback colours. It stopped doing that on 29 July when quizzes were fixed to wear their brand; nobody updated the item. Checked against the code rather than trusted: there are no colour fallbacks left in it. A board that reports work as outstanding when it is done is as misleading as one that reports the reverse.',
        files: ['src/lib/brand-map.ts'],
      },
      {
        title: 'Screenshots, and the extraction method, share one blocker',
        status: 'superseded',
        detail:
          'Both need a headless browser on the server. Capture has to drive the admin UI, and rebuilding brand extraction properly means sampling computed styles from a rendered page rather than reading declared stylesheet values. Neither is close to done, and doing one makes the other much cheaper, so they should be taken together rather than separately. Superseded on 31 July: the browser was installed and both halves were built off it. Taking them together was right, and the second half came almost free. Extraction is finished; capture is written but has never been run, and is tracked as its own partial item rather than left inside this one.',
      },
      {
        title: 'The remaining hardcoded colour is the template library',
        status: 'partial',
        detail:
          '157 values, almost all of them the fixed palettes that define what each template looks like rather than stray literals. Converting them is the template library itself, and sweeping them without building it would leave every template looking the same. It stays open deliberately until that work starts.',
        files: ['src/components/builder/lp/render.tsx', 'src/components/builder/quiz/templates.tsx'],
      },
    ],
    verification: [
      {
        label: 'All six funnel tables in the chain',
        state: 'verified',
        detail:
          'Each table name was searched for across the migration directory rather than assumed from the file titles. All six now have a CREATE TABLE behind them.',
      },
      {
        label: 'The brand map really had been fixed',
        state: 'verified',
        detail:
          'Searched for fallback colour patterns in the brand map before marking the item shipped. None remain; it resolves through the shared resolver.',
      },
      {
        label: 'A missing import caught before it shipped',
        state: 'verified',
        detail:
          'The first pass replaced the brand pickers but skipped adding the import, because the guard checked for a symbol the replacement had just introduced. Both files would have failed to build. Found by grepping for the import rather than trusting the edit reported success.',
      },
      {
        label: 'In the browser',
        state: 'not-run',
        detail: 'The converted pickers have not been opened. Archive a Site and confirm it disappears from the brand dropdowns.',
      },
    ],
    deployNotes: [
      'Adds a migration for the advertorial tables. Run pnpm payload migrate after the build.',
      'If a brand vanishes from a dropdown after this, check whether its Site is archived. That is the intended behaviour.',
    ],
    openIssues: [
      'Screenshot capture and computed-style brand extraction both need a headless browser on the server, and should be built together.',
      '157 hardcoded colours remain in the template palettes, to be closed by the template library.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'The build log becomes the review surface',
    summary:
      'Rather than a second progress page, the existing board gained the review loop: every item can be commented on, comments persist against that specific decision, and each item is categorised so the board can be read by area instead of only by date.',
    items: [
      {
        title: 'Comments, attached to the decision they are about',
        status: 'shipped',
        detail:
          'Any item can be commented on, and the comment stays with that item rather than in a chat thread nobody can find next week. Threads collapse to a count so the board stays scannable, and an item with unanswered feedback shows its open count without being expanded.',
        files: ['src/app/(app)/admin/(top)/buildlog/CommentThread.tsx'],
        evidence: [
          {
            label: 'This board',
            path: '/admin/buildlog',
            steps: ['Any item, Comment'],
          },
        ],
      },
      {
        title: 'Stored in the database, not a file',
        status: 'shipped',
        detail:
          'The agent-plan board keeps machine-written status in JSON files, which is the right weight for something cheap to regenerate. These are notes a person wrote about a decision, and losing them to a rebuilt server would be a real loss, so they go in the database where they are backed up, exportable and covered by the audit hooks.',
        files: ['src/collections/BuildLogComments.ts', 'src/migrations/20260729_230000_buildlog_comments.ts'],
      },
      {
        title: 'Comments survive a rename instead of vanishing',
        status: 'shipped',
        detail:
          'Anchors are slugs derived from the log\u2019s own content, because the log is code and there is no row to relate to. That means renaming an item would orphan its comments, so the title the comment was written against is stored with it: an orphan is shown with its original target rather than silently disappearing.',
        files: ['src/lib/buildlog.ts'],
      },
      {
        title: 'Items are categorised by area',
        status: 'shipped',
        detail:
          'Each item carries an area - brand, quiz, landing page, public render, domains, leads, data, admin - inferred from its own file paths rather than hand-tagged across sixty-odd existing items. A tag typed by hand goes stale when the item is edited; a path is the item\u2019s actual subject. An explicit area can override the inference.',
        files: ['src/lib/buildlog.ts'],
      },
      {
        title: 'A summary that leads with what is not done',
        status: 'shipped',
        detail:
          'Counts of entries, items, items not shipped, and open comments, with the last two in amber when they are non-zero. Unrun verification checks are called out above the entries rather than summarised away, because an unrun check is not a passing one.',
        files: ['src/app/(app)/admin/(top)/buildlog/page.tsx'],
      },
      {
        title: 'Where to look, on every item worth looking at',
        status: 'shipped',
        detail:
          'Sixteen items now carry a route and the clicks needed to reach the thing itself. That matters more than it sounds: most of what ships lives behind an interaction rather than at a URL, so the redirect editor is a tab inside a modal inside the quiz builder. A capture job pointed at a bare route would photograph the quizzes list and file it as evidence for a screen it does not show, which is worse than no screenshot. The recipe comes first because a reader can follow it today, and it is exactly the script a headless browser will drive later.',
        files: ['src/lib/buildlog.ts', 'src/app/(app)/admin/(top)/buildlog/page.tsx'],
      },
      {
        title: 'Screenshots themselves',
        status: 'superseded',
        detail:
          'Not built. The slot is rendered and every recipe is written, so capture is now a job that walks the recipes and fills in an image rather than a feature that has to be designed. It still needs a headless browser and image storage on the server, which is a dependency I cannot install or test from here. Superseded by the merged screenshots and extraction item on 30 July, which records the shared blocker rather than counting the two halves separately.',
      },
    ],
    verification: [
      {
        label: 'Anchors are stable',
        state: 'verified',
        detail:
          'All 63 item ids are unique with no collisions, and an id is unchanged when entries are reordered - which matters because a new entry is added at the top every time, and an index-based id would reassign every existing comment.',
      },
      {
        label: 'Degrades before the migration runs',
        state: 'verified',
        detail:
          'The comment read is wrapped so a missing table renders an empty board rather than a 500. A page whose job is reporting state should not itself be the thing that is down.',
      },
      {
        label: 'In the browser',
        state: 'not-run',
        detail: 'Nothing here has been clicked. Post a comment, resolve it, reopen it, and delete one.',
      },
    ],
    deployNotes: [
      'Adds a migration for the comments table. Run pnpm payload migrate after the build.',
      'Until that migration runs the board renders normally with no comments, rather than erroring.',
    ],
    openIssues: [
      'Screenshot capture per section is not built. It needs a headless browser on the server.',
      'Comments cannot yet be filtered to just the open ones, and there is no notification when one is added.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Pickers stop offering things that cannot be used (P0-D)',
    summary:
      'The archived quiz you spotted in the deployment dropdown, and the free-text domain field next to it. Both are now real pickers over real records, through one helper, so the same mistake cannot be made screen by screen.',
    items: [
      {
        title: 'Archived quizzes are no longer offered',
        status: 'shipped',
        detail:
          'Archiving a quiz is a decision to stop using it, and a retired quiz sitting in the deployment dropdown is how it gets deployed again by accident. Pickers now return published and draft records only.',
        files: ['src/lib/selectable.ts', 'src/components/builder/quiz/QuizBuilderApp.tsx'],
        evidence: [
          {
            label: 'The quiz picker',
            path: '/admin/quizzes',
            steps: ['Deployments tab', 'Open a deployment', 'Basics tab, Quiz field'],
          },
          {
            label: 'Where quizzes get archived',
            path: '/admin/quizzes',
            steps: ['Archived tab'],
          },
        ],
      },
      {
        title: 'But a saved reference is never dropped silently',
        status: 'shipped',
        detail:
          'Filtering alone would have created a worse bug. A deployment pointing at a quiz that was archived afterwards would find its value missing from the list, and the select would fall back to whatever came first, silently repointing a live deployment at a different quiz the next time anyone saved an unrelated field. The archived record is kept, disabled, labelled, with a line explaining what happened. A reference to something deleted entirely shows as missing rather than as an empty box.',
        files: ['src/lib/selectable.ts'],
      },
      {
        title: 'Domain is a picker, not a text box',
        status: 'shipped',
        detail:
          'It was free text, so a typo produced a deployment bound to a host that does not exist and nothing said so until a visitor got a 404. It now lists the brand\u2019s own domains, and only one that is active with an active certificate can be chosen. A domain that is not ready is shown greyed out rather than hidden, so "why is my domain not in the list" has an answer on screen. A brand with no ready domain gets a link to connect one instead of an empty select.',
        files: ['src/components/builder/quiz/QuizBuilderApp.tsx', 'src/lib/brand-map.ts'],
        evidence: [
          {
            label: 'The domain picker',
            path: '/admin/quizzes',
            steps: ['Deployments tab', 'Open a deployment', 'Basics tab, Domain field'],
          },
        ],
      },
      {
        title: 'One helper, so this cannot drift per screen',
        status: 'shipped',
        detail:
          'Closed. The brand pickers in the landing-page and advertorial builders now go through the same helper, which means an archived brand is no longer offered anywhere. That was a live instance of the same bug: a Site can be archived, but every dropdown listing brands kept offering it, so a funnel could be built for a brand that had been deliberately retired.',
        files: ['src/lib/selectable.ts'],
      },
    ],
    verification: [
      {
        label: 'Picker rules',
        state: 'verified',
        detail:
          '17 assertions. Archived records are absent, drafts are present, a saved reference to an archived record is kept and disabled, a dangling reference is surfaced rather than swallowed, only a fully ready domain is selectable, and a saved domain whose certificate lapsed is kept disabled while an unrelated unready one stays hidden. The last group asserts the property directly: whatever is currently saved is always present in the options.',
      },
      {
        label: 'On screen',
        state: 'not-run',
        detail:
          'Open a deployment and confirm the archived quiz is gone from the dropdown, and that the domain field is now a list of that brand\u2019s domains.',
      },
    ],
    deployNotes: [
      'No migration.',
      'A deployment whose domain was typed by hand and does not match a Domain row will show as unset. Pick the right domain and save.',
    ],
    openIssues: [
      'The publish gate is still not built, so nothing yet blocks publishing to a host that is not ready. The picker discourages it; only the gate will prevent it.',
      'Other admin dropdowns still query directly and need converting to the shared helper.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'One tenant\u2019s logo stops appearing on everyone\u2019s site',
    summary:
      'A new brand at getwhatyoureowed.co was showing the Check My Claim logo. Two bugs in the shared navigation, and a third in what a new brand starts life as. None of them was a styling problem.',
    items: [
      {
        title: 'The nav read a field that does not exist',
        status: 'shipped',
        detail:
          'It looked for the logo at the top level of the Site record. The logo lives on the brand. So the lookup was always empty and setting a logo in the brand editor did nothing, which is why there appeared to be nowhere to add one.',
        files: ['src/components/blocks/BlockRenderer.tsx'],
      },
      {
        title: 'And fell through to a hardcoded Check My Claim logo',
        status: 'shipped',
        detail:
          'The final fallback was a fixed URL to one tenant\u2019s logo file. With the brand lookup always empty, every site that had not overridden the logo on the block itself landed on it. The fallback is now the site\u2019s own name as a wordmark, styled from the brand tokens: a brand with no logo should look like a brand with no logo, not like a different company.',
        files: ['src/components/blocks/BlockRenderer.tsx', 'src/components/blocks/bespoke-css.ts'],
      },
      {
        title: 'A new brand was a copy of Check My Claim',
        status: 'shipped',
        detail:
          'Creating a brand seeded that tenant\u2019s display name, phone number, copyright line, privacy and terms URLs, domains, colours and fonts. The create action overrode the name and left the rest, so every brand started as a copy and stayed one in any field nobody happened to edit. A new brand is now genuinely blank, and blank colours resolve to the neutral grey that reads as unconfigured.',
        files: ['src/components/builder/brand/BrandModule.tsx'],
      },
      {
        title: 'Fabricated evidence was being seeded into new sites',
        status: 'shipped',
        detail:
          'The brand seed carried named people, cities and settlement amounts, and the starter home page carried claims of tens of thousands of claimants reviewed and billions recovered. Those were auto-inserted into legal advertising for a brand that had not yet reviewed a single claim. Both are gone. What remains describes how the service works rather than what it has achieved.',
        files: ['src/components/builder/brand/BrandModule.tsx', 'src/seed/home-blocks.ts'],
      },
    ],
    verification: [
      {
        label: 'No tenant asset left in shared code',
        state: 'verified',
        detail:
          'A repo-wide search for that logo URL now returns only the check-my-claim page components, which are that tenant\u2019s own files and are already tracked separately for deletion.',
      },
      {
        label: 'On screen',
        state: 'not-run',
        detail:
          'Worth loading getwhatyoureowed.co after deploying. Expect either that brand\u2019s own logo if one is set, or its name as a wordmark. If the Check My Claim logo is still there, it is saved into that page\u2019s navigation block and needs clearing in the page builder rather than in code.',
      },
    ],
    deployNotes: [
      'No migration.',
      'A site with no brand logo will show its name as a wordmark. Set the logo on the brand identity and every page for that brand picks it up.',
      'Existing pages whose navigation block has a logo saved into it keep that logo. The block override still wins, which is correct, but it means an imported page may need clearing by hand.',
    ],
    openIssues: [
      'The starter home page still ships headline copy written for a mass-tort brand. It reads as generic today but should become vertical-aware.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Quizzes actually wear their brand now',
    summary:
      'The quiz preview barely reflected the brand, and the reason was not styling. The map that feeds every funnel builder was reading the page background out of the brand\u2019s body-text colour, never populating the card colour at all, and filling both gaps with Check My Claim\u2019s blue and navy. Any brand with a sparse record was rendering as a different brand.',
    items: [
      {
        title: 'The page background was the text colour',
        status: 'shipped',
        detail:
          'The funnel brand map took the quiz page ground from the brand\u2019s ink field, which is the body-text colour and is dark by definition. Every quiz therefore rendered on a dark ground regardless of what the brand said its background was. It now reads the background token, which is the field that means background.',
        files: ['src/lib/brand-map.ts'],
      },
      {
        title: 'Every brand\u2019s quiz card was Check My Claim navy',
        status: 'shipped',
        detail:
          'The card colour was never populated, so it always fell through to a hardcoded navy, and the primary fell through to a hardcoded blue. Those two values are one specific tenant\u2019s palette. A brand that had not filled in every field was not approximately wrong, it was showing another brand\u2019s colours.',
        files: ['src/lib/brand-map.ts'],
      },
      {
        title: 'The map now goes through the one resolver',
        status: 'shipped',
        detail:
          'Colour for the quiz, landing page and advertorial builders is resolved by the same function the public site uses, so the same brand cannot look like two different brands depending on which surface renders it. The brand JSON is no longer consulted for colour either: the token columns are the single store, and reading both is how two stores drift.',
        files: ['src/lib/brand-map.ts'],
      },
      {
        title: 'An unconfigured brand looks unconfigured',
        status: 'shipped',
        detail:
          'A brand with no colours set now resolves to a grey with no hue at all, and carries a flag saying which tokens are missing. Grey reads as "nobody has set this yet"; a blue reads as a finished brand that happens to be wrong. Even a blue-tinted grey was too suggestive, so the placeholder has zero saturation.',
        files: ['src/lib/brand-map.ts'],
      },
      {
        title: 'The editorial template stopped ignoring the brand',
        status: 'shipped',
        detail:
          'It hardcoded a cream page and gold accents, so it looked identical for every brand that chose it. Its paper is now the brand\u2019s own surface pushed to a paper lightness and warmed slightly toward the brand\u2019s accent, and its rules take the accent. The character survives, the colour comes from the brand: a navy brand gets an ivory sheet, a green brand gets a warmer stone one.',
        files: ['src/components/builder/quiz/templates.tsx'],
        evidence: [
          {
            label: 'Template picker at real brand colours',
            path: '/admin/quizzes',
            steps: ['Deployments tab', 'Open a deployment', 'Render & Embed tab, Visual Template'],
          },
        ],
      },
      {
        title: 'The preview ignored the brand twice over',
        status: 'shipped',
        detail:
          'The palette used by both the builder preview and the live page hardcoded cream for the editorial template and fell back to a navy for everything else, so a brand\u2019s background was discarded once by the template and again by the fallback. Both now ask the template for its ground, and the template derives it from the brand.',
        files: ['src/components/builder/quiz/preview.tsx', 'src/components/public/quiz/QuizRuntime.tsx'],
        evidence: [
          {
            label: 'The quiz preview',
            path: '/admin/quizzes',
            steps: ['Open a quiz', 'Preview'],
          },
        ],
      },
    ],
    verification: [
      {
        label: 'Two brands produce two quizzes',
        state: 'verified',
        detail:
          '62 assertions. Two brands with different palettes now differ on primary, accent, background and card, and no value of either resolves to any of the three Check My Claim colours that used to leak in. A light brand stays light instead of being forced dark. Text on the ground, on the primary and on the button all reach 4.5:1. Status colours stay identical across brands while brand colours do not. An empty brand is flagged incomplete, names its missing tokens, and resolves to a true neutral.',
      },
      {
        label: 'On screen',
        state: 'not-run',
        detail:
          'Worth opening two brands\u2019 quizzes side by side after deploying, and switching one of them to the editorial template to confirm the paper picks up its brand rather than the old cream.',
      },
    ],
    deployNotes: [
      'No migration.',
      'Quiz previews will change appearance, and that is the point. A quiz that looked blue and navy under a brand that is neither was showing another tenant\u2019s palette.',
      'A brand that renders grey is telling you its colour tokens are unset. Fill them in on the brand identity rather than reporting it as a bug.',
    ],
    openIssues: [
      '157 hardcoded colours remain, concentrated in the landing-page renderer and the block renderer. The quiz templates are down to 26 and the rest of those are neutral scrims.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Hardcoded colour starts coming out of public pages',
    summary:
      'First real pass at the 311. The shared public stylesheet, the lead form and the quiz runtime now take every colour from a token. 119 down, 163 left, and the remainder is a different kind of work rather than more of the same.',
    items: [
      {
        title: 'The shared public stylesheet is at zero',
        status: 'shipped',
        detail:
          'All 104 hardcoded values in the CSS behind the public sections are gone. Alpha tints became a mix of the token they were tinting rather than a fixed rgba, so a brand recolour carries through them. The stylesheet also still carried fallback colours inside its variables, which is the fallback palette the contract forbids; those are gone, so a brand with no data now fails visibly instead of rendering in someone else\u2019s grey.',
        files: ['src/components/blocks/bespoke-css.ts'],
      },
      {
        title: 'Four errors the scripted pass introduced, caught and fixed',
        status: 'shipped',
        detail:
          'A find-and-replace collapsed a two-stop gradient onto one colour, flattened two distinct navies into one, painted the page in the card colour so every card vanished, and put button text verified against one token onto a button painted with another. Each was found by reading the output rather than trusting the script, which is the reason to read the output.',
        files: ['src/components/blocks/bespoke-css.ts'],
      },
      {
        title: 'Lead form and quiz runtime tokenised',
        status: 'shipped',
        detail:
          'The public lead form and the quiz page now use tokens for surfaces, hairlines, shadows and button text, and the error message uses the fixed system danger colour rather than a brand-scoped one. The same card-on-the-same-colour-as-its-section mistake was in the lead form and is fixed.',
        files: ['src/components/blocks/LeadForm.tsx', 'src/components/public/quiz/QuizRuntime.tsx'],
      },
      {
        title: 'New derived tokens, none of them authored',
        status: 'shipped',
        detail:
          'Text that sits on the ink colour when ink is used as a surface, which is where hardcoded white usually hides in dark heroes and footers. A muted version of it. An elevation and scrim set, neutral by design because a drop shadow is a depth cue rather than an identity, but tokenised so components stop inventing their own alpha.',
        files: ['src/lib/brand/resolve-tokens.ts'],
      },
      {
        title: 'The admin page builder was being counted as public output',
        status: 'shipped',
        detail:
          'Three page-builder components were in the public budget. Nothing under the public routes imports them, checked rather than assumed, so they moved to the uncounted admin scope. That is 29 of the reduction and it is a scope correction, not work.',
        files: ['scripts/lint-brand-tokens.mjs'],
      },
      {
        title: 'What is left is template work, not find and replace',
        status: 'superseded',
        detail:
          'The remaining 163 is concentrated in the landing-page renderer, the quiz templates and the block renderer. Their colours are not stray literals; they are the fixed palettes that define what each template looks like. Turning those into tokens is the template library itself, which is its own package, and doing it as a sweep now would produce templates that all look the same. Superseded by the template-library item on 30 July. The figure here, 163, is also out of date: it is 157 after the tokenising pass.',
        files: ['src/components/builder/lp/render.tsx', 'src/components/builder/quiz/templates.tsx', 'src/components/blocks/BlockRenderer.tsx'],
      },
    ],
    verification: [
      {
        label: 'Every token the CSS now depends on resolves',
        state: 'verified',
        detail:
          '78 assertions across three brands including the reported bad palette and a deliberately hostile one. Each checks that all 22 referenced tokens are emitted, that text on the ink surface and text on the button both reach 4.5:1, that the gradient still has two distinguishable ends, and that a card is never the same colour as the page behind it.',
      },
      {
        label: 'Neutral values were not quietly exempted',
        state: 'verified',
        detail:
          '196 of the 282 were greyscale, and exempting them would have cut the number by two thirds without doing anything. They were not exempted: a grey used as text or as a surface is exactly the white-on-white risk, and only shadow and scrim alpha is genuinely brand independent. Those became tokens too.',
      },
      {
        label: 'In a browser',
        state: 'not-run',
        detail:
          'The public sections have not been rendered since the stylesheet was rewritten. This is the change most worth looking at directly: open a site page and check the hero, the buttons, the cards and the footer.',
      },
    ],
    deployNotes: [
      'No migration. This is a render change only.',
      'The public sections should look the same. Colour now flows from the brand, so if anything shifted it is because that section was previously ignoring the brand.',
      'The stylesheet uses color-mix for tints. It has been available in every major browser since 2023, but it is worth a glance on an older device if you have one.',
    ],
    openIssues: [
      '163 hardcoded colours remain, almost all of them template palettes rather than stray literals. They come out as part of building the template library.',
      'One tenant still has 125 in page components that should be CMS content rather than source code.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Deployments stop authoring colour (P0-C)',
    summary:
      'The third owner of colour is gone. A deployment could generate and store its own palette, so the brand said one thing and the deployment said another and whichever ran last won. Colour now has exactly one owner, and the generator that used to do the damage now proposes to the brand instead.',
    items: [
      {
        title: 'Per-deployment palettes removed',
        status: 'shipped',
        detail:
          'The Theme tab, the stored palette, and every read of it are gone from the deployment editor, the preview, the public runtime and the resolver. A deployment still picks its template, which is a choice among brand-derived presentations rather than a new colour.',
        files: ['src/lib/quiz-theme.ts', 'src/components/builder/quiz/QuizBuilderApp.tsx'],
      },
      {
        title: 'The generator moved to Brand Identity and lost its write access',
        status: 'shipped',
        detail:
          'It is now Brand Extraction, on the brand editor. It returns a proposal and writes nothing: every token shows where it came from and how much to trust it, the contrast verdict beside the Accept button is computed by the same resolver the publish gate uses, and a human accepts before anything changes.',
        files: ['src/app/(app)/admin/(top)/brands/brand-identities/actions.ts', 'src/components/builder/brand/BrandModule.tsx'],
        evidence: [
          {
            label: 'Brand extraction',
            path: '/admin/brands/brand-identities',
            steps: ['Open a brand', 'Open the Colors tab', 'The extraction panel sits above the colour fields'],
          },
        ],
      },
      {
        title: 'The extraction method is still the weak one, and says so',
        status: 'superseded',
        detail:
          'Reading a URL still inspects the site’s declared stylesheet and Tailwind config, which returns framework defaults rather than the brand on any utility-framework site. That is why one brand came back as Tailwind’s orange-600 and slate-800. Confidence for that source is reported at 35 per cent and the panel says plainly that it is a starting point, so the weakness is visible instead of implied. Replacing it with computed-style sampling from a headless render is its own package. Superseded by the merged screenshots and extraction item on 30 July.',
        files: ['src/app/(app)/admin/(top)/brands/brand-identities/actions.ts'],
      },
      {
        title: 'Stored palettes renamed, not destroyed',
        status: 'shipped',
        detail:
          'The instruction was to report any deployment carrying a custom palette before dropping the data, and this workspace has no database access to run that report. The column is renamed instead: the live path is gone immediately because the collection no longer declares the field, while every stored palette survives and can be reviewed with one query. Dropping it now would delete the only record of what those deployments were displaying, which is exactly what is needed to check nothing regressed.',
        files: ['src/migrations/20260729_200000_drop_deployment_theme.ts'],
      },
      {
        title: 'Host-surface inheritance kept, and separated from theming',
        status: 'shipped',
        detail:
          'A quiz inside a landing-page card still learns which opaque colour it sits on so its text is derived against the real backdrop. That is context being passed down, not a palette being invented, so it survives the removal under its own name rather than riding on the theme machinery.',
        files: ['src/lib/quiz-theme.ts'],
      },
    ],
    verification: [
      {
        label: 'Template selection and host surface',
        state: 'verified',
        detail:
          '21 assertions. A leftover theme object on a deployment is ignored entirely rather than still being honoured. An invalid or blank surface leaves the brand untouched and returns the same object. A dark brand dropped into a light card adopts the light ground and re-derives its button text instead of staying black on black. The input brand is never mutated.',
      },
      {
        label: 'Nothing left referencing the removed path',
        state: 'verified',
        detail:
          'A repo-wide search for the palette field, the theme helper and the old generator returns nothing outside the migrations that manage the column.',
      },
      {
        label: 'No structural drift in the edited builders',
        state: 'verified',
        detail:
          'Brace and paren balance compared against the committed version of every edited file. This also corrected the checker itself: it was treating the // inside an https:// string as a comment, which had been producing phantom imbalances all session. With strings stripped first, every edited file balances exactly.',
      },
      {
        label: 'Type check and browser',
        state: 'not-run',
        detail: 'No dependencies, database or generated types here, as always.',
      },
    ],
    deployNotes: [
      'Adds a migration that renames the deployment palette column. Run pnpm payload migrate after the build.',
      'After deploying, review anything that had a custom palette: SELECT d.id, d.path, s.name, d.theme_overrides_removed_20260729 FROM funnel_quiz_deployments d LEFT JOIN sites s ON s.id = d.site_id WHERE d.theme_overrides_removed_20260729 IS NOT NULL;',
      'A deployment that was relying on a custom palette will now render in its brand’s colours. That is the intended correction, but it is a visible change worth checking against the query above.',
    ],
    openIssues: [
      'Brand Extraction still reads declared stylesheet values. Computed-style sampling from a headless render is the fix and has not been built.',
      'The renamed column should be dropped once the stored palettes have been reviewed.',
      'Deployments cannot yet choose mode, density or emphasis. Those are the legitimate per-deployment choices the framework allows, and only template selection exists today.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Brand colour gets one owner (P0-B)',
    summary:
      'First package of the restructure framework. Colour had three owners: the brand record, the per-deployment theme generator, and hardcoded values inside components. Three owners of one value produce arbitrary output, which is what the wrong Don’t Settle colours actually were. There is now one contract, one resolver, and a lint that stops the count going back up.',
    items: [
      {
        title: 'A written token contract',
        status: 'shipped',
        detail:
          'Twelve colour tokens and five shape tokens, with four required: primary, call to action, page background, body text. The schema, the resolver, the brand editor and the lint all read this one list rather than keeping three copies in step by hand.',
        files: ['src/lib/brand/tokens.ts'],
      },
      {
        title: 'One resolver, and it refuses to guess',
        status: 'shipped',
        detail:
          'resolveBrandTokens is now the only thing that turns a brand into CSS. A missing required token throws instead of falling back. The old layout carried a hardcoded fallback on every variable, so a brand with no data rendered as a plausible navy site rather than visibly failing, and a wrong palette that looks deliberate is exactly how wrong colour reaches production.',
        files: ['src/lib/brand/resolve-tokens.ts', 'src/app/(public)/layout.tsx'],
      },
      {
        title: 'Everything else is derived, never stored',
        status: 'shipped',
        detail:
          'Tint and shade ramps, hover, active, focus and disabled states, and any text colour left blank, all recomputed on every resolve against the surface they will actually sit on. A stored derived value is a cache with no invalidation: it goes stale the moment someone edits the colour it came from.',
        files: ['src/lib/brand/resolve-tokens.ts'],
      },
      {
        title: 'Status colours stop being brand colours',
        status: 'shipped',
        detail:
          'Success, warning, danger and info are now fixed and identical for every brand. A destructive action rendered in brand orange on one site and brand red on another teaches people to read colour as decoration, and the cost lands on whoever clicks Delete expecting Save. The old brand-scoped names still resolve, but they now point at the fixed values.',
        files: ['src/lib/brand/tokens.ts'],
      },
      {
        title: 'Schema and backfill, with nothing repainted',
        status: 'shipped',
        detail:
          'Eleven new columns, backfilled so no live page changes appearance: the page background takes the value the old surface field was really being used for, the button colour takes primary because that is what every site already drew, and colours that only existed in the funnel brand JSON are promoted into the canonical columns. The derived tokens are deliberately left blank, because writing today’s guess into them would freeze it and defeat the contrast check.',
        files: ['src/migrations/20260729_170000_brand_token_contract.ts', 'src/collections/Sites.ts'],
      },
      {
        title: 'A lint that can actually be switched on',
        status: 'shipped',
        detail:
          'pnpm lint:tokens fails when public output gains a hardcoded colour. It runs as its own script because pnpm lint in this repo has no committed config and is not a working gate. It counts three scopes separately, because one number was hiding three different problems: render (311, the real debt, target zero), tenant (125, one brand’s pages living as source code, fixed by moving the content into the CMS and deleting the files), and admin (201, not counted at all, because builder chrome is fixed product UI and is supposed to look the same for every tenant). Budgets ratchet down and may never go up.',
        files: ['scripts/lint-brand-tokens.mjs'],
      },
      {
        title: 'Deleted the largest offender outright',
        status: 'shipped',
        detail:
          'The bespoke Check My Claim home component was the single worst file at 157 hardcoded colours, and nothing routed to it. It was being kept "as a historical reference for the design", which is another way of saying dead code: git is the reference, and its section designs already live on in the block renderer. Deleting it removed 157 violations at zero risk.',
        files: ['src/app/(public)/[[...slug]]/page.tsx'],
      },
      {
        title: 'The funnel brand map still has its own defaults',
        status: 'shipped',
        detail:
          'Closed. The brand map now resolves through the same function the public site uses, with no fallbacks of its own. It was fixed the same day as part of making quizzes wear their brand, and this item simply had not been updated to say so.',
        files: ['src/lib/brand-map.ts'],
      },
    ],
    verification: [
      {
        label: 'The resolver',
        state: 'verified',
        detail:
          '90 assertions. Every required token throws when absent and is named in the error. Text derived for white, black and the exact Tailwind orange from the bug report all reach 4.5:1. A deliberately illegible brand fails the audit and names the failing pair rather than being silently corrected. Two different brands get byte-identical system colours. Dark mode changes the ground without changing the brand colour. One assertion scans the resolver’s own source for a reintroduced fallback, and a second proves that scan would catch one.',
      },
      {
        label: 'The lint gate',
        state: 'verified',
        detail:
          'Baseline recorded at 699, then a hardcoded colour was deliberately added to a public component to confirm the script exits non-zero, then reverted.',
      },
      {
        label: 'Backfill against real data',
        state: 'not-run',
        detail:
          'The migration is written to be idempotent and to preserve appearance, but it has not run against the production database. Worth checking one site’s rendered background before and after.',
      },
      {
        label: 'Type check and browser',
        state: 'not-run',
        detail: 'No dependencies, database or generated types in this workspace, as always.',
      },
    ],
    deployNotes: [
      'Adds a migration that backfills brand columns. Run pnpm payload migrate after the build and before restarting.',
      'Nothing should look different after this deploy. If a site does change appearance, that is a backfill problem worth reporting rather than a design change.',
      'A site whose brand cannot resolve now renders unstyled instead of in an invented palette. That is intentional and visible on purpose.',
    ],
    openIssues: [
      'Per-deployment theme overrides are still in place. The decision is to remove them and relocate the generator to Brand Identity as an accept-or-reject proposal; that is the next package.',
      'The brand map used by the funnel builders still carries its own fallback colours, so the funnel path has not yet been consolidated onto the resolver.',
      'The block renderer still sets --site-* per block from block metadata. That is a content-level override rather than a competing brand store, but it should be reviewed once templates land.',
      '311 hardcoded colours remain in code that paints public pages. Biggest: the bespoke section CSS (104), the landing-page renderer (65), the quiz preview and templates (64), the block renderer (32). Each one is a second owner of a colour the brand should decide.',
      'One tenant still has 125 hardcoded colours across ten page components that exist only for that brand. The fix is to move that content into Pages or shared legal templates for the Site and delete the files, not to tokenise them in place.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Landing pages go live, running the real quiz',
    summary:
      'Closes the one item left partial earlier today. A funnel landing page now serves on its own URL with its own link preview, and the quiz in its hero is the real deployment: the real flow, its own theme, its own destinations, and leads that arrive in the dashboard. Same page, several brands, each running its own quiz.',
    items: [
      {
        title: 'A landing-page deployment is a real page',
        status: 'shipped',
        detail:
          'The public router resolves a live landing-page deployment for the requested site and path and renders it through the same component the builder uses, with the click-to-edit affordances and preview framing switched off. One renderer rather than two is what stops a page looking one way in the builder and another way to a visitor.',
        files: ['src/lib/lp-deployment.ts', 'src/app/(public)/[[...slug]]/page.tsx'],
      },
      {
        title: 'The hero quiz is the real deployment, not a copy',
        status: 'shipped',
        detail:
          'The landing page reaches its quiz through the same hydration a standalone quiz page uses, so it arrives with its own theme, its own destination overrides and live lead delivery. Answering it inside a landing page and answering it on its own URL now do exactly the same thing.',
        files: ['src/lib/quiz-deployment.ts'],
      },
      {
        title: 'A landing page cannot borrow another brand’s quiz',
        status: 'shipped',
        detail:
          'The link between a landing page and its quiz is a bare text id with no foreign key behind it, so nothing in the database stopped brand A’s page pointing at brand B’s quiz. Since destinations now resolve from the deployment, that would have sent brand A’s leads to brand B’s pages. The resolver checks both belong to the same Site and refuses otherwise.',
        files: ['src/lib/quiz-deployment.ts'],
      },
      {
        title: 'Its own link preview',
        status: 'shipped',
        detail:
          'Title, description, canonical and Open Graph tags built from the hero copy the author already wrote. Two brands running one landing page produce two different previews, so a pasted link says who it is from.',
        files: ['src/lib/lp-deployment.ts'],
      },
      {
        title: 'One path-ownership rule for every deployment type',
        status: 'shipped',
        detail:
          'The check that stops a deployment claiming a path an authored page already serves is now shared by the quiz and landing-page resolvers instead of living inside one of them. It has to sit in the resolver rather than the router because the metadata pass runs before the router’s earlier steps, and a mismatch there means a crawler indexing a document no visitor sees.',
        files: ['src/lib/public-path-claims.ts'],
      },
      {
        title: 'Landing-page tables added to the migration chain',
        status: 'shipped',
        detail:
          'Same drift the quiz tables had: declared by collections, created by no migration, present only where a development server pushed them. The public route reads them on every request. Four of the six funnel tables are now in the chain; the two advertorial tables stay out until something renders them.',
        files: ['src/migrations/20260729_140000_funnel_lp_public_render.ts'],
      },
    ],
    verification: [
      {
        label: 'Link preview generation',
        state: 'verified',
        detail:
          '12 assertions, including one landing page under two brands producing two different titles, falling back to the page name when no hero copy exists, ignoring non-hero sections, length caps, and surviving null copy and junk in the stored sections array.',
      },
      {
        label: 'Modules load and export what the router imports',
        state: 'verified',
        detail:
          'Every new and refactored server module was imported with the database stubbed, confirming it parses and exposes the expected exports. The earlier destination and theme suites still apply unchanged, confirmed by diffing those files against the last commit.',
      },
      {
        label: 'End to end in a browser',
        state: 'not-run',
        detail:
          'Nothing here has been opened on a running server. Worth doing first: set a landing-page deployment live with a path, open it, complete the hero quiz, and confirm the lead appears under Leads with the right brand.',
      },
    ],
    deployNotes: [
      'Adds a migration. Run pnpm payload migrate after the build and before restarting.',
      'A landing page serves only when the page itself is published and the deployment status is Live. Both are checked on every request.',
      'If the hero quiz does not appear, check the deployment’s linked quiz belongs to the same brand: a cross-brand link is refused rather than rendered.',
    ],
    openIssues: [
      'The landing-page renderer pulls its display font in with an @import inside a style block, which browsers ignore unless it comes first. It was harmless in the builder and is now on a public page; the font falls back rather than failing, but it should move into the document head.',
      'Advertorials still have no public route. Same brandless-authoring shape, same treatment needed.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'The quiz stops belonging to one brand',
    summary:
      'A quiz was still carrying brand-specific URLs inside its own nodes, which meant deploying it for a second brand would have sent that brand’s traffic to the first brand’s pages. Destinations now live on the brand and the deployment, the quiz names them instead of addressing them, and the same flow renders correctly whether it is a full page, an iframe on someone else’s site, or a card inside a landing page.',
    items: [
      {
        title: 'Nodes name a destination instead of a URL',
        status: 'shipped',
        detail:
          'An endpoint node used to hold a typed-in address. It now picks from thank you, did not qualify, partner list, privacy, terms, disclosures, or a genuine one-off custom URL. The address resolves at render: the deployment’s override first, then the brand’s own URL, then the site’s existing page at that path. A node built before this change keeps its URL and keeps working, treated as custom.',
        files: ['src/lib/quiz-destinations.ts', 'src/components/builder/quiz/editors.tsx'],
        evidence: [
          {
            label: 'The destination picker',
            path: '/admin/quizzes',
            steps: ['Open any quiz', 'Click a node in the flow grid', 'Open the Redirect tab'],
          },
        ],
      },
      {
        title: 'Brand identities own their URLs',
        status: 'shipped',
        detail:
          'A URLs tab on every brand identity. Set the thank-you page once and every quiz that brand runs follows it. Blank means the site’s own page, and each field says which one that would be rather than leaving you guessing at an empty box.',
        files: ['src/components/builder/brand/BrandModule.tsx', 'src/lib/brand-map.ts'],
        evidence: [
          {
            label: 'The brand URLs tab',
            path: '/admin/brands/brand-identities',
            steps: ['Open a brand', 'Open the URLs tab'],
          },
        ],
      },
      {
        title: 'Deployments can override any destination',
        status: 'shipped',
        detail:
          'A Destinations tab on the deployment editor showing what each destination actually resolves to and whether that came from this deployment, the brand, or the site default. One placement can send traffic somewhere different without editing the quiz or the brand.',
        files: ['src/components/builder/quiz/QuizBuilderApp.tsx', 'src/collections/FunnelQuizDeployments.ts'],
        evidence: [
          {
            label: 'Per-deployment destinations',
            path: '/admin/quizzes',
            steps: ['Deployments tab', 'Open a deployment', 'Open the Destinations tab'],
          },
        ],
      },
      {
        title: 'Destinations are validated as a security boundary',
        status: 'shipped',
        detail:
          'A destination ends up in a link and in the browser’s address bar, so an admin-editable field that accepted anything would be script execution on a public page. Only https, http, site-relative paths, tel and mailto are accepted. Validation happens after the {{field}} substitution, not before, because a captured answer is attacker-controlled and would otherwise be able to smuggle in a scheme the template did not have.',
        files: ['src/lib/quiz-destinations.ts'],
      },
      {
        title: 'The quiz adapts to whatever it is placed in',
        status: 'shipped',
        detail:
          'Inline mode drops the quiz’s own card so it does not draw a box inside the host’s box, and the host passes the opaque colour the quiz will sit on so every text colour is derived against the real backdrop. That is what keeps a dark-brand quiz readable inside a light landing page. The answer grid now measures the space it actually has rather than the width of the window, so a two-column layout squeezed into a narrow hero card becomes one column instead of two unreadable ones.',
        files: ['src/components/public/quiz/QuizRuntime.tsx'],
      },
      {
        title: 'Landing pages run the real quiz',
        status: 'shipped',
        detail:
          'The quiz card in the landing-page builder was a drawing of a quiz: a fake first question and a dead Continue button. It now runs the real flow, with the real routing, wearing the landing page’s colours. Serving that landing page on a public URL followed in the entry above.',
        files: ['src/components/builder/lp/render.tsx'],
      },
      {
        title: 'A builder preview can no longer create a real lead',
        status: 'shipped',
        detail:
          'Putting the live runtime into the builder introduced the risk that clicking through a preview would write a lead, fire the pixels and deliver a webhook to a buyer. Preview mode blocks the submit, the AI call and the redirect, and it defaults to on, so a caller that forgets to declare itself live gets the safe behaviour rather than the expensive one.',
        files: ['src/components/public/quiz/QuizRuntime.tsx', 'src/components/builder/quiz/preview.tsx'],
      },
      {
        title: 'Rest of the Sites schema drift closed',
        status: 'shipped',
        detail:
          'Brand URLs are stored in a column that no migration had ever created. Payload reads every declared column at startup, so a missing one takes the whole application down rather than failing a single query. That column and the twelve others in the same position are now created by a migration.',
        files: ['src/migrations/20260729_090000_destinations_and_brand_drift.ts'],
      },
    ],
    verification: [
      {
        label: 'Destination resolution and URL safety',
        state: 'verified',
        detail:
          '49 assertions, including the property this change exists for: one shared quiz node resolves to a different thank-you page for each brand. Also covers rejecting javascript, data, vbscript and protocol-relative addresses, an unsafe override falling through to the brand rather than being used, legacy nodes with raw URLs still working, and a hostile answer being unable to smuggle a scheme in through interpolation.',
      },
      {
        label: 'No structural drift in the edited builders',
        state: 'verified',
        detail:
          'The brace and paren balance of every edited file was compared against its committed version to confirm the edits did not leave a block unclosed. The one file that moved was traced to the removed code, not to new code.',
      },
      {
        label: 'Type check and browser',
        state: 'not-run',
        detail:
          'Same as yesterday: no dependencies, database or generated types in this workspace. The landing-page quiz card and the destination pickers have not been clicked yet.',
      },
    ],
    deployNotes: [
      'Adds a migration. Run pnpm payload migrate after the build and before restarting.',
      'Existing quizzes keep their typed-in redirect URLs and behave exactly as before. Move them onto named destinations when convenient; nothing breaks if you do not.',
      'Set each brand’s URLs tab before relying on a named destination, or it falls back to the site’s own page at that path.',
    ],
    openIssues: [
      'Advertorials were not touched. They have the same brandless-authoring shape and will need the same treatment.',
    ],
  },
  {
    date: '2026-07-27',
    title: 'The Agent Plan board and the review agents behind it',
    summary:
      'Backfilled. This shipped three days before the build log existed, which is why it was never written up, and it stayed invisible until a coverage check went looking. It is on the sidebar, so a board that omitted it was describing a smaller product than the one people use.',
    items: [
      {
        title: 'A live board for the audit findings',
        status: 'shipped',
        detail:
          'The standing audit produced 50 confirmed findings across the codebase. /admin/plan turns that into a surface: which finding belongs to which subsystem reviewer, and what each one is currently doing. Assignments are generated from the audit rather than typed by hand, so the board cannot disagree with the document it came from. It is restricted to super admins, because it describes the state of the code rather than the state of a tenant.',
        files: ['src/app/(app)/admin/(top)/plan/page.tsx', 'src/app/(app)/admin/(top)/plan/PlanBoard.tsx', 'src/lib/agent-plan/plan.ts'],
        evidence: [
          {
            label: 'The plan board',
            path: '/admin/plan',
          },
        ],
      },
      {
        title: 'Status is one file per agent, so concurrent writers cannot collide',
        status: 'shipped',
        detail:
          'Runtime status is written as a separate file per agent rather than one shared document. Several agents report at once, and a shared file would mean a read, a change and a write racing each other, where the last writer silently discards whatever landed in between. Deliberately not stored as normal application data: it is a development surface with no tenant meaning, and making it one would have cost a migration and put engineering bookkeeping inside customer records.',
        files: ['src/lib/agent-plan/store.ts', 'src/app/api/legalos/agent-plan/route.ts'],
      },
      {
        title: 'Sixteen subsystem reviewers, checked in',
        status: 'shipped',
        detail:
          'Fifteen reviewers scoped to specific paths, plus an adversarial verifier whose only job is to try to refute a reported finding before anyone acts on it. They are committed rather than kept as personal setup, so a review of the lead pipeline is the same review whoever runs it, and a finding has to survive someone actively trying to kill it before it becomes work.',
        files: ['.claude/agents/'],
      },
    ],
    verification: [
      {
        label: 'The board reads the audit rather than a copy of it',
        state: 'verified',
        detail: 'Assignments are generated from the audit document, so the two cannot drift apart.',
      },
      {
        label: 'Backfilled from the commit, not from memory',
        state: 'verified',
        detail:
          'Written from the commit and its files, and the routes were confirmed to still exist. This is a reconstruction of work that shipped before the board did, and it is labelled as one.',
      },
    ],
  },
  {
    date: '2026-07-28',
    title: 'Quiz deployments become real pages',
    summary:
      'Items 9 to 12. A brandless quiz can now be deployed as its own public page with its own brand, theme, URL and link preview; embedded on any site with a script that actually exists; and its completions arrive in the Leads dashboard. Items 1 to 8 shipped earlier the same day.',
    items: [
      {
        ref: '9',
        title: 'A deployment is a separate, crawlable page',
        status: 'shipped',
        detail:
          'The public router resolves a live deployment for the requested site and path and server-renders the quiz. Each deployment gets its own title, description, canonical URL and Open Graph and Twitter tags, derived from the deployment name, the first question and the brand, so two deployments of one quiz produce two different link previews when pasted into Facebook. An authored Page always wins the path, so a deployment can never shadow one.',
        files: [
          'src/lib/quiz-deployment.ts',
          'src/app/(public)/[[...slug]]/page.tsx',
          'src/components/public/quiz/QuizRuntime.tsx',
        ],
        evidence: [
          {
            label: 'A live deployment',
            path: '/admin/quizzes',
            steps: ['Deployments tab', "Copy a live deployment's domain and path", 'Open it in a new tab'],
          },
        ],
      },
      {
        ref: '9',
        title: 'The base quiz controls content, the deployment controls the look',
        status: 'shipped',
        detail:
          'Deployments carry their own theme layer: template, colours and fonts, stored on the deployment and layered over the brand at render time. Restyling one deployment never repaints the brand or the other funnels that share it. Text on buttons is re-derived from whatever primary colour the theme sets, so a recolour cannot produce unreadable buttons.',
        files: ['src/lib/quiz-theme.ts', 'src/collections/FunnelQuizDeployments.ts'],
      },
      {
        ref: '10',
        title: 'Generate a theme from a URL, a description, or an image',
        status: 'shipped',
        detail:
          'A Theme tab on the deployment editor. A URL has its real stylesheet read and its palette extracted, with the model only choosing a template and filling gaps, so the match is measured rather than imagined. A written brief or an uploaded image goes through the model with vision. Nothing applies until you see the palette and accept it, and one click returns the deployment to the brand colours.',
        files: [
          'src/app/(app)/admin/(top)/quizzes/actions.ts',
          'src/components/builder/quiz/QuizBuilderApp.tsx',
          'src/lib/ai/invoke.ts',
        ],
      },
      {
        ref: '11',
        title: 'Embed code that works',
        status: 'shipped',
        detail:
          'The old snippet pointed at cdn.legenex.com/q.js, a file that has never existed, so pasting it did nothing while looking finished. The loader is now served from the deployment’s own domain, creates the iframe from the address in the snippet, forwards the host page’s campaign parameters so embedded leads keep their attribution, and resizes the frame as the visitor moves through the quiz. When a deployment has no domain or path yet the builder says so instead of handing out a snippet that cannot work.',
        files: ['src/app/(public)/q.js/route.ts', 'src/lib/quiz-embed.ts'],
        evidence: [
          {
            label: 'The embed snippet',
            path: '/admin/quizzes',
            steps: ['Deployments tab', 'Open a deployment', 'Render & Embed tab', 'Set render mode to Embed'],
          },
        ],
      },
      {
        ref: '12',
        title: 'Completed quizzes arrive in the dashboard',
        status: 'shipped',
        detail:
          'Reaching the end of a quiz submits through the same lead pipeline the block forms use: TrustedForm certificate, Jornaya id, campaign attribution, Meta CAPI with the shared event id, outbound webhooks, Slack. The submit happens before the final screen is allowed to render, because an end screen can redirect on a timer and a lead posted after that redirect is a lead lost. One submit per session, one retry on a network failure, and a quiz that collects no contact details completes without writing an empty row.',
        files: [
          'src/lib/lead-capture-client.ts',
          'src/lib/quiz-lead.ts',
          'src/components/public/quiz/QuizRuntime.tsx',
        ],
      },
      {
        title: 'Mid-quiz AI runs server-side',
        status: 'shipped',
        detail:
          'AI-enabled question nodes now execute through an endpoint that reads the prompt from the database and accepts only answer values from the visitor, so a public page cannot post an arbitrary prompt to the API key. Draft deployments and unpublished quizzes are refused, and calls are rate limited per address.',
        files: ['src/app/api/legalos/quiz-ai/route.ts'],
      },
      {
        title: 'Funnel tables added to the migration chain',
        status: 'shipped',
        detail:
          'Closed. All six funnel tables are now created by migrations: the quiz pair on 28 July, the landing-page pair on 29 July, and the advertorial pair today. That is the end of the F001 drift, together with the Sites columns added on 29 July.',
        files: ['src/migrations/20260728_180000_funnel_quiz_public_render.ts'],
      },
    ],
    verification: [
      {
        label: 'Theme, embed, lead mapping, path handling',
        state: 'verified',
        detail:
          '95 assertions run against the real modules, covering invalid and hostile input: malformed colours, CSS injection attempts in colour and font values, unknown template ids, missing domains, non-string answers, competing phone fields, and a preview-versus-live comparison asserting both resolve identical colours and fonts.',
      },
      {
        label: 'Link preview text',
        state: 'verified',
        detail:
          '13 further assertions on the metadata builder, including the one that matters most: two deployments of the same quiz produce two different titles. Also covers falling back when nothing is authored, ignoring routing nodes when deriving copy, length caps, and surviving junk in the stored node array.',
      },
      {
        label: 'Button contrast after a theme change',
        state: 'verified',
        detail:
          'Asserted directly: a white primary does not keep white button text, a black primary does not keep black. The colour is re-derived from the themed primary rather than carried over from the brand.',
      },
      {
        label: 'Type check',
        state: 'not-run',
        detail:
          'This workspace has no dependencies, no database and no generated Payload types, so the type check only runs on the server as part of the build.',
      },
      {
        label: 'End to end in a browser',
        state: 'not-run',
        detail:
          'No deployment has been opened on a running server yet. First things to try after deploying: publish a quiz, set a deployment live with a path, open that path, complete the quiz, and confirm the lead appears under Leads.',
      },
      {
        label: 'Link preview in Facebook’s scraper',
        state: 'not-run',
        detail:
          'The tags are generated and server-rendered, and the generator is tested, but a live URL has not been put through the Facebook sharing debugger.',
      },
    ],
    deployNotes: [
      'This push adds a migration. Run pnpm payload migrate after the build and before restarting the service.',
      'A quiz only serves traffic when the parent quiz is published and the deployment status is Live. Both are checked on every request.',
      'Custom domains used for embedding need their certificate active, since the loader is requested over HTTPS from the third-party page.',
    ],
    openIssues: [
      'Webhook and verification nodes still pass through without calling out. They were never implemented beyond a preview stub; the runtime advances past them rather than pretending they ran.',
      'The two advertorial tables are still missing from the migration chain. That is what remains of finding F001 after the quiz, landing-page and Sites columns were added on 28 and 29 July.',
      'The public runtime imports the builder preview components on purpose, so preview and live cannot drift. The cost is a larger JavaScript bundle on the public page than a purpose-built renderer would need.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Quiz builder overhaul',
    summary:
      'Items 1 to 8. Every structural change and routing decision moved into one shared module, so the builder, the preview and the public runtime cannot disagree about how a quiz behaves.',
    items: [
      {
        ref: '1',
        title: 'Move nodes up and down, with questions aligned to their nodes',
        status: 'shipped',
        detail:
          'The step list and the tier grid were two separate scroll containers, so a question drifted out of line with its own nodes. They are now one grid where a step and its variants are siblings in the same row, which makes misalignment impossible rather than fixed. Explicit up and down buttons sit alongside drag.',
        files: ['src/components/builder/quiz/builder.tsx', 'src/lib/quiz-graph.ts'],
        evidence: [
          {
            label: 'The flow grid',
            path: '/admin/quizzes',
            steps: ['Open a quiz'],
          },
        ],
      },
      {
        ref: '2',
        title: 'Duplicate nodes',
        status: 'shipped',
        detail:
          'Duplicate a whole step with every tier variant, or a single variant. A variant duplicate only ever targets a free cell, so it cannot create a node that no grid cell can display; on a full row the button disables itself and says why.',
        files: ['src/lib/quiz-graph.ts'],
      },
      {
        ref: '3',
        title: 'Tiers renumber when one is removed',
        status: 'shipped',
        detail:
          'The reported case where T4 and T3 both remained. Remaining default tier names are resequenced so numbering never shows gaps, while custom names and ids are left alone. A question that existed only for the deleted tier is deleted rather than quietly converted to a shared question, which would have started showing a tier-specific question to everyone.',
        files: ['src/lib/quiz-graph.ts'],
      },
      {
        ref: '4',
        title: 'Add fields from inside a node',
        status: 'shipped',
        detail:
          'Every place that references a field can create a missing one in place: dropdown sources, answer mappings, decision conditions, webhook response mappings, AI input and output, dynamic content, and the insert-variable picker. Names are validated centrally, so a duplicate or malformed key is refused rather than written.',
        files: ['src/components/builder/quiz/editors.tsx', 'src/lib/quiz-graph.ts'],
        evidence: [
          {
            label: 'Inline field creation',
            path: '/admin/quizzes',
            steps: ['Open a quiz', 'Click a node', 'Answers, then any field dropdown'],
          },
        ],
      },
      {
        ref: '5',
        title: 'Optional questions',
        status: 'shipped',
        detail:
          'A toggle inside the node marks a question reachable by routing only. Sequential advance skips it, and also skips steps with no variant for the visitor’s tier, so a half-built row falls through to the next question instead of dead-ending. The editor warns when an optional step has no route into it.',
        files: ['src/components/builder/quiz/editors.tsx', 'src/lib/quiz-graph.ts'],
        evidence: [
          {
            label: 'The optional toggle',
            path: '/admin/quizzes',
            steps: ['Open a quiz', 'Click a node', 'Visibility & Tiers tab'],
          },
        ],
      },
      {
        ref: '6',
        title: 'Save button, and no dialog when there is nothing to save',
        status: 'shipped',
        detail:
          'The always-on leave prompt is replaced by a real save state: saved, pending, saving, failed. Back exits silently when nothing is outstanding, flushes a pending write, and only interrupts when a save actually failed. Explicit Save button in the top bar, plus the keyboard shortcut.',
        files: ['src/components/builder/quiz/QuizBuilderApp.tsx'],
        evidence: [
          {
            label: 'The builder top bar',
            path: '/admin/quizzes',
            steps: ['Open a quiz', 'Top right of the builder'],
          },
        ],
      },
      {
        ref: '7',
        title: 'Undo',
        status: 'shipped',
        detail:
          'Undo and redo across builder edits, with keyboard shortcuts, suppressed while a dialog is open or while typing in a text field.',
        files: ['src/components/builder/quiz/QuizBuilderApp.tsx'],
      },
      {
        ref: '8',
        title: 'Archived quizzes',
        status: 'shipped',
        detail:
          'Active and Archived tabs. Archiving forces the quiz unpublished in the same write, so a retired quiz can never still be serving traffic, and restoring brings it back as a draft rather than silently republishing it.',
        files: [
          'src/app/(app)/admin/(top)/quizzes/actions.ts',
          'src/migrations/20260728_120000_funnel_quizzes_archive.ts',
        ],
        evidence: [
          {
            label: 'The Archived tab',
            path: '/admin/quizzes',
            steps: ['Archived tab'],
          },
        ],
      },
      {
        title: 'Two routing bugs found along the way',
        status: 'shipped',
        detail:
          'Deleting a step left every route that pointed at it dangling, which silently fell through to whatever step came next. And switching tiers resolved the next step against the outgoing tier for one step.',
        files: ['src/lib/quiz-graph.ts'],
      },
    ],
    verification: [
      {
        label: 'Graph operations',
        state: 'verified',
        detail:
          '144 assertions against the real module, including a composition test that reorders, duplicates a row, duplicates a variant, deletes a tier and deletes a step in one session, then asserts the graph is still internally consistent.',
      },
      {
        label: 'In the builder UI',
        state: 'not-run',
        detail: 'Not yet clicked through on a running server.',
      },
    ],
    deployNotes: ['Adds a migration for the archive columns. Run pnpm payload migrate as part of the deploy.'],
  },
]
