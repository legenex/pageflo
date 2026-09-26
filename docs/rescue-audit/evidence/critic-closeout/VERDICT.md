# Critic closeout verdict

**VERDICT: FAIL**

Reviewer: Critic. Date: 2026-09-25. Independent of Dexter/closeout `report.json` (37/0, empty `notes`).

Measured SHAs:

- `origin/main` and local: `c9d3385` (test-harness only after prod)
- Production Plesk git: `b631690` (`Rescue Closeout: resolve {year} copyright and complete quiz selects`)
- App health: `https://app.pageflo.io/api/pageflo/health` 200, `https://os.legenex.com/api/legalos/health` 200
- `forge-pack/state/HANDOFF.md` is stale (claims prod `5d642c0` / GitHub `43c45fa`)
- `DEFECT-REGISTER.md` is still the 2026-09-24 open list; it was never marked resolved

Brand under test: `pageflo-rescue-acceptance-944138` (site 23, `active`).

---

## Required proofs

| # | Proof | Result |
|---|---|---|
| 1 | Operator login `team@legenex.com` | **PASS.** Independent Playwright reached `/admin/overview` as `team` / Owner. Credentials used from `/home/legenex/.pageflo-admin-credentials` (password not printed). Evidence: `01-sign-in.png`, `02-after-login.png`. |
| 2 | Brand Home preview 200 both suffixes | **PASS.** `https://pageflo-rescue-acceptance-944138.preview.pageflo.io/` and `.preview.legenex.com/` HTTP 200, title Home for this Brand. |
| 3 | Quiz visitor 200, no graph labels | **PASS.** `/s/pageflo-rescue-acceptance-944138` 200. Visible copy is visitor questions (`How Were You Injured?`), not `Injury Type12121212` / `/submitted (Qualified)`. Closeout `10-quiz-start.png` / `12-quiz-submitted.png` match. |
| 4 | LP live 200, no junk | **PASS.** `/c/pageflo-rescue-acceptance-944138` 200 both suffixes. Visible HTML has no `{{site.name}}`, `(800) 000-0000`, or `Dynamic figure`. |
| 5 | Advertorial live 200, no junk | **PASS** on live paths `/adv/rescue-qamugk8e9r` and `/adv/pinmugkkmjl`. Seeded `/adv/letter` on this Brand is **404** (Dont Settle `/adv/letter` is 200 and clean). Visible advertorial copy has no authoring junk. |
| 6 | Snapshot: live unchanged after master edit, changed after republish | **PASS** on product, **weak on closeout evidence.** `snap-before.html` title `Snapshot before pinmugkkmjl`; `snap-after.html` / live now `Snapshot after PINTEST-pinmugkkmjl`. Closeout did not persist mid-edit live HTML (`snap-zz.png` is a failed earlier run at 08:17). Critic independently updated master id 17 headline to a probe marker; live stayed on the pinned AFTER headline; master was reverted. `published_snapshot.master.sections` headline remains AFTER. |
| 7 | Durable Lead 12 in DB + Leads UI | **PASS.** DB id 12, QA email `pageflo-qa-qamugk8e9r@legenex.test`, site 23, `test_capture=f`. List shows Lead 12. Closeout `61-lead-detail.png` is **Overview, not a lead** (false positive). Critic opened the modal via `Open lead 12`. Evidence: `03-leads.png`, `05-lead-12-modal.png`. |
| 8 | `delivery_log` `downstream.completed` | **FAIL as an operator proof; PASS in SQL only.** `leads_delivery_log` for lead 12 is one row: `step=downstream.completed`, `ok=t`. The Leads UI shows **Delivery: Pending** and Delivery Log: no attempts recorded / disqualified-and-never-dispatched. That is false for a submitted qualified quiz lead. `deliveryState` / `isDeliveryStep` match webhook/deliver/dispatch/post and miss `downstream.completed`. Evidence: `07-lead-12-delivery.png`. |
| 9 | UTMs on lead 12 | **PASS in DB and in the System Response tab.** `utm_source=rescue-qa`, `utm_medium=closeout`, `utm_campaign=qamugk8e9r`, `landing_path=/s/pageflo-rescue-acceptance-944138`. Closeout never opened that tab. Evidence: `06-lead-12-system.png`. |
| 10 | Zero unresolved autonomous P0/P1, or HUMAN-GATED with exact DNS action | **FAIL.** See remaining defects. No closeout artifact records an exact DNS action (hostname, type, current, required, why, rollback). |
| 11 | Test quality: production Playwright that clicks, not source-regex theatre | **FAIL.** `scripts/test-production-acceptance.mts` and `test-production-snapshot.mts` do click production, which is the right shape. The closeout run still launders passes: `t(true, 'F clone control probed')`; lead-detail selector clicked Overview and matched the word delivery; LP `Publish deployment` first-button republished Dont Settle (`23-lp-publish-clicked.png` toast on that row); snapshot mid-HTML not saved; `report.json` is a scoreboard with empty `notes`. |

