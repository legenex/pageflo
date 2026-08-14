# Reviewer C — Browser / UX / Template / Rendering (adversarial)

Base `http://localhost:3000`, super-admin `team@legenex.com`. Chromium `/opt/pw-browsers/chromium`.
Method: drove the running product desktop (1440×1000) + mobile (390×844); node:http Host-header for the true anonymous-visitor path; SQL reads for verification; source-composition probes for the all-12 quiz-mount claim. All state I mutated was reverted (final DB: 12 LP templates, 20 quiz templates, 0 anomalies, deployments unchanged; git has no tracked-source changes). Probe scripts: `scripts/.probe-*.mts` (gitignored). Screenshots: `scratchpad/shotsC/`. Logs: `scratchpad/agent-reports/{uiC-baseline,gapsC,gaps2C,mobileC,mobilePubC,cloneFieldsC}.log`.

The product's own `scripts/test-admin-ui.mts` was run as a baseline: **zero FAIL lines** through every desktop section it completed (LP tabs, keyboard nav+focus-ring contrast, 12 LP templates + per-row actions, clone/delete/stock-archive, LP deployment editor 3 tabs + gallery paints + select persists, 20 quiz templates, quiz deployment editor + gallery). It was killed by its own 400s timeout during the public-render/mobile phase; I covered those independently below.

## DEFECTS

**D1 (MEDIUM) — LP "Create with Claude" fails silently, persisting an unwritten template and reporting success.**
`ANTHROPIC_API_KEY` is empty here. On the LP Templates tab → "New template with Claude" → walk 4 steps → Generate: the wizard created a real row and showed **no error** (`funnel_landing_pages` 12→13; row id 45 "Probe AI Template", origin `blank`, 12 skeleton sections, `is_published=t is_enabled=t`), then closed as if successful. Root cause: `aiWriteSectionNodes` (`src/app/(app)/admin/(top)/landing-pages/actions.ts:425`) catches the invokeLLM throw and returns `{ok:false}`; the wizard's `generate()` (`LandingPagesApp.tsx:348`) does `if (!res.ok) return section`, keeps the unwritten section, and still calls `onCreate`. This also fires on any *transient* AI outage in production — the operator is told "Claude created X" with placeholder copy. Contrast the **quiz** path, which is correct: throw → `{ok:false}` surfaced in the error box, **no** record created (count 20→20, not stuck on "Writing…"). Evidence: `gapsC.log`, `shotsC/lp-ai-result.png`. Not a crash or corrupt row, but a misleading silent-degradation inconsistent with the sibling feature. (I deleted the leftover row via the UI.)

## COULD NOT FULLY TEST

- **case_type_router live interaction (item 14 adversarial case):** no live/draft deployment exists on it and direct DB writes are blocked by the environment's write guardrail, so I could not drive its page in a browser. Source-composition proof (below) shows its quiz-card hole is emptied and one mount marker inserted, with its 8 case-type cards correctly left *outside* the hole — same mechanism as the templates I did drive live.
- **authority_network on the true anonymous path:** it is `draft`, so it correctly 404s to a real visitor (node:http). I proved it via the authenticated `?site=` preview channel (same resolver + renderer). Promoting it to live was blocked by the write guardrail.
- **Disable-warning text for a *referenced* template:** verified in code (`template-actions.ts:251` returns "N deployments still render this and will keep doing so"); empirically I disabled an *unreferenced* template (correctly no warning). Resolver serves existing deployments regardless of `is_enabled` (gates on `is_published`), so existing pages keep working — confirmed.

## WORKING (1–15)

1. **LP gallery** — 12 cards, each paints a real render (suite thumbColours>8), Preview→real modal (`role=dialog` w/ Desktop/Mobile toggle), Select + clear selected state. ✓
2. **Quiz gallery** — 20 cards (DB=20), Preview/Select real buttons. ✓
3. **Template editors** — LP: live `.lp-preview-root` renders (78 distinct colors), editable slot textareas after picking a section, Disable btn. Quiz: modal with editable Name/Blurb/Renderer/Progress + live preview rendering a real question (`shotsC/quiz-template-editor.png`). ✓
4. **Cloning** — LP clone row id 46 renderable (128 colors), origin `clone`, unique PK (shares renderer `template_id` by design; deployments bind by row id). Quiz clone `sq_editorial_inline_copy_uy3nbf` = new unique template_id over same renderer, renderable (149 colors). DB-verified, both deleted after. ✓
5. **Enable/Disable** — disabled template's new-deployment gallery card = `data-blocked="true"`, Select **disabled**, DISABLED pill (cannot pick for new); existing deployments keep rendering (resolver gates on `is_published`). Reverted. ✓
6. **Delete/Archive** — referenced "Human Recovery Story" delete **refused** ("cannot be deleted…still use…repoint…or disable"), row intact (DB unchanged); unreferenced clone hard-deletes; stock rows archive (`archived_at`, code+suite). ✓
7. **Create with Claude** — quiz path clean (see D1 contrast); both wizards open + wired. LP path = D1.
8. **Deployment General** — gallery present, selection persists across save+reload (suite, no FAIL), prominent headings. ✓
9. **Destination URL's / Tracking & Pixels** — LP + Quiz: 6 and 3 editable fields respectively, Save present, no errors. ✓
10. **Keyboard/focus** — suite passed: tabs reachable by Tab, focus ring contrast ≥3:1 measured, Enter+Space activate, single aria-current. ✓
11. **Overflow 390px** — LP templates, LP deploy editor, quiz templates, quiz deploy editor, public LP (both templates) all scrollW==390. ✓
12. **Console/page errors** — none across every screen visited (only the known cross-origin Google-Fonts resets, filtered). ✓
13. **Renderer identity** — dep17 (DB `human_recovery_story`) renders its own headline, no foreign copy; dep18 (DB `answer_first`) same; markup genuinely differs (80290 vs 59013 bytes); node:http Host path 200. Matches DB ids, no fallback. ✓
14. **Real embedded QuizRuntime, materially-different templates, same MVA flow (RELEASE-CRITICAL)** — human_recovery_story (live), answer_first (live), authority_network (preview): each portals the **real** QuizRuntime into `[data-legalos-quiz-mount]` (`[data-quiz-root]` present, 4 `[data-quiz-answer]` in-hole, **0 static answer tiles outside**); clicking an answer advances (step 1→3, progress→17%); surrounding hero/editorial/header-phone all survive (`shotsC/public-human_recovery_story.png`). Source-composition proof over **all 12**: each removes 5-6 static answer buttons, `holeEmpty=true`, exactly **one** mount marker; case_type_router keeps its 8 presentation cards *outside* the hole. No template renders static quiz-acting markup. ✓
15. **No empty box** — gallery cards + editor previews all paint (colors 78/128/149; suite thumbColours>8). Un-mounted contexts render the inert reference card (`mounted=Boolean(quiz)` → `composed.html`), not a hole. ✓
