# Theme Color Refactoring - Learnings

## Conventions
- Bootstrap 5.3 via CDN - override CSS variables, don't modify Bootstrap source
- Use `data-bs-theme` attribute on `<html>` element
- Cozy Minimalist palette: Light `#FDFBF7`, Dark `#18181B`

## Gotchas
- Must prevent flash of incorrect theme (FOIT) by setting theme early in `<head>`
- Don't touch layout classes (`d-flex`, `grid`, etc.)
- Don't touch business logic or state management

## Decisions
- Used `:root` for light theme defaults (no separate `[data-bs-theme="light"]` needed since Bootstrap falls back to `:root` when theme is "light")
- Kept `color-scheme: light dark` on `:root` as instructed (though data-bs-theme toggle may override via JS)
- All custom theme variables (`--app-bg`, `--surface-color`, `--text-color`) now map to Bootstrap 5.3 `--bs-body-*` variables for hierarchical consistency
- Dark theme table/tab colors aligned to Zinc palette (#27272A surface, #3F3F46 border/hover, #A1A1AA secondary text) for cohesive look
- Dark theme shadows converted from px to rem units for consistency with the light theme's rem-based shadows
- `--popup-bg` in light mode kept the warm pinkish value (#fbe9e9f9) as it's a deliberate design choice
- The element-level styles (tables, cards, modals, dropdowns) reference only the custom vars, no Bootstrap vars directly — so remapping in `[data-bs-theme="dark"]` is sufficient for full theme switching

## Wave 1 — Theme Toggle JS Logic
- Theme init script placed early in `<head>` (after `<meta>` tags, before CSS links) — runs before any render to prevent FOIT
- Uses Font Awesome `fas fa-sun` / `fas fa-moon` for toggle icons (already loaded by both pages)
- Toggle button in `index.html`: absolute-positioned inside `app-header` (top-right, 34x34 rounded circle, z-index 100)
- Toggle button in `admin/index.html`: placed in `header-right` div alongside notifications/user profile (36x36 rounded circle, matches existing button style)
- Toggle logic is a separate inline IIFE at end of `body` — keeps early script minimal (only reads localStorage/setAttribute)
- `data-bs-theme` referenced 4 times in each file: 1 in init script + 3 in toggle logic
- Existing `theme-toggle` in `tpl_all.html` at `public/src/components/tpl_all.html:124` uses a different approach (`onclick="toggleTheme()"`) — not modified in this wave
- Replaced text-muted with text-body-secondary in public/index.html and public/admin/index.html. No bg-white, bg-light, text-dark, or text-black classes were found in these files.

## Wave 2b — Specific App Features & Analytics Refactoring
- **report_dashboard.html**: 3 `text-muted` → `text-body-secondary`. Added `bg-body-tertiary` to filter card, chart card, and table container for visual contrast against `bg-body` background. KPI cards (`bg-primary`/`bg-success`/`bg-warning`/`bg-danger`) left untouched — they're intentionally colored, not generic containers.
- **tpl_ai_marketing.html**: 21 `text-muted` → `text-body-secondary`, 1 `text-dark` (badge count) → `text-body`. Added `bg-body-tertiary` to all 6 card containers (4 stats cards + pipeline status card + content queue card). Pipeline header (`bg-dark bg-gradient text-white`) and content queue header (`bg-primary bg-gradient`) left as-is — they're deliberate accent headers on top of cards.
- Both files verified: zero hardcoded color classes remain. All canvas IDs, chart toggle logic, data attributes, and event handlers preserved intact.
- **Component Refactoring**: Used a Node.js script to systematically process all HTML components. `bg-white` and `bg-light` were completely stripped from table elements (`thead`, `tbody`, `tr`, `th`, `td`, `table`) since the CSS variables in `main.css` now handle table coloring appropriately based on the theme.
- **Global Replacements**: Replaced static colors with Bootstrap 5.3 semantic classes (`bg-white` -> `bg-body-tertiary`, `bg-light` -> `bg-body`, `text-dark` -> `text-body`, `text-black` -> `text-body`, `text-muted` -> `text-body-secondary`).
- **bkg-light**: Discovered a custom class `.bkg-light` in `main.css` which already uses CSS variables (`--main-bg` and `--text-color`), so it was preserved as-is.

## F1 Verification Findings
- No hardcoded colors remain in HTML files.
- data-bs-theme logic is present in index.html and admin/index.html.
- [data-bs-theme='dark'] selector exists in main.css.
- No @media (prefers-color-scheme: dark) block remains in CSS.
- All internal CSS variables map to Bootstrap variables.
- Layout classes were NOT modified.
- Business logic was NOT touched.
- VERDICT: APPROVE
