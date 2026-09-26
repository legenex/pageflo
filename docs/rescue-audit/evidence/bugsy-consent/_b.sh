#!/bin/bash
R=b0926a
U=https://pageflo-rescue-acceptance-944138.preview.pageflo.io/api/leads
post() { # n label json [extra curl args]
  n=$1; label=$2; body=$3; shift 3
  out=$(curl -s -o /tmp/bugsy_b_$n.json -w "%{http_code}" -X POST -H 'content-type: application/json' "$@" --data-binary "$body" $U)
  echo "B$n [$label] HTTP $out :: $(head -c 300 /tmp/bugsy_b_$n.json)"
}
C() { echo "\"contact\":{\"first_name\":\"Bugsy\",\"last_name\":\"Api $1\",\"email\":\"bugsy-$R-api-$1@legenex.test\"}"; }
DT='"By checking this box, I agree that PageFlo QA may contact me."'
BASE='"funnel_type":"quiz","funnel_id":"mva","funnel_path":"/s/pageflo-rescue-acceptance-944138","source_entity_id":"25"'
post 1 "accepted:false" "{$BASE,$(C 1),\"consent\":{\"accepted\":false,\"disclosure_text\":$DT}}"
post 2 "accepted:\"true\" string" "{$BASE,$(C 2),\"consent\":{\"accepted\":\"true\",\"disclosure_text\":$DT}}"
post 3 "missing disclosure_text" "{$BASE,$(C 3),\"consent\":{\"accepted\":true}}"
BIG=$(python3 -c "print('A'*100000)")
post 4 "100KB disclosure" "{$BASE,$(C 4),\"consent\":{\"accepted\":true,\"disclosure_text\":\"$BIG\"}}"
post 5 "other site_slug + x-forwarded-host + extra" "{\"site_slug\":\"bugsy-other-brand\",$BASE,$(C 5),\"extra\":{\"bugsy_extra_field\":\"kept-$R\",\"agreed_to_tcpa\":\"yes\"},\"consent\":{\"accepted\":true,\"disclosure_text\":$DT}}" -H 'x-forwarded-host: bugsy-other.invalid' -H 'x-legalos-host: bugsy-other.invalid'
post 6 "script tag disclosure" "{$BASE,$(C 6),\"consent\":{\"accepted\":true,\"disclosure_text\":\"<script>alert('bugsy-xss')</script><img src=x onerror=alert(1)>I agree\"}}"
post 7 "no consent object" "{$BASE,$(C 7)}"
post 8 "forged text, accepted true" "{$BASE,$(C 8),\"consent\":{\"accepted\":true,\"disclosure_text\":\"Bugsy forged: visitor never saw this text.\",\"client_accepted_at\":\"1999-01-01T00:00:00Z\"}}"
