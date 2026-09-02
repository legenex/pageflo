/**
 * The operator handbook: what every page in PageFlo is for, how to use it, and
 * what it does underneath.
 *
 * Written as data rather than prose in a component so the page can group,
 * count and cross-link it, and so a route that is documented but does not exist
 * is a one-line fix rather than a hunt through JSX.
 *
 * Two rules govern the content:
 *
 * 1. `status` is honest. Six admin routes render a "Coming soon" placeholder,
 *    including Leads, which is in the main sidebar. Documenting those as
 *    working would send someone to a screen that cannot do what they were told
 *    it does, which is worse than no documentation.
 *
 * 2. Every page says how it WORKS, not only how to click it. Most of the
 *    surprises in this system are mechanical: a host cache with a 60 second
 *    TTL, a lead pipeline that runs inside the request, a Site delete that
 *    takes its leads with it. Someone who knows the mechanism can predict the
 *    behaviour; someone who only knows the buttons cannot.
 */

export type PageStatus = 'working' | 'partial' | 'placeholder'

export const STATUS_LABEL: Record<PageStatus, string> = {
  working: 'Working',
  partial: 'Partly built',
  placeholder: 'Not built yet',
}

export type HandbookPage = {
  /** The real route. Rendered as a link, so it must exist. */
  route: string
  /**
   * What to SHOW when the real route needs an id you do not have yet.
   *
   * Everything under a Site lives at /admin/sites/<slug>/..., which cannot be
   * linked without picking a Site first. Showing the pattern and linking to the
   * list is honest about both: the reader learns the real shape of the URL and
   * still gets somewhere useful by clicking.
   */
  pattern?: string
  title: string
  status: PageStatus
  /** One line: what this screen is for. */
  purpose: string
  /** How to use it, in the order you would actually do it. */
  use: string[]
  /** What happens underneath when you do. */
  mechanism: string[]
  /** Things that will surprise you if nobody says them. */
  watchOut?: string[]
}

export type HandbookSection = {
  id: string
  title: string
  blurb: string
  pages: HandbookPage[]
}

/** A term you have to know before the screens make sense. */
export type HandbookConcept = { term: string; meaning: string }

export const CONCEPTS: HandbookConcept[] = [
  {
    term: 'Site',
    meaning:
      'One brand, and the root of everything. Pages, blog posts, quizzes, landing pages, phone numbers, leads and tracking config all belong to exactly one Site. Almost every access rule in the system is a filter on this relationship, so "which Site is this?" is the first question the app asks about any record.',
  },
  {
    term: 'Brand identity',
    meaning:
      'The colours, fonts, logo, contact details and legal URLs a Site renders with. Stored on the Site, edited on Brand Identities. Content does not carry its own colours; it asks the brand at render time, which is what lets one quiz run under several brands.',
  },
  {
    term: 'Domain',
    meaning:
      'A hostname pointed at a Site. A Site can have several. One is primary, which is the one used when the app has to name itself. Resolution goes host header, then Domain, then Site.',
  },
  {
    term: 'Brandless authoring',
    meaning:
      'Quizzes, landing pages and advertorials are written with no brand attached. They hold the questions, the copy and the flow. Nothing in them says what colour anything is.',
  },
  {
    term: 'Deployment',
    meaning:
      'The record that binds one brandless piece of content to a Site, a Domain and a path, and carries the tracking config for that placement. This is the thing that is actually live at a URL. Editing the content changes every deployment of it at once, which is the point.',
  },
  {
    term: 'Token',
    meaning:
      'A named brand value like primary, cta, bg, surface or ink. Templates ask for tokens, never for hex codes. Text colours are derived from the surface they sit on and checked for contrast, which is what makes white text on a white card unreachable rather than merely unlikely.',
  },
  {
    term: 'Shared legal template',
    meaning:
      'A privacy policy, terms page, TCPA notice and so on, written once for all Sites with {{site.name}} style variables filled in per Site at render. Editing one changes every Site that has not overridden it, so the editor shows the affected list before saving.',
  },
  {
    term: 'Preview domain',
    meaning:
      'Every Site gets one automatically at slug.preview.legenex.com. It stays primary until a custom domain verifies, and it cannot be deleted from the UI. Be aware that it does NOT make a new Site viewable: a Site is created in draft, and the public route returns 404 for a draft Site on every path including its preview domain. Set the Site to Active, or sign in and add ?preview=1, before expecting to see anything.',
  },
]

