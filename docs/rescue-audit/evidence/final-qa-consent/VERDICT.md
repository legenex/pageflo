**VERDICT: PASS**

Run id: `cq260926a` (UTM campaign). Date 2026-09-26. Target https://app.pageflo.io, acceptance Brand `pageflo-rescue-acceptance-944138`.
**NEW LEAD ID: 42** (FinalQA / "Consent cq260926a" / finalqa-cq260926a@legenex.test).
Production SHA measured: `88fdc34 Inline delivery fallback runs under the per-Lead lock` (`git log -1 main` on the pageflo host).
Only write made: the one visitor lead (42). Tagline change skipped (optional). Dry-run walks stopped at the form and created no lead (Leads search for FinalQA returned exactly 1 row). No publish/pause/duplicate/delete clicked; no other Brand touched.

## Steps

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Sign in, land on console | PASS | 01-sign-in, 02-console-landing; landed on /admin/overview ("Owner - all brands") |
| 2 | Brand General Settings, TCPA populated | PASS | 03-brands, 05-brand-general-settings; TCPA field value: "By checking this box, I agree that PageFlo QA may contact me by phone, text message or email about my request. Message and data rates may apply. Consent is not a condition of purchase." Not edited. Tagline test: not verified (skipped). |
| 3 | Brand Home on both preview hosts | PASS | 06-home-pageflo.io, 06-home-legenex.com; both 200; scan for `{{`, "(800) 000-0000", "Dynamic figure", "[Author]", "X min read" found none. (See D3.) |
| 4 | Visitor quiz, branches, form, consent, ONE submit, thank-you | PASS | 07/s7-step*, s7-branchB-next, s7-back (Commercial/Semi -> State page -> Back -> first question -> Auto/Motorcycle). Form: checkbox unchecked ("CHECKED initially: false"), disclosure beside it identical to Brand TCPA text. Unchecked submit (click + Enter): visible "Please check the box to agree before continuing." and 0 POSTs (08, 09, 10). Checked + submit: POST /api/leads -> 200 `lead_id 42`. Thank-you "Thank You! An Attorney Will Reach Out Shortly." unchanged after 6s more (12-thankyou, 12b). No authoring notes. |
| 5 | Landing /c/ embedded quiz | PASS | 13-landing, 15-landing-form: reaches same form, checkbox unchecked, disclosure text identical to step 4 (string-equal). No second lead submitted. No junk. |
| 6 | Advertorial /adv/qa-acceptance | PASS | 16-advertorial; 200, no starter placeholder copy; copy is the QA article ("This article exists to prove the acceptance run can publish, edit and republish..."). Byline reads "2 min read" (real value, not "X min read"). |
| 7 | Deployments read-only | PASS | 17-landing-deployments, 18-advertorial-deployments, 19-deployments. Landing: "PageFlo Rescue Acceptance 944138 - Human Recovery Story LIVE UNCHECKED EDITS ARE LIVE ... /c/pageflo-rescue-acceptance-944138" (D2). Advertorials: "QA Acceptance Advertorial ... LIVE ... /adv/qa-acceptance"; rescue-qamugk8e9r/5cyn/jya5z LIVE; 1 DRAFT; 5 PAUSED. Deployments: "MVA Tiered Quiz T4 Quiz PageFlo Rescue Acceptance 944138 ... /s/pageflo-rescue-acceptance-944138 Live". |
| 8 | Leads UI proof | PASS | see below |
| 9 | Console health | PASS with P2s | health endpoints 200 (`{"ok":true,"app":"legalos"}`); JS errors recorded in D1 |

