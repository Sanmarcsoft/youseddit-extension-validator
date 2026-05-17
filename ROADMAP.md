# Roadmap — verifieddit-extension

> Source of truth for sequencing. Authoritative backlog lives in GitHub Issues + Milestones; this file is the human-readable narrative. Updates in this file must reference the relevant issue number in the commit message.

---

## Now (Alpha-Gold MVP gate)

**Milestone:** [Alpha-Gold MVP Gate](https://github.com/Sanmarcsoft/verifieddit-extension/milestone/2) — due **2026-04-25**.
**Tracking issue:** [#39 — Alpha-Gold MVP demo gate](https://github.com/Sanmarcsoft/verifieddit-extension/issues/39).
**Stimmt decision:** [session `1bb2e7a3-8413-436b-8991-dc308b48c2ce`, decision `f099d3a3-a43c-4e5d-92a5-c9b050f115a7`](https://stimmt.sanmarcsoft.com/session/1bb2e7a3-8413-436b-8991-dc308b48c2ce).

Publishing to the Chrome Web Store cannot resume until M has validated a clean `dist/chrome/` build of the extension on Chrome against the 7-image demo corpus at `ptt.matthewstevens.org/demo`.

Four defects must be resolved in the rebuilt artefact (P0 + P1); a fifth is deferred (P2).

| Priority | Defect | Status | Owner |
|----------|--------|--------|-------|
| P0 | Defect 1 — Trusted images show error instead of green trust | open | Q + 007 |
| P0 | Defect 3 — Ingredient thumbnails don't render in viewer | fix in flight ([PR #40](https://github.com/Sanmarcsoft/verifieddit-extension/pull/40)) | Q + 007 |
| P0 | Defect 5 — Right-click produces no validation icon | fix in flight ([PR #40](https://github.com/Sanmarcsoft/verifieddit-extension/pull/40)) | Q + 007 |
| P1 | Defect 2 — Warning icons disappear after being set | open | Q + 007 |
| P2 | Defect 4 — No-C2PA exclamation icon criteria | **deferred to v1.1** → [#42](https://github.com/Sanmarcsoft/verifieddit-extension/issues/42) | Q + 007 |

### Active branches and PRs

- [`feature/39-rc2-offscreen-reasons`](https://github.com/Sanmarcsoft/verifieddit-extension/tree/feature/39-rc2-offscreen-reasons) — rc2 fix branch; [PR #40](https://github.com/Sanmarcsoft/verifieddit-extension/pull/40) covers Defects 3 + 5 (offscreen reasons + ingredient thumbnails).
- `feature/39-rc2-fixtures` — test corpus and fixtures consolidation for the rebuilt build (owned by the release-consolidation workstream).
- `feature/39-roadmap-alpha-gold` — this roadmap change.

### Gate exit criteria (from #39)

1. All P0 and P1 defects closed in the rebuilt `dist/chrome/`.
2. Fresh `dist/chrome/` build timestamp later than 2026-04-21.
3. Signed zip handed off to M via an installable route.
4. M walks the MVP happy-path on the 7-image corpus in Chrome and confirms on the voice channel: *"MVP demo is at Alpha-Gold standard."*
5. Gate flips → downstream CWS work (see Next) reactivates.

---

## Next (CWS submission — parked behind the gate)

**Milestone:** [Alpha-Gold MVP Gate](https://github.com/Sanmarcsoft/verifieddit-extension/milestone/2) *(these issues are gated behind #39, not separate.)*

Parked until M greenlights the MVP. Do not progress without explicit reactivation.

- [#37 — CWS v1.0.0 blocker triage](https://github.com/Sanmarcsoft/verifieddit-extension/issues/37) (Eleanor's conditional deliverable).
- [#38 — Technical impact assessment on Phenom PKI](https://github.com/Sanmarcsoft/verifieddit-extension/issues/38) (Priya + Q's conditional deliverable).
- Individual CWS submission blockers: [#32](https://github.com/Sanmarcsoft/verifieddit-extension/issues/32) — [#35](https://github.com/Sanmarcsoft/verifieddit-extension/issues/35).
- `CHROME_WEB_STORE_LISTING.md` copy edits ([#34](https://github.com/Sanmarcsoft/verifieddit-extension/issues/34)).

The [`Verifieddit v1.0.0 CWS Submission`](https://github.com/Sanmarcsoft/verifieddit-extension/milestone/1) milestone (due 2026-05-01) activates only once the Alpha-Gold gate is open.

---

## Later (v1.1 — post-Alpha-Gold polish)

**Milestone:** [v1.1 — post-Alpha-Gold polish](https://github.com/Sanmarcsoft/verifieddit-extension/milestone/3) — no due date yet; sequenced after CWS submission.

- [#42 — Defect 4 (v1.1): Define No-C2PA exclamation icon identification criteria](https://github.com/Sanmarcsoft/verifieddit-extension/issues/42). Deferred from the Alpha-Gold gate per the Stimmt decision above. Work covers (a) defining which images "should" have C2PA, (b) implementing the exclamation-icon indicator, (c) verifying on the demo corpus plus additional trigger cases.

Further v1.1 scope will be added here as items are identified during the MVP gate sprint.
