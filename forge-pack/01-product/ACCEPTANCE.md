# Acceptance contract

## Primary acceptance journey

A PageFlo internal operator must be able to:

1. create a new Brand with identity and niche
2. obtain PageFlo-hosted Brand Privacy and Terms pages
3. AI-generate a Brand website or import a controlled WordPress/Base44 website
4. edit the website using AI and manual section controls
5. create or select a master Quiz
6. select a distinct Quiz design without changing Quiz logic
7. create or select a master Landing Page or Advertorial
8. embed or link the selected master Quiz
9. create a deployment under the Brand with correct design/domain/path
10. preview it on the PageFlo preview host
11. publish it
12. submit a real test Lead
13. verify Brand identity, consent evidence, attribution, validation, queue state, and delivery result
14. inspect the Lead and delivery history inside PageFlo
15. perform the normal workflow without SSH, SQL, WordPress, Base44, or raw Payload CMS

## Multi-brand acceptance

Deploy one master asset under Check A Case and Don't Settle. Verify:

- same parent behavior/version
- different correct logos
- different correct colors/typography
- correct privacy/terms links
- correct domains/paths
- no deployment copy divergence
- no cross-brand data leakage

## Template acceptance

The existing template library must pass a structural-fidelity sweep. A reviewer should be able to distinguish templates from screenshots without relying only on color palette.

## Delivery durability acceptance

Simulate downstream unavailability after Lead persistence. Verify the Lead remains stored, delivery is queued/retried, and the downstream side effect occurs no more than once under the idempotency contract.
