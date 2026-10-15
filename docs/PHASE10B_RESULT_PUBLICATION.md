# Phase 10B terminal-result publication

Phase 10B uses a scheduled, wallet-free GitHub Actions worker. It reads two public Elysium Testnet providers, requires an agreed finalized head, invokes the frozen Receipt V3 verifier unchanged, and publishes only validated terminal results through a protected pull request targeting `sicher-results`. The browser discovers `index.json` at runtime and independently checks content and Receipt V3 digests before presenting a verdict.

Publication remains disabled until the repository owner completes and verifies the manual controls below. Do not set `SICHER_RESULTS_BRANCH_PROTECTED=true` before that review.

## Required manual GitHub settings

1. Preserve the existing `sicher-results` bootstrap at commit `014d94f`; do not rerun the bootstrap command, rewrite its history, or regenerate its files. Its index keeps `automation.operational=false`, and its content-addressed #1/#2 receipt digests remain `2b1fa85d2dbd00729218bbe09d327cfc2349f20df02921185d8a2ec3c43fbece` and `bd8e5cfa63ff862d4e0b1efc93c6ae2ac0800b01b6806a5ea5146880ce1b67f7`. It contains no #6/#7 record.
2. Keep the active `Sicher Results Publication` ruleset on `sicher-results`: no bypass actors, pull request required with zero approvals, squash only, linear history, deletion and force-push blocked, and direct update restriction disabled so protected PR merges can land.
3. Keep the default branch protected so changes to `.github/workflows/phase10b-publish-results.yml`, the worker, validator, and frozen-fingerprint allowlist require review and passing checks.
4. In **Settings → Actions → General**, allow the workflow the minimum required `contents: write` permission. Leave “Allow GitHub Actions to create and approve pull requests” disabled. Do not add a private key, wallet secret, RPC secret, or broadly scoped PAT.
5. Leave `SICHER_RESULTS_BRANCH_PROTECTED` unset and `automation.operational=false` during implementation. Activation is a separate later operation. Before activation, enable the repository setting that permits GitHub Actions to create pull requests and review the workflow permissions (`contents: write`, `pull-requests: write`).
6. Configure production `VITE_SICHER_RESULTS_BASE_URL` to the read-only raw/CDN origin for the `sicher-results` branch, then redeploy once. Per-result frontend redeployments are not required.
7. Manually dispatch one dry run with no eligible unpublished result. Confirm no transaction/signature/wallet RPC occurs, logs contain no credentials, and the worktree remains unchanged.

The workflow has no pull-request trigger, processes at most one result per run, serializes runs, refuses an inactive or unbootstrapped store, and never pushes directly to the protected results branch. It opens a temporary branch and PR, re-reads both pinned heads and the complete store, validates the changed-file allowlist, squash-merges, verifies the resulting head, and removes the temporary branch. A missing or malformed runtime store is fail-closed.
