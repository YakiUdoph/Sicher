# Phase 10B terminal-result publication

Phase 10B uses a scheduled, wallet-free GitHub Actions worker. It reads two public Elysium Testnet providers, requires an agreed finalized head, invokes the frozen Receipt V3 verifier unchanged, and publishes only validated terminal results through a protected pull request targeting `sicher-results`. The browser discovers `index.json` at runtime and independently checks content and Receipt V3 digests before presenting a verdict.

Publication remains disabled until the repository owner completes and verifies the manual controls below. Do not set `SICHER_RESULTS_BRANCH_PROTECTED=true` before that review.

## Required manual GitHub settings

1. Preserve the existing `sicher-results` bootstrap at commit `014d94f`; do not rerun the bootstrap command, rewrite its history, or regenerate its files. Its index keeps `automation.operational=false`, and its content-addressed #1/#2 receipt digests remain `2b1fa85d2dbd00729218bbe09d327cfc2349f20df02921185d8a2ec3c43fbece` and `bd8e5cfa63ff862d4e0b1efc93c6ae2ac0800b01b6806a5ea5146880ce1b67f7`. It contains no #6/#7 record.
2. Keep the active `Sicher Results Publication` ruleset on `sicher-results`: no bypass actors, pull request required with zero approvals, squash only, linear history, deletion and force-push blocked, and direct update restriction disabled so protected PR merges can land.
3. Keep the default branch protected so changes to `.github/workflows/phase10b-publish-results.yml`, the worker, validator, and frozen-fingerprint allowlist require review and passing checks.
4. In **Settings → Actions → General**, keep the default workflow permission read-only and enable “Allow GitHub Actions to create and approve pull requests” only for the reviewed workflow. The publication job itself declares exactly `contents: write` and `pull-requests: write`. Do not add a private key, wallet secret, RPC secret, or broadly scoped PAT.
5. Leave `SICHER_RESULTS_BRANCH_PROTECTED` unset and `automation.operational=false` during implementation and remediation. Activation remains a separate later operation after the environment binding, workflow permissions, and repository ruleset have been reviewed together.
6. Configure production `VITE_SICHER_RESULTS_BASE_URL` to the read-only raw/CDN origin for the `sicher-results` branch, then redeploy once. Per-result frontend redeployments are not required.
7. Manually dispatch one dry run with no eligible unpublished result. Confirm no transaction/signature/wallet RPC occurs, logs contain no credentials, and the worktree remains unchanged.

The workflow has no pull-request trigger, processes at most one result per run, serializes runs, refuses an inactive or unbootstrapped store, and never pushes directly to the protected results branch. It opens a temporary branch and PR, re-reads both pinned heads and the complete store, validates the changed-file allowlist, squash-merges, verifies the resulting head, and removes the temporary branch. A missing or malformed runtime store is fail-closed.

The write-capable `publish` job is bound to the `sicher-result-publication` environment. Scheduled runs use the generic persisted fair scheduler described below. A manual dispatch may optionally supply one canonical positive `commitment_id`; this only narrows selection to that registry record. The record must still exist, be ended at the agreed finalized head, use STEST, remain unpublished, and pass the unchanged dual-provider, frozen-verifier, Receipt V3, protected-PR, and one-result publication gates.

## Fair scheduler state

Normal scheduled operation uses `scheduler.json` in the protected result store. The file has schema `sicher.result-scheduler/1.0` and contains only operational metadata:

- `cursorAfterId`: the last attempted commitment ID;
- `failures`: per-ID attempt count, `TRANSIENT` or `UNRESOLVED` classification, a bounded diagnostic code, last-attempt time, and next-attempt time;
- `scanIssues`: current per-ID read/disagreement diagnostics.

It contains no receipt, proof verdict, assurance claim, or immutable commitment term. A scheduler entry never means `PROVEN` or `NOT_PROVEN`.

The generic selector starts after the cursor, wraps numerically, skips published, unsupported-token, active, unfinalized, and not-yet-due retry records, and attempts at most one candidate per run. The cursor advances after both success and failure, so one unresolved ID cannot starve later IDs. Transient failures retry after 6, 12, then at most 24 hours. Deterministic or repeatedly unresolved failures retry every seven days; an explicit manual target may request an earlier re-evaluation but still passes every eligibility, provider, verifier, Receipt V3, fingerprint, first-publication-wins, and protected-PR check.

Chain identity, the agreed finalized head, and the agreed registry upper bound remain global fail-closed invariants. A failure or disagreement while reading one commitment is isolated to that ID, recorded diagnostically, and never accepted from only one provider. Independently agreed later IDs remain schedulable.

Scheduler-only progress and scheduler-plus-one-result progress both use a temporary branch, validated pull request, squash merge, and post-merge head verification. Ordinary transitions cannot change activation state, existing results, or existing receipts. A successful result must atomically advance the scheduler; a failed attempt may change only `scheduler.json`.

The scanner and browser retain a deliberate 10,000-record safety ceiling and fail closed above it. This is sufficient for the current competition/demo scale but is not an unlimited indexing architecture.

Production frontend runtime discovery requires this public build-time Config variable and one controlled redeployment:

`VITE_SICHER_RESULTS_BASE_URL=https://raw.githubusercontent.com/YakiUdoph/Sicher/sicher-results`

After that deployment, each browser load fetches `index.json` and content-addressed receipt paths with `cache: no-store`; individual result publications require no frontend source edit or redeployment.