/** The order to do things in on a brand new brand. */
export const FIRST_RUN: Array<{ step: string; route: string; detail: string }> = [
  {
    step: 'Create the Site',
    route: '/admin/sites',
    detail:
      'Name it and pick a vertical. It is not born empty: a home page, a qualifying quiz and a landing page are seeded from the vertical, themed by the brand tokens at render. A preview domain is issued at the same time. The Site is created in DRAFT, which means every one of its URLs returns 404 until you set it Active, so do that as soon as you want to look at it.',
  },
  {
    step: 'Give it a brand',
    route: '/admin/brands/brand-identities',
    detail:
      'Read the brand off an existing URL, a written description or a logo image. Check the proposal, then accept it. Nothing publishes until the contrast audit passes, so do this before building pages rather than after.',
  },
  {
    step: 'Connect a domain',
    route: '/admin/brands/domains',
    detail:
      'Point the DNS, then verify. The app registers the domain with Plesk, sets the reverse proxy, and issues a certificate. It stays provisioning until a real HTTPS handshake succeeds.',
  },
  {
    step: 'Build the funnel',
    route: '/admin/quizzes',
    detail:
      'Write the quiz once with no brand on it, then create a deployment binding it to this Site, this domain and a path. Repeat for a landing page or advertorial if the traffic needs one.',
  },
  {
    step: 'Wire up tracking',
    route: '/admin/sites',
    detail:
      'Open the Site, then Settings, then Tracking. Pixels and conversion APIs are configured per Site here, not globally. A lead fires the browser pixel and the server-side conversion with one shared event id so the two deduplicate.',
  },
  {
    step: 'Send a test lead',
    route: '/admin/settings/system',
    detail:
      'Use the system checks to confirm the pipeline runs end to end before spending money on traffic. A lead is processed inside the request, so a broken integration shows up immediately rather than in a queue.',
  },
]

