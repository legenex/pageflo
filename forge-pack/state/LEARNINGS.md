# Learnings

- `bullmq` and `ioredis` in `package.json` do not mean a queue exists. Only a Redis health ping is wired.
- Lead capture already inserts the Lead row before downstream calls. Durability gap is queued retry after persistence, not first-write loss.
- `funnel_lp_deployments.content_overrides` is live, not a unused column. Decision 4.5 forbids new authoring through it.
- Brand identity already lives on `Sites`. Brand Kits is a leftover operator workflow, not a missing data model.
- This Codespace can reach `os.legenex.com` and cannot currently resolve `app.pageflo.io` or the `legalos` SSH alias.
- Public Check My Claim still references Base44/Supabase media URLs. Import cutover is not done for that surface.
