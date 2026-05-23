# Theme Color Refactoring - Issues

## Issue Log

### F2 Code Quality Review — May 23, 2026

**Verdict: APPROVE** ✅

#### PASSES:
1. **Hardcoded Color Removal**: Zero matches for `bg-white`, `bg-light`, `text-dark`, `text-muted`, `text-black` across all 13 changed files.
2. **CSS Syntax**: No empty property values, no broken declarations. CSS variable remapping (`:root` + `[data-bs-theme="dark"]`) structurally sound.
3. **Theme Toggle JS**: Both `index.html` and `admin/index.html` have syntactically correct, null-safe IIFE scripts. `data-bs-theme` consistently referenced 4 times each.
4. **No Business Logic Changes**: Git diff confirms only CSS class replacements. No layout, no state management, no feature logic touched.
5. **Consistency**: Color class replacements follow uniform pattern: `text-muted`→`text-body-secondary`, `bg-white`→`bg-body-tertiary` etc.
6. **Div Balance**: `index.html` (13/13), `admin/index.html` (27/27), all 10 component files balanced — only `tpl_sales.html` has imbalance (pre-existing).

#### PRE-EXISTING ISSUES (not from refactoring):
1. **`tpl_sales.html:269` — unmatched `</div>`**: 115 `<div` opens vs 116 `</div>` closes. Git diff confirms this file only received 4 class replacements; the extra `</div>` pre-dates this refactoring.
2. **Duplicate `id="theme-toggle"`**: `tpl_all.html` (template) has same ID as `index.html`/`admin/index.html`. Pre-existing — noted in learnings as "not modified in this wave".

#### RECOMMENDATIONS:
- Fix unmatched `</div>` in `tpl_sales.html` in a future code cleanup pass.
- Consider removing or renaming the duplicate `theme-toggle` in `tpl_all.html` to avoid DOM ID conflicts when the template is loaded.

