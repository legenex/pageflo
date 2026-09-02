// Bespoke CSS shared between the legacy CheckMyClaimHome component and the
// data-driven BlockRenderer ports of its sections. Keeping the CSS string in
// one place means the visual stays in sync as we migrate block-by-block.
//
// Every rule that reaches the admin builder preview is scoped THREE times:
// `html.site-shell` for the public page, `.pageflo-builder-canvas` for the
// canvas, and `.legalos-builder-canvas` for the same canvas under its old
// name. The old selector is not dead weight and must not be swept up by the
// rename: `src/lib/builder/extract-brand-tokens.ts` writes it into the
// `custom_html` blocks produced by HTML import, and those rows are already
// stored in Postgres. Until every such row is rewritten, a page imported
// before the rename still styles itself through `.legalos-builder-canvas`,
// which is why `PageBlocksBuilderApp` puts both class names on the canvas and
// why both appear below.

export const BESPOKE_CSS = `
/* High-specificity overrides for site-shell brand vars from PublicLayout. */
html.site-shell .hero h1, .legalos-builder-canvas .hero h1, html.site-shell .hero__heading, .legalos-builder-canvas .hero__heading,
html.site-shell .hero__heading .hero__heading-gradient , .legalos-builder-canvas .hero__heading .hero__heading-gradient, .pageflo-builder-canvas .hero h1, .pageflo-builder-canvas .hero__heading, .pageflo-builder-canvas .hero__heading .hero__heading-gradient { color: var(--site-ink-inverse); }
html.site-shell .hero__heading .hero__heading-gradient , .legalos-builder-canvas .hero__heading .hero__heading-gradient, .pageflo-builder-canvas .hero__heading .hero__heading-gradient { background: linear-gradient(90deg,var(--site-primary-400),var(--site-primary-600)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
html.site-shell .hero__sub , .legalos-builder-canvas .hero__sub, .pageflo-builder-canvas .hero__sub { color: var(--site-ink-inverse-muted); }
html.site-shell .hero__cta-sub , .legalos-builder-canvas .hero__cta-sub, .pageflo-builder-canvas .hero__cta-sub { color: var(--site-ink-inverse-muted); }
html.site-shell .hero__pill-text , .legalos-builder-canvas .hero__pill-text, .pageflo-builder-canvas .hero__pill-text { color: color-mix(in srgb, var(--site-ink-inverse) 80%, transparent); }
html.site-shell .trust-banner__label , .legalos-builder-canvas .trust-banner__label, .pageflo-builder-canvas .trust-banner__label { color: var(--site-ink-inverse); }
html.site-shell .panel-dark, .legalos-builder-canvas .panel-dark, html.site-shell .panel-dark p, .legalos-builder-canvas .panel-dark p, html.site-shell .panel-dark h1, .legalos-builder-canvas .panel-dark h1, html.site-shell .panel-dark h2, .legalos-builder-canvas .panel-dark h2, html.site-shell .panel-dark h3, .legalos-builder-canvas .panel-dark h3, html.site-shell .panel-dark span , .legalos-builder-canvas .panel-dark span, .pageflo-builder-canvas .panel-dark, .pageflo-builder-canvas .panel-dark p, .pageflo-builder-canvas .panel-dark h1, .pageflo-builder-canvas .panel-dark h2, .pageflo-builder-canvas .panel-dark h3, .pageflo-builder-canvas .panel-dark span { color: var(--site-ink-inverse); }
html.site-shell .btn-nav, .legalos-builder-canvas .btn-nav, html.site-shell .btn-hero, .legalos-builder-canvas .btn-hero, html.site-shell a.btn-nav, .legalos-builder-canvas a.btn-nav, html.site-shell a.btn-hero , .legalos-builder-canvas a.btn-hero, .pageflo-builder-canvas .btn-nav, .pageflo-builder-canvas .btn-hero, .pageflo-builder-canvas a.btn-nav, .pageflo-builder-canvas a.btn-hero { color: var(--site-cta-ink); }
html.site-shell .footer, .legalos-builder-canvas .footer, html.site-shell .footer h1, .legalos-builder-canvas .footer h1, html.site-shell .footer h2, .legalos-builder-canvas .footer h2, html.site-shell .footer h3, .legalos-builder-canvas .footer h3, html.site-shell .footer__heading, .legalos-builder-canvas .footer__heading, html.site-shell .footer__logo + .footer__desc , .legalos-builder-canvas .footer__logo + .footer__desc, .pageflo-builder-canvas .footer, .pageflo-builder-canvas .footer h1, .pageflo-builder-canvas .footer h2, .pageflo-builder-canvas .footer h3, .pageflo-builder-canvas .footer__heading, .pageflo-builder-canvas .footer__logo + .footer__desc { color: var(--site-ink-inverse); }
html.site-shell .footer .footer__link, .legalos-builder-canvas .footer .footer__link, html.site-shell .footer .footer__contact-row, .legalos-builder-canvas .footer .footer__contact-row, html.site-shell .footer .footer__policy-link , .legalos-builder-canvas .footer .footer__policy-link, .pageflo-builder-canvas .footer .footer__link, .pageflo-builder-canvas .footer .footer__contact-row, .pageflo-builder-canvas .footer .footer__policy-link { color: color-mix(in srgb, var(--site-ink-inverse) 70%, transparent); }
html.site-shell .footer .footer__link:hover, .legalos-builder-canvas .footer .footer__link:hover, html.site-shell .footer .footer__contact-row:hover, .legalos-builder-canvas .footer .footer__contact-row:hover, html.site-shell .footer .footer__policy-link:hover , .legalos-builder-canvas .footer .footer__policy-link:hover, .pageflo-builder-canvas .footer .footer__link:hover, .pageflo-builder-canvas .footer .footer__contact-row:hover, .pageflo-builder-canvas .footer .footer__policy-link:hover { color: var(--color-blue-start); }

:root {
  /* Brand cascade: these inherit from the per-Site --site-* tokens emitted by
     the public layout (and the admin builder canvas wrapper). When a Site
     has NO brand override the fallback is a NEUTRAL palette (dark navy
     ink + medium gray accents) instead of CMC blue — so a brand-unaware
     Site doesn't accidentally inherit Check My Claim's identity. CMC
     itself has its brand colors configured so the cascade picks them up
     correctly via --site-primary. */
  --color-navy: var(--site-ink);
  --color-navy-dark: color-mix(in srgb, var(--site-ink) 82%, black);
  --color-blue: var(--site-primary);
  --color-blue-start: var(--site-primary-400);
  --color-blue-end: var(--site-primary-700);
  --color-muted: var(--site-ink-muted);
  --color-bg-light: var(--site-surface);
  --color-border: var(--site-border);
  --grad-blue: linear-gradient(90deg, var(--color-blue-start), var(--color-blue-end));
  --grad-blue-135: linear-gradient(135deg, var(--color-blue-start), var(--color-blue-end));
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-pill: 9999px;
}

html.site-shell, .legalos-builder-canvas, html.site-shell body , .legalos-builder-canvas body, .pageflo-builder-canvas, .pageflo-builder-canvas body { background: var(--site-bg); color: var(--color-navy); margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
html.site-shell * , .legalos-builder-canvas *, .pageflo-builder-canvas * { box-sizing: border-box; }
html.site-shell h1, .legalos-builder-canvas h1, html.site-shell h2, .legalos-builder-canvas h2, html.site-shell h3, .legalos-builder-canvas h3, html.site-shell h4, .legalos-builder-canvas h4, html.site-shell h5, .legalos-builder-canvas h5, html.site-shell h6 , .legalos-builder-canvas h6, .pageflo-builder-canvas h1, .pageflo-builder-canvas h2, .pageflo-builder-canvas h3, .pageflo-builder-canvas h4, .pageflo-builder-canvas h5, .pageflo-builder-canvas h6 { line-height: 1.1; color: var(--color-navy); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
html.site-shell a , .legalos-builder-canvas a, .pageflo-builder-canvas a { color: inherit; text-decoration: none; }

button { cursor: pointer; background: none; border: none; font: inherit; color: inherit; }
img, video { display: block; max-width: 100%; height: auto; }

.navbar { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: var(--site-surface); box-shadow: 0 4px 6px -1px color-mix(in srgb, var(--site-ink) 10%, transparent), 0 2px 4px -2px color-mix(in srgb, var(--site-ink) 10%, transparent); }
.navbar__inner { max-width: 1280px; margin-inline: auto; padding-inline: 16px; display: flex; align-items: center; justify-content: space-between; height: 80px; }
.navbar__logo { height: 40px; width: auto; flex-shrink: 0; }
.navbar__wordmark { font-family: var(--site-font-heading); font-weight: 800; font-size: 1.25rem; letter-spacing: -0.02em; color: var(--site-ink); flex-shrink: 0; white-space: nowrap; }
.navbar__links { display: none; align-items: center; gap: 32px; }
.navbar__link { font-size: 0.875rem; font-weight: 500; letter-spacing: 0.05em; color: var(--color-navy); transition: color 0.2s ease; padding: 0; }
.navbar__link:hover { color: var(--color-blue); }
.btn-nav { display: none; background: var(--grad-blue); color: var(--site-cta-ink); font-weight: 600; font-size: 0.875rem; padding: 10px 20px; border-radius: var(--radius-pill); transition: opacity 0.2s; }
.btn-nav:hover { opacity: 0.9; }
.navbar__hamburger { display: flex; padding: 8px; border-radius: 8px; color: var(--color-navy); }
.navbar__mobile { overflow: hidden; max-height: 0; opacity: 0; transition: max-height 0.3s ease, opacity 0.3s ease; background: var(--site-surface); border-top: 1px solid var(--color-border); box-shadow: 0 20px 25px -5px color-mix(in srgb, var(--site-ink) 10%, transparent); }
.navbar__mobile.open { max-height: 384px; opacity: 1; }
.navbar__mobile-inner { padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.navbar__mobile-link { width: 100%; text-align: left; font-weight: 500; color: var(--color-navy); padding: 12px; border-radius: 8px; transition: background-color 0.15s ease; }
.navbar__mobile-link:hover { background-color: color-mix(in srgb, var(--site-primary) 10%, transparent); }

@media (min-width: 768px) {
  .navbar__inner { height: 96px; }
  .navbar__logo { height: 56px; }
  .navbar__wordmark { font-size: 1.5rem; }
  .navbar__links { display: flex; }
  .navbar__hamburger { display: none; }
  .navbar__mobile { display: none; }
  .btn-nav { display: block; }
}

.hero { position: relative; min-height: 100vh; display: flex; align-items: center; overflow: hidden; margin-top: 80px; }
.hero__bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hero__overlay { position: absolute; inset: 0; background: linear-gradient(135deg, color-mix(in srgb, var(--site-ink) 95%, transparent) 0%, color-mix(in srgb, var(--site-ink) 90%, transparent) 60%, color-mix(in srgb, var(--site-ink) 95%, transparent) 100%); }
.hero__pattern { position: absolute; inset: 0; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"); pointer-events: none; }
.hero__content { position: relative; z-index: 10; max-width: 1280px; margin-inline: auto; padding-inline: 16px; padding-top: 96px; padding-bottom: 64px; width: 100%; }
.hero__inner { max-width: 768px; margin-inline: auto; text-align: center; }
.hero__badge { display: inline-flex; align-items: center; gap: 8px; background: color-mix(in srgb, var(--site-ink-inverse) 10%, transparent); backdrop-filter: blur(8px); border: 1px solid color-mix(in srgb, var(--site-primary) 20%, transparent); border-radius: var(--radius-pill); padding: 8px 16px; margin-bottom: 32px; color: var(--color-blue); font-size: 0.875rem; font-weight: 500; animation: heroFadeUp 0.5s ease both; }
.hero__heading { font-size: clamp(2.25rem, 6vw, 4.5rem); font-weight: 800; color: var(--site-ink-inverse); line-height: 1.08; letter-spacing: -0.02em; margin-bottom: 24px; animation: heroFadeUp 0.6s 0.1s ease both; }
.hero__heading-gradient { background: var(--grad-blue); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero__sub { font-size: 1.125rem; color: var(--site-ink-inverse-muted); line-height: 1.625; margin-bottom: 40px; max-width: 672px; margin-inline: auto; animation: heroFadeUp 0.6s 0.2s ease both; }
.hero__cta-row { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; margin-bottom: 56px; animation: heroFadeUp 0.6s 0.3s ease both; }
.hero__cta-sub { color: var(--site-ink-inverse-muted); font-size: 0.875rem; }
.btn-hero { display: inline-flex; align-items: center; gap: 12px; background: var(--grad-blue); color: var(--site-cta-ink); font-weight: 700; font-size: 1rem; padding: 16px 32px; border-radius: var(--radius-pill); box-shadow: 0 0 0 0 color-mix(in srgb, var(--site-primary) 30%, transparent); transition: box-shadow 0.3s ease, transform 0.2s ease; }
.btn-hero:hover { box-shadow: 0 8px 30px color-mix(in srgb, var(--site-primary) 35%, transparent); transform: scale(1.04); }
.hero__pills { display: grid; grid-template-columns: 1fr; gap: 16px; max-width: 672px; margin-inline: auto; animation: heroFadeUp 0.7s 0.45s ease both; }
.hero__pill { display: flex; align-items: center; justify-content: center; gap: 8px; background: color-mix(in srgb, var(--site-ink-inverse) 5%, transparent); backdrop-filter: blur(8px); border: 1px solid color-mix(in srgb, var(--site-ink-inverse) 10%, transparent); border-radius: 12px; padding: 12px 16px; color: color-mix(in srgb, var(--site-ink-inverse) 80%, transparent); }
.hero__pill-text { color: color-mix(in srgb, var(--site-ink-inverse) 80%, transparent); font-size: 0.875rem; font-weight: 500; }

@keyframes heroFadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@media (min-width: 640px) { .hero__pills { grid-template-columns: repeat(3, 1fr); } .hero__cta-row { flex-direction: row; } }
@media (min-width: 768px) { .hero__content { padding-top: 128px; padding-bottom: 96px; } .hero__sub { font-size: 1.25rem; } }

.trust-banner { position: relative; padding-block: 20px; overflow: hidden; background: var(--grad-blue); }
.trust-banner__inner { max-width: 1280px; margin-inline: auto; padding-inline: 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 32px; }
.trust-banner__item { display: flex; align-items: center; gap: 12px; }
.trust-banner__label { color: var(--site-ink-inverse); font-weight: 800; font-size: 0.875rem; letter-spacing: 0.15em; text-transform: uppercase; }
.trust-banner__dot { display: none; width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, var(--site-ink-inverse) 60%, transparent); }
@media (min-width: 640px) { .trust-banner__label { font-size: 1rem; } .trust-banner__dot { display: block; } }

.fade-in { opacity: 0; transform: translateY(20px); transition: opacity 0.5s ease, transform 0.5s ease; }
.fade-in.visible { opacity: 1; transform: translateY(0); }
.fade-left { opacity: 0; transform: translateX(-30px); transition: opacity 0.5s ease, transform 0.5s ease; }
.fade-left.visible { opacity: 1; transform: translateX(0); }
.fade-right { opacity: 0; transform: translateX(30px); transition: opacity 0.5s ease, transform 0.5s ease; }
.fade-right.visible { opacity: 1; transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .fade-in, .fade-left, .fade-right { opacity: 1; transform: none; transition: none; } }

.section { padding-block: 80px; overflow: hidden; }
.section--grey { background-color: var(--color-bg-light); }
.container { max-width: 1280px; margin-inline: auto; padding-inline: 16px; }
.section__header { text-align: center; margin-bottom: 56px; }
.section__heading { font-size: clamp(1.875rem, 4vw, 3rem); font-weight: 800; color: var(--color-navy); margin-bottom: 16px; line-height: 1.2; }
.section__sub { color: var(--color-muted); font-size: 1.125rem; max-width: 672px; margin-inline: auto; line-height: 1.625; }
@media (min-width: 768px) { .section { padding-block: 112px; } }

.reviews-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
.review-card { background: var(--site-surface); border: 1px solid var(--site-border); border-radius: 16px; padding: 24px; box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--site-ink) 5%, transparent); transition: box-shadow 0.5s ease; }
.review-card:hover { box-shadow: 0 20px 25px -5px color-mix(in srgb, var(--site-ink) 10%, transparent); }
.review-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.review-card__author { display: flex; align-items: center; gap: 12px; }
.review-card__avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.review-card__avatar-text { color: var(--site-cta-ink); font-size: 0.875rem; font-weight: 700; }
.review-card__name { font-weight: 600; color: var(--color-navy); font-size: 0.875rem; }
.review-card__time { font-size: 0.75rem; color: var(--color-muted); }
.review-card__stars { display: flex; gap: 2px; }
.review-card__text { margin-top: 16px; color: var(--color-muted); font-size: 0.875rem; line-height: 1.625; }
@media (min-width: 640px) { .reviews-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .reviews-grid { grid-template-columns: repeat(4, 1fr); } }

.types-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
.type-card { background: var(--site-surface); border: 1px solid var(--site-border); border-radius: 16px; padding: 32px; text-align: center; display: block; transition: border-color 0.5s ease, box-shadow 0.5s ease; color: inherit; }
.type-card:hover { border-color: color-mix(in srgb, var(--site-primary) 30%, transparent); box-shadow: 0 20px 25px -5px color-mix(in srgb, var(--site-ink) 10%, transparent); }
.type-card__icon-wrap { width: 64px; height: 64px; border-radius: 50%; background: var(--grad-blue-135); display: flex; align-items: center; justify-content: center; margin-inline: auto; margin-bottom: 20px; transition: transform 0.5s ease; }
.type-card:hover .type-card__icon-wrap { transform: scale(1.1); }
.type-card__title { font-size: 1.125rem; font-weight: 700; color: var(--color-navy); margin-bottom: 8px; }
.type-card__desc { color: var(--color-muted); font-size: 0.875rem; line-height: 1.625; margin-bottom: 16px; }
.type-card__cta { color: var(--color-blue); font-weight: 600; font-size: 0.875rem; }
.type-card:hover .type-card__cta { text-decoration: underline; }
@media (min-width: 640px) { .types-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .types-grid { grid-template-columns: repeat(4, 1fr); } }

.two-col { display: grid; grid-template-columns: 1fr; gap: 48px; align-items: center; }
@media (min-width: 1024px) { .two-col { grid-template-columns: repeat(2, 1fr); gap: 64px; } }
.panel-dark { border-radius: 24px; padding: 40px; text-align: center; background: linear-gradient(135deg, var(--site-ink), var(--site-ink)); position: relative; }
@media (min-width: 768px) { .panel-dark { padding: 56px; } }
.tag-pill { background: color-mix(in srgb, var(--site-ink-inverse) 10%, transparent); border: 1px solid color-mix(in srgb, var(--site-ink-inverse) 10%, transparent); color: var(--site-ink-inverse); font-size: 0.75rem; font-weight: 500; padding: 6px 12px; border-radius: var(--radius-pill); display: inline-block; }

.stat-badge { position: absolute; bottom: -16px; right: -16px; background: var(--site-surface); border-radius: 16px; box-shadow: 0 25px 50px -12px color-mix(in srgb, var(--site-ink) 25%, transparent); padding: 12px 20px; border: 4px solid var(--site-surface); }

.bullet-row { display: flex; align-items: flex-start; gap: 12px; }
.bullet-row__icon { width: 12px; height: 12px; border-radius: 50%; background: var(--grad-blue-135); flex-shrink: 0; margin-top: 8px; box-shadow: 0 0 0 4px color-mix(in srgb, var(--site-primary) 10%, transparent); }
.bullet-row__text { color: var(--color-muted); font-size: 1rem; line-height: 1.625; margin: 0; }

.footer { background: linear-gradient(135deg, var(--site-ink), var(--site-ink) 50%, var(--site-ink)); color: var(--site-ink-inverse); padding-block: 64px 32px; }
.footer__inner { max-width: 1280px; margin-inline: auto; padding-inline: 16px; }
.footer__grid { display: grid; grid-template-columns: 1fr; gap: 40px; padding-bottom: 40px; border-bottom: 1px solid color-mix(in srgb, var(--site-ink-inverse) 10%, transparent); }
@media (min-width: 768px) { .footer__grid { grid-template-columns: 2fr 1fr 1fr; gap: 64px; } }
.footer__logo { height: 48px; width: auto; margin-bottom: 20px; }
.footer__desc { color: color-mix(in srgb, var(--site-ink-inverse) 70%, transparent); font-size: 0.95rem; line-height: 1.625; max-width: 420px; }
.footer__heading { font-size: 1rem; font-weight: 700; color: var(--site-ink-inverse); margin-bottom: 16px; letter-spacing: 0.05em; }
.footer__link { display: block; color: color-mix(in srgb, var(--site-ink-inverse) 70%, transparent); padding: 6px 0; font-size: 0.95rem; transition: color 0.2s; }
.footer__link:hover { color: var(--color-blue-start); }
.footer__contact-row { display: flex; align-items: center; gap: 8px; color: color-mix(in srgb, var(--site-ink-inverse) 70%, transparent); padding: 6px 0; font-size: 0.95rem; transition: color 0.2s; }
.footer__contact-row:hover { color: var(--color-blue-start); }
.footer__bottom { padding-top: 32px; display: flex; flex-direction: column; gap: 16px; align-items: center; text-align: center; }
.footer__copyright { font-size: 0.875rem; color: color-mix(in srgb, var(--site-ink-inverse) 50%, transparent); }
.footer__legal { font-size: 0.75rem; color: color-mix(in srgb, var(--site-ink-inverse) 40%, transparent); max-width: 768px; line-height: 1.625; }
.footer__policy-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 24px; padding-top: 8px; }
.footer__policy-link { font-size: 0.875rem; color: color-mix(in srgb, var(--site-ink-inverse) 60%, transparent); transition: color 0.2s; }
.footer__policy-link:hover { color: var(--color-blue-start); }
@media (min-width: 768px) { .footer__bottom { flex-direction: row; justify-content: space-between; text-align: left; align-items: flex-start; } .footer__policy-links { justify-content: flex-end; } }

/* ───────── How It Works ───────── */
.hiw-grid { display: grid; grid-template-columns: 1fr; gap: 32px; max-width: 960px; margin-inline: auto; }
@media (min-width: 768px) { .hiw-grid { grid-template-columns: repeat(3, 1fr); } }
.hiw-card { text-align: center; }
.hiw-card__icon { width: 64px; height: 64px; border-radius: 16px; background: var(--grad-blue-135); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: var(--shadow-lg); transition: transform .5s ease; }
.hiw-card:hover .hiw-card__icon { transform: scale(1.08); }
.hiw-card__step { color: var(--color-blue); font-weight: 700; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
.hiw-card__title { font-size: 1.25rem; font-weight: 700; color: var(--color-navy); margin-bottom: 12px; }
.hiw-card__desc { color: var(--color-muted); font-size: 0.95rem; line-height: 1.625; }

/* ───────── USPs ───────── */
.usp-grid { display: grid; grid-template-columns: 1fr; gap: 24px; max-width: 960px; margin-inline: auto; }
@media (min-width: 768px) { .usp-grid { grid-template-columns: repeat(3, 1fr); } }
.usp-card { background: linear-gradient(to bottom right, var(--site-surface), var(--color-bg-light)); border: 1px solid var(--color-border); border-radius: 16px; padding: 32px; transition: box-shadow .3s ease, border-color .3s ease; }
.usp-card:hover { border-color: color-mix(in srgb, var(--site-primary) 30%, transparent); box-shadow: var(--shadow-lg); }
.usp-card__icon { width: 56px; height: 56px; border-radius: 16px; background: var(--grad-blue-135); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: var(--shadow-md); transition: transform .3s ease; }
.usp-card:hover .usp-card__icon { transform: scale(1.08); }
.usp-card__title { font-size: 1.25rem; font-weight: 700; color: var(--color-navy); margin-bottom: 12px; }
.usp-card__desc { color: var(--color-muted); font-size: 0.95rem; line-height: 1.625; }

/* ───────── Fighting For You ───────── */
.section--dark { background: var(--grad-dark); position: relative; padding-block: 80px; overflow: hidden; }
.section--dark::before { content: ""; position: absolute; inset: 0; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"); pointer-events: none; }
@media (min-width: 768px) { .section--dark { padding-block: 112px; } }
.fighting .container { position: relative; z-index: 2; }
.fighting__badge { display: inline-flex; align-items: center; gap: 8px; background: color-mix(in srgb, var(--site-primary) 20%, transparent); border-radius: var(--radius-pill); padding: 8px 16px; color: var(--color-blue); font-weight: 700; font-size: 12px; letter-spacing: 0.05em; margin-bottom: 24px; }
.fighting__sub { color: var(--site-ink-inverse-muted); font-size: 1.125rem; line-height: 1.625; margin-bottom: 32px; }
.fighting__row { display: flex; align-items: center; gap: 16px; background: color-mix(in srgb, var(--site-ink-inverse) 10%, transparent); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 1px solid color-mix(in srgb, var(--site-ink-inverse) 20%, transparent); border-radius: 12px; padding: 14px 16px; transition: background-color 0.2s; }
.fighting__row:hover { background: color-mix(in srgb, var(--site-ink-inverse) 15%, transparent); }
.fighting__row-icon { width: 40px; height: 40px; border-radius: 12px; background: var(--grad-blue-135); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fighting__row-text { color: var(--site-ink-inverse); font-weight: 500; font-size: 0.95rem; }
.fighting__photo { width: 100%; height: auto; border-radius: 24px; box-shadow: var(--shadow-2xl); display: block; }
.fighting__photo-overlay { position: absolute; inset: 0; border-radius: 24px; background: linear-gradient(to top, color-mix(in srgb, var(--site-ink) 30%, transparent), transparent); pointer-events: none; }
.fighting__badge-tr { position: absolute; top: 16px; right: 16px; background: var(--grad-blue-135); border-radius: 12px; padding: 10px 18px; box-shadow: var(--shadow-lg); }
.fighting__badge-bl { position: absolute; bottom: -20px; left: -20px; background: var(--site-surface); border: 4px solid var(--color-bg-light); border-radius: 16px; padding: 12px 20px; box-shadow: var(--shadow-2xl); }

/* ───────── No Win, No Fee ───────── */
.nwnf__photo { width: 100%; height: auto; border-radius: 24px; box-shadow: var(--shadow-2xl); display: block; }
.nwnf__overlay { position: absolute; inset: 0; border-radius: 24px; background: linear-gradient(to top, color-mix(in srgb, var(--site-ink) 60%, transparent), transparent); pointer-events: none; }
.nwnf__badge { position: absolute; bottom: -24px; right: -24px; background: var(--site-surface); border: 4px solid var(--color-navy); border-radius: 16px; padding: 14px 18px; box-shadow: var(--shadow-2xl); display: flex; align-items: center; gap: 12px; }
.nwnf__bullet { display: flex; align-items: flex-start; gap: 12px; }
.nwnf__bullet-icon { width: 22px; height: 22px; border-radius: 50%; background: var(--grad-blue-135); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.nwnf__highlight { background: color-mix(in srgb, var(--site-primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--site-primary) 30%, transparent); border-radius: 16px; padding: 24px; color: var(--color-blue); font-weight: 800; font-size: 1.5rem; text-align: center; letter-spacing: 0.02em; }

/* ───────── Recent Wins ───────── */
.wins-grid { display: grid; grid-template-columns: 1fr; gap: 24px; max-width: 896px; margin-inline: auto; }
@media (min-width: 768px) { .wins-grid { grid-template-columns: repeat(3, 1fr); } }
.win-card { background: var(--site-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 32px; text-align: center; transition: box-shadow .3s ease, border-color .3s ease; }
.win-card:hover { border-color: color-mix(in srgb, var(--site-primary) 40%, transparent); box-shadow: var(--shadow-lg); }
.win-card__icon { width: 48px; height: 48px; border-radius: 50%; background: color-mix(in srgb, var(--site-primary) 15%, transparent); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
.win-card__label { color: var(--color-muted); font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
.win-card__amount { font-size: 2rem; font-weight: 800; background: var(--grad-blue); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 4px; }
.win-card__name { color: var(--color-navy); font-weight: 600; }
.win-card__loc { color: var(--color-muted); font-size: 0.875rem; }

/* ───────── About ───────── */
.about-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 480px; }
.about-stat { background: var(--color-bg-light); border-radius: 12px; padding: 16px; text-align: center; }
.about-stat__v { color: var(--color-navy); font-size: 1.75rem; font-weight: 800; }
.about-stat__l { color: var(--color-muted); font-size: 0.875rem; }
.about-card { background: linear-gradient(135deg, var(--site-primary-50), color-mix(in srgb, var(--site-primary) 20%, transparent)); border-radius: 24px; padding: 32px; }
@media (min-width: 768px) { .about-card { padding: 48px; } }
.about-feature { display: flex; align-items: center; gap: 12px; background: color-mix(in srgb, var(--site-ink-inverse) 85%, transparent); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border-radius: 12px; padding: 12px 16px; color: var(--color-navy); font-size: 0.95rem; margin-bottom: 12px; }
.about-feature__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-blue); flex-shrink: 0; }

/* ───────── FAQ ───────── */
.faq-section { background: linear-gradient(to bottom right, var(--site-surface-2), var(--site-surface)); }
.faq-badge { display: inline-flex; align-items: center; gap: 8px; background: color-mix(in srgb, var(--site-primary) 10%, transparent); color: var(--color-blue); font-weight: 700; font-size: 12px; letter-spacing: 0.05em; padding: 8px 16px; border-radius: var(--radius-pill); margin-bottom: 16px; }
.faq-item { background: var(--site-surface); border: 1px solid var(--color-border); border-radius: 16px; overflow: hidden; transition: box-shadow .3s ease; }
.faq-item:hover { box-shadow: var(--shadow-md); }
.faq-item__btn { width: 100%; display: flex; align-items: center; gap: 16px; padding: 20px 24px; text-align: left; transition: background-color 0.2s; }
.faq-item__btn:hover { background: var(--color-bg-light); }
.faq-item__qicon { width: 36px; height: 36px; border-radius: 50%; background: color-mix(in srgb, var(--site-primary) 10%, transparent); color: var(--color-blue); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .3s ease; }
.faq-item__qicon.open { background: var(--grad-blue-135); color: var(--site-ink-inverse); }
.faq-item__q { flex: 1; color: var(--color-navy); font-weight: 600; font-size: 1rem; }
.faq-item__q.open { color: var(--color-blue); }
.faq-item__chev { color: var(--color-muted); transition: transform .3s ease; flex-shrink: 0; }
.faq-item__a { padding: 0 24px 24px 76px; color: var(--color-muted); font-size: 0.95rem; line-height: 1.625; }

/* -------------------------------------------------------------------------- */
/* Builder canvas overrides                                                   */
/* -------------------------------------------------------------------------- */
/* The bespoke design uses position:fixed for the navbar and min-height:100vh
   for the hero. Both anchor to the BROWSER VIEWPORT (vh + fixed always do),
   so inside the admin builder canvas they escape the center pane and cover
   the left section list / right settings panel.

   Inside the builder canvas (.pageflo-builder-canvas, and .legalos-builder-canvas
   for pages imported before the rename) we re-anchor the navbar to absolute so it
   stays inside the canvas, give the canvas relative positioning, and trim
   the hero to a sensible viewable height. The public site is unaffected
   because these selectors are scoped to the builder wrapper only. */
.legalos-builder-canvas, .pageflo-builder-canvas { position: relative; isolation: isolate; }
.legalos-builder-canvas .navbar, .pageflo-builder-canvas .navbar { position: absolute; }
.legalos-builder-canvas .hero, .pageflo-builder-canvas .hero { min-height: 540px; margin-top: 0; }
.legalos-builder-canvas .hero__content, .pageflo-builder-canvas .hero__content { padding-top: 96px; }
/* The hero's full-viewport image was also bleeding through because img dims
   inherit nothing from a sized parent until object-fit kicks in. inset:0
   keeps it inside .hero. */
.legalos-builder-canvas .hero__bg-img, .pageflo-builder-canvas .hero__bg-img { max-width: 100%; }
/* The .section--dark and .footer use width:100% and rely on viewport-anchored
   positioning for their decorative ::before patterns; nothing escapes the
   container so they're fine. No override needed. */
`
