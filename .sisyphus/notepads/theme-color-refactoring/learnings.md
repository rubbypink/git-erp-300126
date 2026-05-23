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

## Supplementary Optimization Plan
- Created .sisyphus/plans/theme-color-refactoring-supplement.md to address remaining visual inconsistencies.
- Identified 92 usages of .bkg-light across 25 files that need to be renamed to .bg-surface-alt.
- Proposed new semantic variables --surface-alt, --header-bg, --header-text, --footer-bg to improve visual hierarchy.
- Proposed adding subtle background color to fieldset elements to distinguish them from the main background.

## Task S2 — Replace bkg-light → bg-surface-alt in HTML templates
- **Scope**: 9 template files, 37 occurrences (not 11 — `report_dashboard.html` and `tpl_ai_marketing.html` had zero `bkg-light` instances)
- **Files modified**: tpl_accountant.html (9), tpl_all.html (11), tpl_price_manager.html (6), tpl_accountant_report.html (3), tpl_tour_price.html (3), tpl_booking_overview.html (2), tpl_admin_settings.html (1), tpl_operator.html (1), tpl_sales.html (1)
- **Method**: Used `replaceAll` to batch-replace every `bkg-light` with `bg-surface-alt` in each file
- **Verification**: grep for `bkg-light` in components dir returns empty; 37 instances of `bg-surface-alt` confirmed

## Task S1 — CSS Supplementary Theme Optimizations
- Updated `public/src/css/main.css` with 8 changes:
  1. **Removed `--main-bg`** from both `:root` and `[data-bs-theme="dark"]` — replaced with `--surface-alt` semantic variable
  2. **Added `--surface-alt`**: Light `#f3f4f6`, Dark `#27272a` — provides an alternative surface color one step away from the main surface
  3. **Renamed `.bkg-light` → `.bg-surface-alt`**: Uses `var(--surface-alt)` with `!important` for Bootstrap utility class pattern compatibility
  4. **Added `--header-text`**: Light `#ffffff`, Dark `#f8f9fa` — ensures header text is always readable against header backgrounds
  5. **Updated dark `--header-bg`**: Changed from `#27272A` to `#18181b` to match the body background, creating a cleaner full-width header
  6. **Added `--footer-bg`**: Light `#f8f9fa`, Dark `#18181b` — consistent footer background per theme
  7. **`.app-header` updated**: Added `border-bottom: 1px solid var(--border-color)` for visual header separation; changed `color: var(--text-color)` to `color: var(--header-text)` to use the dedicated header text variable
  8. **Added `footer` styling**: `background: var(--footer-bg) !important; border-top: 1px solid var(--border-color) !important;`
  9. **Updated `fieldset`**: Added `background-color: var(--surface-alt)` to distinguish fieldsets from the main background, preserving all existing grid/layout rules
- Verified: `--main-bg` references removed, all new variables properly defined in both themes, no layout classes modified

## Task S3 — Replace bkg-light → bg-surface-alt in JS modules
- **Scope**: 15 JS files, ~53 occurrences of `bkg-light` replaced with `bg-surface-alt`
- **Files modified**: TourPriceController.js (2), header_menu.js (4), footer_menu.js (2), M_ImportPriceAI.js (3), calculator_widget.js (1), M_HotelPrice.js (5), M_SalesModule.js (2), M_OperatorModule.js (3), M_ShortKey.js (3), ATable.js (11), BookingOverviewController.js (1), AdminDatabaseController.js (1), SettingsController.js (2), logger.js (1), controller_accountant.js (9)
- **Method**: Used Edit tool with `replaceAll: true` on each file in a single parallel batch
- **Note**: `AdminDatabaseController.js` and `SettingsController.js` live at `public/admin/js/` not `public/src/admin/js/`
- **Verification**: Full-project grep for `bkg-light` in `*.js` returns **zero matches**; LSP diagnostics on modified files show zero errors
