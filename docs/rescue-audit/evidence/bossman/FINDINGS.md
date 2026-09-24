# Bossman production evidence (2026-09-24)

Login: `capture@legenex.com` (BUILDLOG_CAPTURE). `SUPER_ADMIN_EMAIL=team@legenex.com` in production `.env` does **not** match the DB hash. REST login with that password returns 401. Five failed attempts locked the user until we cleared `login_attempts`.

GitHub HEAD `0818c76`. Production SHA `b54e8bd` (docs-only drift).

## Proven in browser / HTTP / DB

1. New Brand `rescue-qa-20260923` created from UI. Dashboard immediately showed Partial, View Live Site, "2 Live funnels serving this Site now". Anonymous preview 404 until Publish brand. After publish: home, `/s/...`, `/c/...` all 200 on both `preview.pageflo.io` and `preview.legenex.com`.

2. Accident Compensation Helper had status Draft, Delivery Serving, domains ACTIVE, View Live Site. Home still 404 after Publish because **there is no `pages` row at `/`**. Quiz path 200 after publish. DB: 8 legal pages, zero Home.

3. Dont Settle (active) previews 200 on both suffixes. Funnel paths `/s/dont-settle`, `/c/dont-settle`, `/adv/letter`, `/c` 200.

4. Domains UI: only preview hosts. No custom domains. Preview rows show trash icons. ACH has both suffixes; Dont Settle only `preview.legenex.com`. ssl_status unknown, UI ACTIVE.

5. Bulk deploy form: empty path, placeholder `/s/mva`, red error "a deployment needs a path; "/" belongs to the Brand website" on load. Create drafts disabled until path typed and brand checked.

6. New Brand wizard: placeholders look like values; Preview URL is `https://—` while slug empty. Submit button says Create Site.

7. React hydration error #418 on websites, deployments, leads.

8. Production journal: Failed to find Server Action (x, r2s, f2t, 0, 1, action) throughout 23 Sep.

9. Production env: NEXT_PUBLIC_SERVER_URL=https://os.legenex.com, LEGALOS_CNAME_TARGET=os.legenex.com, LEGALOS_PREVIEW_DOMAIN=preview.legenex.com, PAGEFLO_* hosts unset, eligibility enforcement true.

10. Nginx: PageFlo hosts are `/etc/nginx/conf.d/legalos-tenants/`, not Plesk domains. Plesk domain list has no pageflo.io. Wildcard certs for `*.preview.pageflo.io` and `*.preview.legenex.com` are real.

11. Seed writes live quiz+LP deployments on Brand create (`funnel-samples`).

12. Funnel Preview buttons are in-app (`QuizPreviewView`), not public URLs. Playwright found 0 `<a>Preview</a>` on quiz/LP/advertorial lists.

13. Delivery column Serving iff `primary.status === 'active'`, ignoring Brand `sites.status`.

14. Agents also created draft Brands `rescue-funnel-20260923` and `rescue-sec-a-20260923`.

## Root causes (ranked)

1. Preview hosts 404 anonymous visitors when Brand is `draft`. New Brands are always draft. UI still offers View Live Site and Serving.
2. Dual content model: site-scoped Pages vs funnel deployments. ACH has no Home page so Ready still 404s `/`.
3. Live funnels read master HEAD. Publish/republish is not a version pin.
4. Three deployment lifecycles. Advertorial go-live is a status write.
5. URL libraries exist (`effectiveDeploymentUrl`) and are not used on quiz/advertorial lists.
6. W60 tests assert source/functions/HTTP 200 on seeded Dont Settle, never a newly created Brand's anonymous preview.
7. Production `.env` host names still LegalOS; CNAME target still `os.legenex.com`. Super-admin password in `.env` is stale.
