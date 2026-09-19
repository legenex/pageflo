# Work graph

## Critical path

```mermaid
graph TD
  W00[W00 Re-audit and reconcile contracts] --> W10[W10 PageFlo shell and Brand-first navigation]
  W00 --> W11[W11 Brand/Site identity foundation]
  W00 --> W12[W12 Lead durability foundation]

  W11 --> W20[W20 Brand Website model and manual editor]
  W11 --> W21[W21 Master asset/version semantics]
  W10 --> W20
  W10 --> W22[W22 Quiz composition renderer repair]
  W21 --> W22

  W20 --> W30[W30 Website import and AI editing]
  W21 --> W31[W31 Landing Page and Advertorial master fidelity]
  W22 --> W32[W32 Master Quiz builder/runtime completion]

  W11 --> W40[W40 Deployment and auto-reskin model]
  W21 --> W40
  W31 --> W40
  W32 --> W40

  W40 --> W41[W41 Bulk deploy and preview routing]
  W41 --> W42[W42 Domains and preview.pageflo.io app support]

  W12 --> W43[W43 Leads UI and delivery observability]

  W30 --> W50[W50 End-to-end integration]
  W40 --> W50
  W42 --> W50
  W43 --> W50

  W50 --> W60[W60 Full QA, production release, final verification]
```

## Parallel lanes

After W00:

- UI/design lane: W10
- Brand/data lane: W11
- Lead backend lane: W12

After Brand foundation:

- Website lane: W20/W30
- Master/template lane: W21/W31
- Quiz lane: W22/W32

Deployment integration W40 begins only when Brand, master semantics, Landing/Advertorial, and Quiz contracts are stable enough to bind.

## Likely bottleneck

The biggest bottleneck is the reusable master plus deployment renderer boundary, especially template fidelity and versioning without breaking current live deployments.
