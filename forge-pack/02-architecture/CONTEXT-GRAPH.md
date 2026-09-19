# Context graph

```mermaid
graph TD
  U[Internal User] --> B[Brand / Site]
  B --> BI[Brand Identity]
  B --> BW[Brand Website]
  B --> D[Domains]
  B --> DEP[Deployments]

  MQ[Master Quiz] --> DEP
  MLP[Master Landing Page] --> DEP
  MAD[Master Advertorial] --> DEP
  QT[Quiz Visual Template] --> DEP
  PT[Page Visual Template] --> MLP
  AT[Advertorial Template] --> MAD

  MQ --> QL[Quiz Logic / Outcomes / Consent]
  BI --> R[Brand Resolver]
  DEP --> R
  R --> PUB[Public Render]
  BW --> PUB
  D --> PUB

  PUB --> L[Lead Capture]
  L --> C[Consent + Attribution]
  L --> Q[Durable Queue]
  Q --> V[Validation/Enrichment]
  Q --> WH[Webhook / LeadDistro / CAPI]
  WH --> LH[Lead Delivery History]
  L --> UI[Internal Leads UI]
  LH --> UI

  AI[AI Provider Abstraction] --> BI
  AI --> BW
  AI --> MQ
  AI --> MLP
  AI --> MAD
```

## Context isolation rules

- Lead/consent data remains scoped to Brand/Site and organization access rules.
- Master asset content may be reused across Brands without carrying Brand-private Lead data.
- Deployment can reference a reusable master but must not copy unrelated tenant data.
- Brand Website is Brand-owned, not a global reusable master by default.
- AI must not receive Lead PII unless a specific approved feature requires it.
