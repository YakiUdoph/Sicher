# Phase 7D.4 transaction safety

Sicher treats a returned transaction hash as the point of no blind retry. The browser stores a versioned, public-only pending record in `localStorage`, restores it on `/start`, and requires read-only receipt, event, and registry reconciliation before showing a confirmed commitment. A pending or unresolved hash blocks another submission and offers **Check transaction**, which never sends a transaction.

The deployed immutable registry permits identical commitments. These client safeguards substantially reduce accidental double submission in this browser, but they do not provide protocol-level uniqueness. Identical commitments can still be submitted through another frontend, a direct contract call, another device or browser, after local storage is cleared, or through two intentionally authorized wallet requests.

Persisted fields are limited to the schema version, chain ID, registry, transaction hash, sender, subject, token, minimum balance, start block, end block, and creation time. Private keys, seed phrases, signatures, and other wallet secrets are never persisted.
