import { withPayload } from '@payloadcms/next/withPayload'
// Plain JavaScript with no imports of its own: this is evaluated by Next's
// config loader before the app exists, and a config that fails to load takes
// the build with it. Imported rather than inlined so the rule is unit-testable -
// a config file is the one place in a codebase nothing can assert against.
import { imageRemotePatterns, admitImageHosts } from './src/lib/net/image-hosts.mjs'

// PAGEFLO_IMAGE_HOSTS first, LEGALOS_IMAGE_HOSTS as the legacy fallback - the
// same precedence src/lib/pageflo/env.ts applies everywhere else, restated
// here because this file cannot import that module (see above).
const IMAGE_HOSTS_RAW = process.env.PAGEFLO_IMAGE_HOSTS || process.env.LEGALOS_IMAGE_HOSTS || ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dev server (and the ported artifact files marked `@ts-nocheck`) rely on
  // SWC, not tsc. `next build` otherwise runs a full type-check + ESLint pass
  // that the intentionally-loose ported code fails on. Correctness is gated by
  // the dedicated `pnpm typecheck` / `pnpm lint` scripts instead, so we don't
  // let those block the production build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    reactCompiler: false,
    // This app's builder code is large (the ported funnel/page-builder apps,
    // ~24,000 @ts-nocheck'd lines among them), and a cold production build's
    // peak RSS can exceed what a constrained host has available, killing the
    // build with SIGKILL/SIGTERM before it finishes. This trades a slower
    // build for a lower peak, and does not change the emitted output.
    webpackMemoryOptimizations: true,
    serverActions: {
      // The brand wizard posts documents and downscaled images in one action,
      // and Next rejects an oversized body with a 413 BEFORE the action runs -
      // uncatchable server-side, and shown to the operator as an opaque
      // "error occurred in the Server Components render". The default 1MB
      // cannot carry a brand guideline plus a screenshot, so the ceiling is
      // raised once, here, and every per-file limit in
      // src/lib/brand/source-limits.ts is sized to add up to less than it.
      // Keep the two in step: that file's BODY_LIMIT_BYTES mirrors this value.
      bodySizeLimit: '4mb',
    },
  },
  // Playwright drives a real Chromium binary and resolves it from its own
  // package directory at runtime. Bundling it would rewrite those paths and
  // break the launch, so it stays external and is required from node_modules.
  serverExternalPackages: ['playwright'],
  images: {
    // `hostname: '**'` was here, which makes /_next/image?url=https://<anything>
    // an unauthenticated server-side fetch of an attacker-chosen host on every
    // public tenant domain - the one fetch path in the product that never went
    // through the admission control in lib/net/ssrf.
    //
    // Nothing remote is admitted now. Brand artwork does not need the optimiser:
    // the templates emit a plain <img> at the URL the brand supplied, so the
    // VISITOR's browser fetches it and this server never does, which is the only
    // arrangement with no server-side fetch to exploit. `PAGEFLO_IMAGE_HOSTS`
    // (falling back to the legacy `LEGALOS_IMAGE_HOSTS` name, exactly as
    // src/lib/pageflo/env.ts does for every other variable) is for an operator
    // who deliberately wants a known CDN optimised, and every entry goes
    // through the same shape admission every other outbound address does.
    // Wildcards are refused, so this cannot regress to what it was.
    //
    // This file cannot import src/lib/pageflo/env.ts (see the note at the top),
    // so the fallback is re-stated here rather than shared.
    remotePatterns: imageRemotePatterns(IMAGE_HOSTS_RAW),
  },
}

for (const { entry, reason } of admitImageHosts(IMAGE_HOSTS_RAW).refused) {
  // A typo in an environment variable must cost the one host it names, not the
  // build - but silently dropping it is how an operator concludes the allowlist
  // does not work and reaches for the wildcard again.
  console.warn(`[pageflo] PAGEFLO_IMAGE_HOSTS: refused "${entry}" - ${reason}`)
}

export default withPayload(nextConfig)