Visitor-visible junk on Dont Settle home / `/adv/letter` / `/c` is gone (REG-P0-009 for this check). ACH `/` is now 200 (REG-P0-007).

---

## Remaining P0/P1 (autonomous unless marked)

- **Lead delivery UI** — qualified Lead 12 has `downstream.completed` and the console tells the operator it was never dispatched. Autonomous.
- **REG-P1-014** — acceptance and other new-Brand LP rows still badge `legacy binding` (`23-lp-publish-clicked.png`). Autonomous.
- **REG-P1-018** — `/cms` 200 Payload dashboard; `/cms/forgot` 200. `/forgot` 404s. Second admin still exists. Autonomous.
- **REG-P0-010** — still no serving custom domain. Autonomous DNS-copy lie was not re-observed on pending `.example` rows (they show PENDING, not “serves”). **HUMAN-GATED** remainder is a real customer hostname + TLS, and the exact DNS action was **not written down**.
- **REG-P1-015** — Payload server URL still the legacy `os.legenex.com` origin. Human-adjacent env; not a DNS ticket.
- **REG-P1-009** — opening a Brand still replaces the funnel OS with Site CMS (`03-brand-general.png`: Pages / Blog / Numbers). Not closed.
- Funnel **master** collections remain `isAuthenticated` on write (library). Deployment writes are hooked (`enforceDeploymentTenancy`). Stated P0-011 acceptance (cannot update another Brand’s **deployment**) is the hook; master writes are residual.

P0-001/003/007/008/009 look fixed on this Brand / this login / this pin probe. Register was not updated.

HUMAN-GATED DNS (required shape, not executed):

- Do **not** change unmatched SNI `crashclaim.co`.
- Do **not** flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
- For a real customer host the operator names: CNAME to current `LEGALOS_CNAME_TARGET` (`os.legenex.com`) **or** an approved dedicated CNAME target; wait for TLS `ssl_status=active` before UI says it serves; rollback = delete the DNS record. Closeout never named a hostname.

---

## False-positive risks

- Next.js RSC payload always embeds the 404 template and serialized `{{brand.displayName}}` / quiz `{{tier}}` tokens. Grepping raw HTML for `{{` or “Page not found” is theatre. Visible text on these URLs is clean.
- Closeout `report.json` 37/0 does not prove 37 real operator steps.
- `61-lead-detail.png` is Overview; the word delivery matches Overview telemetry.
- Snapshot `snap-before` vs `snap-after` only proves republish changed copy, not that the pin held, until an independent master mutation (done here, reverted).
- LP/advertorial harnesses click the first Publish/Republish on the page. Production side effect: Dont Settle LP pin toast; eight live untitled advertorials on site 23; unassigned `qa-*.example` domains.
- Consent “None recorded” is TrustedForm/Jornaya absence, not proof the TCPA checkbox was stored. Do not read it as a TCPA pass.
- `last_login_at` on the operator user is still null after a successful custom sign-in. Do not use that column as login evidence.

---

## Exact repair units

1. **RU-LEAD-DELIVERY-UI** — Treat `downstream.completed` as a completed pipeline in `deliveryState` / `isDeliveryStep`. Delivery Log must list that row. Never describe a submitted qualified lead as DQ-not-dispatched. Re-prove on Lead 12: modal Delivery is not Pending-for-DQ; log shows `downstream.completed`.
2. **RU-P1-014** — Bind new-Brand / acceptance LP deployments to a quiz flow so editor Quiz Flow matches live; drop `legacy binding` on those rows.
3. **RU-P1-018** — `/cms` and `/cms/forgot` must not be a working second admin (redirect to `/sign-in` or disable Payload admin login).
4. **RU-P0-010-GATE** — Write the HUMAN-GATED DNS action with hostname, record type, current value, required value, why, rollback. Do not touch default SNI or `PAGEFLO_LEGACY_HOST_REDIRECT`.
5. **RU-CLOSEOUT-HARNESS** — Persist mid-edit live HTML for the pin proof; open Lead 12 with `Open lead 12` and screenshot System Response + Delivery Log; delete `t(true)`; never click the first Publish on a mixed list (Dont Settle was republished).

Do not treat a re-run of `pnpm test:production-acceptance` as a pass until those units are done.

---

## Critic evidence

`docs/rescue-audit/evidence/critic-closeout/`: this file, `01-sign-in.png`, `02-after-login.png`, `03-leads.png`, `05-lead-12-modal.png`, `06-lead-12-system.png`, `07-lead-12-delivery.png`.
