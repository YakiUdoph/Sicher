# Sicher frontend design contract

This document records the visual and interaction system implemented in `frontend/src/styles.css` and the current React components. It is descriptive, not permission to redesign the frontend.

## Design character and hierarchy

Sicher uses a restrained editorial visual language rather than a generic crypto dashboard. Warm paper surfaces, dark navy type, editorial serif headlines, compact interface labels, fine rules, and sparing blue/coral accents keep the product focused on a human-readable promise and its evidence.

Result pages should preserve this primary reading order:

1. What was promised?
2. What happened?
3. What is the result?
4. Can I inspect the evidence?

Technical provenance remains available, but it follows the plain-language explanation.

## Typography

- Display/editorial: `Cormorant Garamond`, falling back to `Georgia, serif`.
- Interface/body: `DM Sans`, falling back to `Arial, sans-serif`.
- Body copy is 16px with 1.5 line height on larger screens and 15px on mobile.
- Major headings use medium-weight serif type, tight negative tracking, compact line height, and occasional italic emphasis. Current responsive heading ranges are generally 38–60px; the home hero uses 52–60px before mobile adjustments.
- Interface labels and eyebrows use the sans face, small sizes, uppercase text, wide tracking, and restrained secondary color.
- Body and explanatory copy use short line lengths and muted secondary text; technical values use small interface text with wrapping for long hashes and addresses.

## Color and surfaces

The implemented core tokens are:

| Token | Value | Existing role |
| --- | --- | --- |
| `--brand-ivory` | `#f4f0e8` | page background |
| `--brand-paper` | `#fbf9f4` | cards, receipts, menus, and raised surfaces |
| `--brand-navy` | `#071436` | primary text, rules, and dark calls to action |
| `--brand-cobalt` | `#2454d6` | primary actions, links, active states |
| `--brand-blue` | `#1747e8` | primary-button hover |
| `--brand-apricot` | `#f2a77e` | warm accent |
| `--brand-coral` | `#ff805c` | warm accent and gradients |
| `--text-muted` | `#697080` | tertiary labels and metadata |
| `--text-secondary` | `#596171` | supporting copy |
| `--border-neutral` | `#d9d5cc` | fine separators and card borders |

Status tokens are `--surface-running: #e4edff`, `--status-proven: #497d64`, `--status-proven-soft: #dde9e1`, `--status-not-proven: #e76551`, `--status-not-proven-soft: #fae0db`, and `--status-error: #a13f31`. Blue denotes running/active information, green denotes proven, coral denotes not proven/breach, and dark red denotes errors. Assurance uses the blue informational treatment and must remain visually distinct from the result.

## Layout

- The shared content container is capped at 1240px and uses 40px side gutters on larger screens.
- The top navigation is 82px high, uses a translucent ivory background with blur, and separates content with a fine rule.
- Pages rely on editorial grids, asymmetry, borders, generous vertical space, and paper cards rather than dense dashboard chrome.
- Result content narrows for reading: proof summaries cap at 920px and receipt paper at 840px.
- The main responsive breakpoints are 900px and 640px. At 900px complex grids simplify; at 640px navigation becomes a menu, multi-column layouts stack, gutters become 16px, and primary buttons expand to full width.

## Components and interaction patterns

### Navigation and actions

Desktop navigation presents the primary routes plus a separate wallet control. Mobile navigation becomes an explicit 40px menu control and a vertically stacked 52px-per-row menu. Active and hover states use cobalt. Buttons are rectangular, bold interface controls: cobalt primary, outlined ghost, navy dark, or paper light. Hover motion is limited to a small lift or arrow translation; mobile targets are generally at least 44–52px high.

### Status and assurance

Status pills are compact uppercase capsules with a colored dot. Running states use blue, proven uses green, and not proven uses coral. Assurance is rendered as a separate outlined blue label. Do not collapse the two into one badge or use assurance color to imply a favorable result.

### Proof and record cards

Proof cards use paper surfaces, neutral borders, serif outcome values, compact metadata, and optional restrained shadow. Featured and hover states use a subtle cobalt border and lift. Record cards prioritize identity, promise, result/lifecycle state, and a clear route to detail; they are not generic analytics tiles.

### Proof path

The proof path is a horizontal sequence of serif balance values joined by light connectors. The minimum/breach point uses the not-proven coral and a small uppercase note. On narrow screens, typography and gaps contract while the ordered sequence remains readable. The path explains evidence; it never computes or overrides the published verdict.

### Receipt

The receipt is presented as a centered paper surface with shadow. Its human summary comes first in a two-column grid, followed by the balance path and conclusion. Technical provenance lives below in a disclosure controlled by a button with `aria-expanded`; its grid collapses to one column on mobile. Long identifiers wrap instead of forcing horizontal overflow.

### Forms

The commitment flow uses a two-column rail/content layout on larger screens and a single column on mobile. Large underlined fields, nearby helper/error copy, live chain-head status, exact-terms review, and a prominent final action support deliberate review. Labels explain human meaning before addresses or block mechanics. Error text uses the implemented error color and alert/status semantics where appropriate.

### Progressive disclosure and copy

Primary copy answers the human question in plain language. Technical terms, hashes, provider details, and fingerprints appear in `details`/`summary` sections or explicit technical toggles. Registry existence is described as a recorded commitment, not a terminal result. Temporary breach language remains direct: later recovery does not erase the breach.

## Motion and accessibility

- Transitions are short and functional: roughly 0.2–0.3 seconds for color, lift, menu reveal, and arrow movement. The stylesheet defines a `breathe` keyframe but does not currently apply it; do not treat it as an established required animation.
- Keyboard focus is visible on links, buttons, inputs, and summaries with a 2px cobalt outline and 3px offset.
- Decorative images and marks use empty alternative text or `aria-hidden`; meaningful controls receive labels.
- Dynamic errors and transaction states use `role="alert"`, `role="status"`, or `aria-live` where implemented.
- Native buttons and disclosure controls preserve keyboard behavior. Color is paired with words, dots, headings, or explanatory copy rather than acting as the only status signal.
- Mobile layouts prevent horizontal crowding, stack dense grids, enlarge actions, and wrap technical values.

New frontend work should reuse these implemented tokens and patterns. Any deliberate system change belongs in the source first and should update this document only after the implementation is reviewed.