export const SECTIONS: HandbookSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    blurb: 'Where you land, and where the numbers live.',
    pages: [
      {
        route: '/admin/overview',
        title: 'Overview',
        status: 'working',
        purpose: 'The landing screen: counts across every Site you can see, and recent activity.',
        use: [
          'Read the counts to see the shape of the account at a glance.',
          'Follow any count through to the list behind it.',
        ],
        mechanism: [
          'Counts are live queries at request time, not a cached rollup, so the number is right the moment you load it.',
          'Everything is filtered by what your account is allowed to see. A user bound to two Sites gets totals for those two Sites, not for the platform.',
        ],
      },
      {
        route: '/admin/leads',
        title: 'Leads',
        status: 'working',
        purpose: 'The cross-Site lead inbox: every lead this account can see, with its delivery, enrichment and consent evidence.',
        use: [
          'Use the status rail to move between all leads and the delivery states. The counts on it are live.',
          'Open a lead to read its full record: summary, system response, HLR trace, CAPI log and delivery log.',
          'Filter by Site, funnel and date when you are looking for a specific capture rather than reading the stream.',
        ],
        mechanism: [
          'Capture runs synchronously inside the request. A public form POST to /api/leads runs attribution, consent capture, HLR enrichment, CAPI, webhooks and Slack notify, then persists the row.',
          'Everything you see is scoped by your bindings. A user bound to two Sites sees those two Sites, not the platform.',
          'The delivery log is the real dispatch record, not a re-derivation: it is what the pipeline wrote at the time.',
        ],
        watchOut: [
          'Deleting a Site deletes its leads, including their consent certificates. Export first if you need to retain them.',
        ],
      },
      {
        route: '/admin/analytics',
        title: 'Analytics',
        status: 'placeholder',
        purpose: 'Intended for funnel, conversion and attribution reporting across every Site.',
        use: ['Not usable yet. The sidebar marks it "Soon" and the screen says what it is waiting on.'],
        mechanism: [
          'The data it would report on is already being collected: every lead carries its attribution, its shared conversion event id, the deployment that produced it, and the tracking config that was live at the time.',
          'What does not exist is the aggregation layer. Counting across Sites and date ranges on every page load would put a table scan on the console, so the numbers need a rollup written as leads arrive, and there is no background worker to write one.',
        ],
      },
      {
        route: '/admin/integrity',
        title: 'Campaign Integrity',
        status: 'placeholder',
        purpose: 'Intended for consent evidence, compliance review and traffic-quality signals in one place.',
        use: ['Not usable yet. The screen names what is captured today and what the area is waiting on.'],
        mechanism: [
          'The evidence it would review IS captured on every lead: the TrustedForm certificate claimed server-side at submission, the Jornaya token verification, the HLR line-status lookup, and a snapshot of the consent language the visitor was shown.',
          'Those run today and are visible on a lead detail view. What is missing is the review surface across a campaign, and there is no agreed scoring model behind it.',
        ],
      },
    ],
  },
  {
    id: 'sites',
    title: 'Sites',
    blurb:
      'One Site is one brand. This is the tenant boundary, so nearly everything else in the app hangs off it.',
    pages: [
      {
        route: '/admin/sites',
        title: 'Sites list',
        status: 'working',
        purpose: 'Every brand you can see, and where new ones are created.',
        use: [
          'Create a Site by naming it and choosing a vertical. The slug is suggested from the name and can be edited.',
          'Open a Site to get its own dashboard and its settings.',
        ],
        mechanism: [
          'Creating a Site seeds starter content for the vertical: a home page, a qualifying quiz and a landing page. They are real editable records, not samples, and they take their colours from the brand at render.',
          'A preview domain is issued at the same time so the Site is reachable before any custom domain exists.',
        ],
        watchOut: [
          'The slug is used in the preview hostname, so changing it later changes that URL.',
          'A new Site is created in draft, and a draft Site returns 404 on every public path including its own preview domain. Two of the three Sites on this server are in that state today, which is why four of their six live deployments are unreachable. Set the Site to Active when you want to see it.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Site dashboard',
        pattern: '/admin/sites/:slug',
        status: 'working',
        purpose: 'The home screen for one brand: its pages, domains and lead volume.',
        use: ['Open any Site from the list. Everything scoped to that brand is reachable from here.'],
        mechanism: [
          'The Site is loaded once in the layout and shared with every child screen, so the tabs under it do not each re-query.',
          'Sharing the Site is not the same as authorising it. Every action under a Site re-checks that you are bound to that Site before it writes.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Pages',
        pattern: '/admin/sites/:slug/pages',
        status: 'working',
        purpose: 'The block based page builder for this Site.',
        use: [
          'Create a page, then add blocks: hero, navigation, trust strip, prose, cards, stats, testimonials, FAQ, services grid, how it works, calls to action, footer.',
          'Import an existing page from raw HTML, or clone one from a URL, and edit the blocks that come back.',
          'Duplicate a page to use it as a starting point.',
          'Watch the page health card while you edit. It re-runs on every change.',
        ],
        mechanism: [
          'A page body is an array of typed blocks, not a blob of HTML, which is what lets the renderer restyle the same page for any brand.',
          'Page health is a set of cheap accessibility, SEO, heading-order and contrast checks that run locally as you type, so there is no save-and-see loop.',
          'Colours come from the brand tokens. A block never stores a hex code, so rebranding a Site restyles every page without touching content.',
        ],
        watchOut: [
          'Never put a phone number in page content. Numbers are resolved per path at render, and a hard coded one will not follow the routing rules.',
          'Renaming the slug of a published page records a redirect from the old one automatically, so old links keep working.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Blog',
        pattern: '/admin/sites/:slug/blog',
        status: 'working',
        purpose: 'Posts for this Site.',
        use: ['Write, schedule and publish posts. They render on the Site under its own domain.'],
        mechanism: [
          'Posts are scoped to the Site like everything else, and use the same slug redirect behaviour as pages.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Call tracking numbers',
        pattern: '/admin/sites/:slug/numbers',
        status: 'working',
        purpose: 'Which phone number shows on which paths.',
        use: [
          'Add a number and list the paths it should serve.',
          'Set a fallback number for the Site so nothing renders blank.',
        ],
        mechanism: [
          'Resolution runs in a fixed order: a number whose paths match the current path wins, with the longest matching prefix taking precedence; then the Site fallback number; then the default phone on the Site.',
          'Because it resolves at render, one page can show different numbers under different deployments without duplicating the page.',
        ],
        watchOut: [
          'A number is never copied onto a page, landing page or quiz. If you find one written into content, that is a bug worth fixing rather than a shortcut.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Settings, General',
        pattern: '/admin/sites/:slug/settings/general',
        status: 'working',
        purpose: 'Name, slug, vertical and the Site level defaults.',
        use: ['Edit and save. Changes apply to every page on the Site at the next render.'],
        mechanism: ['Saved straight onto the Site record, which the public renderer reads on every request through a cached lookup.'],
      },
      {
        route: '/admin/sites',
        title: 'Settings, Domains',
        pattern: '/admin/sites/:slug/settings/domains',
        status: 'working',
        purpose: 'Connect and verify hostnames for this Site.',
        use: [
          'Add the domain, point its DNS at the server, then verify.',
          'Recheck DNS if verification fails, rather than deleting and starting again.',
          'Set which domain is primary once one has verified.',
        ],
        mechanism: [
          'Verifying checks DNS, then asks Plesk to register the domain, set the reverse proxy to the app, and issue a Let’s Encrypt certificate. The record moves from provisioning to active.',
          'Certificate status is then polled roughly every thirty seconds for about four minutes by making a real HTTPS request to the domain. It is only marked active after a genuine handshake succeeds, never because Plesk said so.',
          'Once active, a request arriving with that host header resolves to this Site.',
        ],
        watchOut: [
          'Host lookups are cached for sixty seconds. A domain change can take up to a minute to take effect on an already warm server.',
          'The preview domain cannot be deleted here, and stays primary until a custom domain verifies.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Settings, Paths',
        pattern: '/admin/sites/:slug/settings/paths',
        status: 'working',
        purpose: 'Slug redirects, the sitemap and robots.txt for this Site.',
        use: [
          'Review redirects that were recorded automatically when slugs changed, and add any you need by hand.',
          'Check the sitemap and robots rules the Site is serving.',
        ],
        mechanism: [
          'When a published page or post changes slug, the old slug is appended to its redirect list automatically, and the public router answers the old URL with a permanent redirect.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Settings, SEO',
        pattern: '/admin/sites/:slug/settings/seo',
        status: 'placeholder',
        purpose: 'Intended for Site wide SEO defaults, schema generators and default social images.',
        use: [
          'Not usable yet.',
          'Per page titles and descriptions are still editable on each page in the page builder.',
        ],
        mechanism: ['Pages already emit their own metadata. What is missing is the Site level default that would fill the gaps.'],
      },
      {
        route: '/admin/sites',
        title: 'Settings, Tracking and pixels',
        pattern: '/admin/sites/:slug/settings/tracking',
        status: 'working',
        purpose: 'Pixels, conversion APIs and lead routing for this Site.',
        use: [
          'Enter the pixel and conversion API credentials for this brand.',
          'Configure where leads should be sent onward.',
        ],
        mechanism: [
          'These are per Site on purpose. The platform wide integration settings are a different screen and hold different things.',
          'When a lead converts, the browser pixel and the server-side conversion call share one generated event id, which is what lets the ad platform recognise them as one event rather than two.',
          'Credentials stay on the server. They are never sent to the browser.',
        ],
      },
      {
        route: '/admin/sites',
        title: 'Settings, Users',
        pattern: '/admin/sites/:slug/settings/users',
        status: 'placeholder',
        purpose: 'Intended for per Site role bindings: admin, editor, analyst.',
        use: [
          'Not usable yet.',
          'Bindings are editable today on the platform wide Users screen, or in the raw admin.',
        ],
        mechanism: ['The bindings themselves are real and enforced. Only this editing surface is missing.'],
      },
      {
        route: '/admin/sites',
        title: 'Settings, Danger zone',
        pattern: '/admin/sites/:slug/settings/danger-zone',
        status: 'working',
        purpose: 'Pause, archive or delete this Site.',
        use: [
          'Pause to take a Site off the air without losing anything.',
          'Archive to retire it.',
          'Delete only when you are certain, and export the leads first.',
        ],
        mechanism: [
          'Deleting a Site runs a cascade that removes its children first, because the database will otherwise refuse the delete outright.',
          'That cascade includes the Site’s leads, and it runs on every delete path including the raw admin and the API.',
        ],
        watchOut: [
          'Deleting a Site destroys its lead and consent records. That is irreversible and it is a compliance question, not just a data question. Export first.',
        ],
      },
    ],
  },
  {
    id: 'brands',
    title: 'Brands',
    blurb:
      'Identity and hostnames. A brand is the parent: quizzes, landing pages and advertorials all take their look from here rather than carrying their own.',
    pages: [
      {
        route: '/admin/brands/brand-identities',
        title: 'Brand Identities',
        status: 'working',
        purpose: 'The single source of truth for how a brand looks, who it is, and where its legal pages live.',
        use: [
          'Pick a Site, then work through the tabs: Identity, Colors, Typography, Contact, Domains, Legal and URLs.',
          'To fill it fast, use one of the three readers: from a URL, from a written description, or from a logo image.',
          'Read the proposal before accepting it. Every value shows a confidence figure and where it came from.',
          'Read the "what this reading could not tell us" panel when it appears. It is the difference between "this site has no logo colour" and "we could not read this site".',
          'Use the URLs tab for the destinations this brand sends people to: thank you, disqualified, privacy, terms and the rest.',
        ],
        mechanism: [
          'Reading from a URL renders the page in a real browser and samples what it actually painted: the largest solid button above the fold, the page ground, the repeated card colour, the longest run of body text, the headings, and the dominant colour of the logo taken off a canvas.',
          'It deliberately does not read the declared stylesheet. Declaration order in a utility framework has no relationship to visual hierarchy, which is how the previous version returned a framework default palette for a site that used neither colour.',
          'Readings are weighted by role. The main call to action outranks everything because it is the one colour a brand certainly chose on purpose; links rank last because they are usually left at a default.',
          'Anything too small or too rare to be a deliberate choice is thrown away, and a grey result yields no primary at all, because reporting that no brand was found is more useful than proposing grey.',
          'Accepting a proposal writes tokens, not hex codes scattered through content. Every screen that renders this brand derives its text colours from the surface they will sit on and verifies the contrast.',
        ],
        watchOut: [
          'A palette that fails contrast is not publishable. The audit shown next to Accept is the same one the publish gate applies later, so a fail here is a fail there.',
          'If a site blocks automated browsers, the reader falls back to parsing its stylesheet and says so. Those values are the weaker kind of evidence and are worth checking by eye.',
        ],
      },
      {
        route: '/admin/brands/domains',
        title: 'Domains',
        status: 'working',
        purpose: 'The pool of hostnames across all brands, and where they get attached.',
        use: [
          'Add a domain to the pool before it belongs to anyone.',
          'Attach it to a Site, verify it, and make it primary.',
          'Detach to move a domain between Sites without deleting and re-adding it.',
        ],
        mechanism: [
          'A Domain row can exist with no Site, which is what makes a pool possible. Attaching sets the relationship; verifying runs the same DNS, Plesk and certificate sequence as the per Site screen.',
          'The public router only ever resolves a host to a Site through an active Domain, so an unattached or unverified domain serves nothing.',
        ],
        watchOut: ['Give the host cache up to a minute after attaching or detaching before deciding something has not worked.'],
      },
    ],
  },
  {
    id: 'funnel',
    title: 'Funnel Builder',
    blurb:
      'Write the content once with no brand on it, then deploy it under as many brands as you like. Authoring and brand binding are separate on purpose.',
    pages: [
      {
        route: '/admin/quizzes',
        title: 'Quizzes',
        status: 'working',
        purpose: 'The qualifying flow: questions, branching, and where each outcome sends people.',
        use: [
          'Work in the Quizzes tab to write the flow. Nothing here mentions a brand.',
          'Switch to Deployments to put a quiz live: choose the quiz, the brand, the domain and the path.',
          'Inside a deployment use Basics for what it is, Render and Embed for how it looks and where it is embedded, Header and Footer for the surrounding chrome, and Tracking and Pixels for measurement.',
          'Set the destinations for each outcome: qualified, disqualified, and the thank you page.',
          'Archive a quiz you are done with rather than deleting it. Use the Active and Archived filter to find it again.',
        ],
        mechanism: [
          'The quiz holds the flow. The deployment holds the brand, the placement and the tracking. That is why one quiz can run under several brands with no copy and paste.',
          'The preview renders with the deployment’s real brand tokens, so what you see is what a visitor gets rather than a generic theme.',
          'Destinations resolve in a cascade: the deployment’s own URL, then the brand’s configured URL, then a page on the Site. Whichever is set most specifically wins.',
          'A destination is validated after any {{field}} placeholders are filled in, not before, so a value injected at runtime cannot smuggle in a script URL.',
          'A submission runs the full lead pipeline inside the request: attribution, the shared event id, consent certificate claim, phone enrichment, the saved lead, the conversion calls, outbound webhooks and the notification.',
        ],
        watchOut: [
          'Archiving hides a quiz from the picker but does not break deployments already using it. A picker never silently drops a record you already saved: it shows it, marked archived.',
          'Because the pipeline is synchronous, a slow third party makes the visitor wait. That is a deliberate trade for knowing immediately whether a lead was handled.',
        ],
      },
      {
        route: '/admin/landing-pages',
        title: 'Landing Pages',
        status: 'working',
        purpose: 'Standalone landing pages, authored brandless and deployed per brand.',
        use: [
          'Write the page in the Pages tab. Edit sections by hand, or use Edit with Claude to rewrite one.',
          'Clone a page to make a variant rather than starting over.',
          'Use the Deployments tab to bind a page to a brand, a domain and a path.',
        ],
        mechanism: [
          'Same split as quizzes: the page is brandless, the deployment carries the brand and the placement.',
          'A landing page can run the real quiz rather than a mock of it, so the hero form is the same flow that a standalone quiz deployment would run, with the same destinations and the same lead handling.',
          'Generated copy goes through the same checks as everything else the model writes, including a banned vocabulary pass with retries before it is shown to you.',
        ],
      },
      {
        route: '/admin/advertorials',
        title: 'Advertorials',
        status: 'working',
        purpose: 'Long form editorial pages that lead into a funnel.',
        use: [
          'Write in the Advertorials tab. Pick a length: short, medium, long or epic.',
          'Use the bulk simplify pass to bring reading level down across the whole piece.',
          'Deploy it against a brand, a domain and a path in the Deployments tab.',
          'Use the brand placeholders in the body so one article reads correctly under every brand.',
        ],
        mechanism: [
          'The body is brandless and uses placeholders for the brand display name, short name, phone in both formatted and raw form, domain, tagline, the linked quiz deployment URL, and the current year. Those are filled at render.',
          'Because the linked quiz is referenced by its deployment, the same article can point at a different quiz per brand without editing the copy.',
        ],
        watchOut: [
          'This is legal advertising. Do not add named individuals, settlement figures or claim counts that cannot be substantiated, whether written by hand or generated.',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    blurb: 'Platform wide configuration, as opposed to the per Site settings that live under each brand.',
    pages: [
      {
        route: '/admin/settings/integrations',
        title: 'Integrations',
        status: 'working',
        purpose: 'PageFlo wide integration settings: mail, notifications, source control and search console.',
        use: ['Enter credentials once for the whole platform and save.'],
        mechanism: [
          'These are platform wide and restricted to super admins.',
          'Per Site tracking values are a different screen entirely. Do not put a brand’s pixel here or a platform SMTP credential there.',
        ],
        watchOut: [
          'Leave a value blank rather than typing a placeholder. Code branches on the field being empty, so a fake value reads as configured and fails later instead of degrading cleanly.',
        ],
      },
      {
        route: '/admin/settings/users',
        title: 'Users',
        status: 'working',
        purpose: 'The roster, and which Sites each person can work on.',
        use: [
          'Invite a user by email.',
          'Bind them to one or more Sites with a role: admin, editor or analyst.',
          'Suspend rather than delete when someone leaves, so their audit trail stays attributable.',
        ],
        mechanism: [
          'A user with no bindings sees nothing. A super admin bypasses Site scoping entirely.',
          'Bindings are enforced in the data layer, not in the interface, so they hold for the raw admin and the API as well as for these screens.',
        ],
        watchOut: ['/admin/users is a different, unbuilt screen. This is the one that works.'],
      },
      {
        route: '/admin/settings/system',
        title: 'System health',
        status: 'working',
        purpose: 'Whether the deploy, the runtime, the database and the integrations are actually up.',
        use: [
          'Open it after any deploy.',
          'Use refresh to re-run the checks rather than reloading and hoping.',
        ],
        mechanism: [
          'Checks run live against the real dependencies. The database check queries, the cache check pings.',
          'It reports what it observed. A check that has not been run is shown as not run rather than folded into a pass.',
        ],
      },
      {
        route: '/admin/settings',
        title: 'Settings index',
        status: 'working',
        purpose: 'The index of workspace settings, and a reminder of which settings live inside a Site instead.',
        use: ['Pick Integrations, Users, System health or Profile.'],
        mechanism: [
          'Screens restricted to workspace owners are shown to everyone with a visible "Owner only" chip rather than hidden, because an editor who cannot find Users concludes the feature is missing.',
        ],
      },
      {
        route: '/admin/users',
        title: 'Users (old route)',
        status: 'working',
        purpose: 'The pre-rebrand route for the roster.',
        use: ['Nothing to do. It permanently redirects to Settings, Users.'],
        mechanism: [
          'A 308 rather than a placeholder page, so an old bookmark or link lands on the real screen instead of on an explanation of where the real screen went.',
        ],
      },
    ],
  },
  {
    id: 'ops',
    title: 'Operations',
    blurb: 'Screens about the system itself rather than about a brand.',
    pages: [
      {
        route: '/admin/buildlog',
        title: 'Build log',
        status: 'working',
        purpose: 'What shipped, when, whether it was verified, and what is still open.',
        use: [
          'Read newest first. Each item carries a status, the files it touched, and how to see it with your own eyes.',
          'Follow an evidence recipe to check a claim yourself: it names the route and the clicks to get there.',
          'Comment on any item to raise a question or a correction, and resolve the comment when it is dealt with.',
        ],
        mechanism: [
          'Items that were superseded by later work are marked as such rather than left looking open, so the outstanding count means something.',
          'Verification is recorded honestly. A check that was never run says so instead of being summarised away.',
          'Screenshots come from a capture job that drives each recipe, confirms the target is on screen, and files nothing it could not confirm. Each image shows what the job asserted before saving.',
        ],
        watchOut: [
          'Captures are photographs of this admin taken while signed in, so they can contain real lead details. They are served behind authentication and are deliberately not public files.',
        ],
      },
      {
        route: '/admin/plan',
        title: 'Agent plan',
        status: 'working',
        purpose: 'The board of known findings and which reviewer owns each one.',
        use: ['Use it to see what has been audited, what was confirmed, and what is being worked on.'],
        mechanism: [
          'Assignments are generated from the standing audit. Status is written by the agents themselves, one file per agent, so two working at once cannot overwrite each other.',
          'This is a development and operations surface. It is deliberately not stored as normal application data, because it has no tenant meaning.',
        ],
      },
      {
        route: '/admin/profile',
        title: 'Profile',
        status: 'working',
        purpose: 'Your own name, email and password.',
        use: ['Edit and save. It affects your account only.'],
        mechanism: ['Changes are audited like any other write.'],
      },
      {
        route: '/admin/handbook',
        title: 'Handbook',
        status: 'working',
        purpose: 'This page.',
        use: ['Use the contents to jump to a screen, or read the first run sequence if this is a new brand.'],
        mechanism: [
          'Written as structured data so a documented route that stops existing is a visible break rather than stale prose.',
          'Status is recorded per page, so the six screens that are not built yet say so here instead of being discovered by clicking them.',
        ],
      },
    ],
  },
  {
    id: 'beyond',
    title: 'Outside the custom admin',
    blurb: 'Surfaces you will end up using even though they are not in the sidebar.',
    pages: [
      {
        route: '/cms',
        title: 'Raw admin',
        status: 'working',
        purpose: 'The underlying content admin, for fields the custom screens do not expose yet.',
        use: [
          'Use it to read leads, since the custom Leads screen is not built.',
          'Use it for any field that has no custom editor yet.',
        ],
        mechanism: [
          'It is the same data and the same access rules. Site scoping and the audit trail apply here exactly as they do in the custom admin.',
        ],
        watchOut: [
          'It exposes everything, including destructive operations. A Site delete here runs the same cascade and takes the leads with it.',
        ],
      },
      {
        route: '/sign-in',
        title: 'Sign in',
        status: 'working',
        purpose: 'The way in.',
        use: ['Email and password. Everything under /admin redirects here when you are signed out.'],
        mechanism: ['Sessions are cookie based. The admin re-checks the session on the server for every screen and every action.'],
      },
      {
        route: '/',
        title: 'The public site',
        status: 'working',
        purpose: 'What visitors actually see.',
        use: [
          'Open the Site’s domain, or its preview domain.',
          'Add ?site=slug to view a Site without pointing DNS at it.',
          'Add ?preview=1 while signed in to see drafts and scheduled content.',
        ],
        mechanism: [
          'A request is matched by host header to a Domain, then to a Site, then the path is resolved to a page, landing page or blog post, then to a shared legal template for known legal paths, and finally to the marketing site if no Site matches.',
          'The draft bypass is verified on the server against your session. The routing layer only forwards the intent; it never grants it.',
          'Host lookups are cached for sixty seconds.',
          'A draft Site returns 404 on every path, and so does everything deployed under it, however the deployment itself is labelled. Signing in and adding ?preview=1 is the way to view one without publishing it.',
        ],
        watchOut: [
          'Authored pages currently ship with no title tag, meta description, canonical or social tags. Only quiz and landing-page deployment URLs get them. That affects the home page and every legal page on every Site.',
        ],
      },
    ],
  },
]

export const ALL_PAGES: HandbookPage[] = SECTIONS.flatMap((s) => s.pages)

export const countByStatus = (status: PageStatus): number =>
  ALL_PAGES.filter((p) => p.status === status).length