## Step 8: Leads UI proof for lead 42 (screens: 20-leads, 21-leads-search, lead42-summary, lead42-consent-evidence, lead42-SystemResponse, lead42-HLRTrace, lead42-DeliveryLog)
- Contact data: NAME "FinalQA Consent cq260926a", EMAIL "finalqa-cq260926a@legenex.test", PHONE "(512) 555-0147", STATE / ZIP "TX / 78701".
- Brand: SITE "PageFlo Rescue Acceptance 944138"; consent evidence BRAND "PageFlo Rescue Acceptance 944138".
- Source: SOURCE "Quiz", SOURCE ID "25"; consent evidence FUNNEL TYPE "quiz", FUNNEL "mva", DEPLOYMENT "25", PAGE PATH "/s/pageflo-rescue-acceptance-944138"; attribution landing_path "/s/pageflo-rescue-acceptance-944138". Deployment 25 = the MVA Tiered Quiz T4 deployment on this Brand (step 7).
- Qualification (System Response, CAPTURED ANSWERS): accident_type "auto", incident_date "2026-08-01", injury_type "fatality", treatment_type "surgery", treatment_time "still_treating", fault "no", fault_type "someone_else", attorney "never", insurance "both", accident_details "Rear-ended at a red light...". (My script picked the first option in the injury dropdown; not a product issue.)
- Consent: list CONSENT "Accepted"; DISCLOSURE THE VISITOR ACCEPTED "By checking this box, I agree that PageFlo QA may contact me by phone, text message or email about my request. Message and data rates may apply. Consent is not a condition of purchase." (equals text beside checkbox); ACCEPTED "Yes, by checking an unchecked box; the text matches this Brand's TCPA text"; ACCEPTED AT "2026-09-26T18:29:05.789Z"; METHOD "checkbox_unchecked_default"; BRAND, HOST "pageflo-rescue-acceptance-944138.preview.pageflo.io", FUNNEL TYPE quiz, FUNNEL mva, DEPLOYMENT 25.
- UTMs/attribution: utm_source "finalqa", utm_medium "browser", utm_campaign "cq260926a", session_id, event_id, landing_path.
- Phone validation (HLR Trace): RESULT "Unavailable: not configured"; "No lookup was made because the provider is not configured (missing plivo credentials). This says nothing about the number."; stored state "not_configured". No fabricated Valid.
- Queue/delivery (Delivery Log): header "Delivery: No destination configured"; "No destination attempted ... nothing was sent to an outside party"; history: lead.captured ok, delivery.queued ok ("waiting for the delivery worker"), delivery.processing ok ("queue pass 1"), downstream.completed ok ("no destination configured: nothing was sent to an outside party"). No delivery.queue_unavailable. Not "Delivered".
- No Retry: dialog buttons were only Summary, System Response, HLR Trace, CAPI Log, Delivery Log, Copy payload, Copy lead id (plus status select). No Retry.
- Old leads (12, 13, 14; lead12/13/14 summary + DeliveryLog captured): all open and readable; CONSENT "Not recorded" with "Consent was not recorded for this lead... No consent is inferred from any other field."; DELIVERY "No destination configured"; Delivery Log shows only downstream.completed with "No destination attempted"; no Delivered/queued claim; HLR "Unavailable: not configured".

## Defects
- **D1 (P2)** React error #418 (hydration text mismatch) pageerror on /admin/leads (also with search and with lead modal open) and /admin/deployments. Page renders and works. Repro: sign in, open /admin/leads, watch console.
- **D2 (P2)** Landing deployment for the acceptance Brand shows "LIVE UNCHECKED EDITS ARE LIVE ... serving changes that have not been through a publish check; last passing version published Sep 25, 8:30 AM". Honest label, but a live page is serving unchecked edits.
- **D3 (P2, observation)** Brand Home hero form checkbox disclosure differs from the Brand TCPA text ("By submitting your information you agree to be contacted by PageFlo Rescue Acceptance 944138 and our partner law firms by phone, text, and email ... See our TCPA consent and privacy notice."). I did not submit it; whether it records consent correctly is not verified.
- **D4 (P2)** Quiz nodes n_tier_lookup and n_hlr_lookup POST /api/pageflo/quiz-webhook return 502 `{"ok":false,"error":"webhook unavailable"}` on each run (browser console errors). Visitor flow and lead capture continue unaffected; lead 42 was created 200.
- None P0/P1.
