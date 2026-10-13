# Sicher — implementation plan

## Product direction
Sicher is a premium public proof product for commitments that need to be checked. It records exact commitments before outcomes are known, checks the full promised period, and presents the result in plain English. Demo data is clearly labelled as fictional; interface actions are structured for future integration and do not pretend to start wallet or blockchain activity.

## Design system
- **Design movement:** Editorial architecture / modernist public record. Large serif statements sit beside calm, precise interface controls.
- **Core principles:** visible evidence over claims; asymmetry over template layouts; quiet confidence over hype; failure is as important as success.
- **Color philosophy:** warm ivory gives the product a human, paper-like ground; cobalt provides ownable clarity; powder blue softens the interface; apricot marks moments of attention; muted green and coral communicate outcomes without gamification.
- **Layout paradigm:** strong horizontal rules, offset columns, split hero compositions, oversized margins, and stacked record cards rather than centered dashboards.
- **Signature elements:** light-path photography, the before → during → after proof strip, and thin cobalt timeline rules.
- **Interaction philosophy:** interactions reveal time and evidence; hover and click states are restrained, readable, and reversible.
- **Animation:** slow glass-image movement, small number transitions, timeline reveal, and mask-like status changes. No particles, floating blobs, 3D spins, or constant glow.
- **Typography:** Cormorant Garamond for major statements and display moments; DM Sans for navigation, controls, labels, and evidence copy.
- **Brand essence:** A public record for promises that need to be checked. Precise, calm, human.
- **Brand voice:** short, plain, consequential. Example lines: “Anyone can make a promise. The interesting part is what happens next.” / “The funds came back, but the commitment had already been broken.”
- **Wordmark & mark:** a cobalt vertical line crossing a fine ivory rule, suggesting a measured threshold and a precise before/after cut.
- **Signature brand color:** rich cobalt `#2454d6`.

## Project structure
- `src/data.js` — labelled demo projects and proof records only.
- `src/logic.js` — route parsing and small future-integration-safe proof helpers.
- `src/components.jsx` — reusable navigation, status, record, timeline, and layout components.
- `src/main.jsx` — page composition and local interaction state for each route.
- `src/styles.css` — global design tokens, responsive layouts, and motion.
- `public/manus-routes.json` — complete route declaration for Preview tooling.

## Serving
Vite serves the React app on port 3000. The route layer uses the browser path so every requested page works from a direct URL in Preview. The hero image is referenced through the managed storage asset reserved by image generation and is replaced in place when generation completes.
