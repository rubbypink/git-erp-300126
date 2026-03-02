/**
 * =========================================================================
 * THEME-MANAGER.JS - Advanced Theme Manager (v2)
 * Purpose: Quản lý 4 theme (light, dark, minimal, warm) + custom settings
 * =========================================================================
 * Features:
 * - 4 built-in themes: light (default), dark, minimal, warm
 * - Custom theme support
 * - System preference detection
 * - CSS variable injection
 * - Bootstrap class overrides
 * - Theme persistence (localStorage)
 * =========================================================================
 */

// =========================================================================
// 1. THEME CONFIGURATION
// =========================================================================
// All themes synced with main.css root CSS variables

const THEME_CONFIG = {
  light: {
    name: 'light',
    label: '🔵 9Trip Standard (Mặc định)',
    colors: {
      '--primary-color': '#2376fc',
      '--secondary-color': '#64748b',
      '--app-bg': '#f8fafc',
      '--header-bg': '#7b9aee',
      '--footer-bg': '#888787',
      '--text-color': '#07090e',
      '--text-secondary': '#79889c',
      '--border-color': '#113561',
      '--surface-color': '#faf3e5',
      '--hover-bg': '#f1f5f9',
      '--input-bg': '#ffffff',
      '--success-color': '#10b981',
      '--warning-color': '#f59e0b',
      '--error-color': '#ef4444',
      '--info-color': '#06b6d4',
      '--tbl-head-bg': '#7c9bf1',
      '--tbl-head-text': '#1e293b',
      '--tbl-row-bg': '#e9e4e4',
      '--tbl-row-hover': '#f1f5f9',
      '--tbl-border': '#cbd5e1',
      '--tab-active-bg': '#ffffff',
      '--tab-active-text': '#3b82f6',
      '--tab-inactive-bg': '#e2e8f0',
      '--tab-inactive-text': '#64748b',
      '--glass-bg': '#ffffff',
      '--glass-text': '#1e293b',
      '--glass-border': '#cbd5e1',
      '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
      '--shadow-md': '0 4px 6px rgba(0, 0, 0, 0.1)',
      '--shadow-lg': '0 10px 15px rgba(0, 0, 0, 0.1)',
    },
    fontFamily: "'Segoe UI', sans-serif",
    spacingScale: 1,
    classOverrides: {},
  },

  dark: {
    name: 'dark',
    label: '⚫ Hiện Đại (Dark/Modern)',
    colors: {
      '--primary-color': '#60a5fa', // ★ Brightened: 7c3aed → 60a5fa (blue)
      '--secondary-color': '#cbd5e1', // ★ Brightened: 94a3b8 → cbd5e1 (light slate)
      '--app-bg': '#1d2b38', // ★ Keep: Deep navy background
      '--header-bg': '#3f3f3f', // ★ Keep: Slate header
      '--footer-bg': '#8f9499', // ★ Keep: Slate footer
      '--text-color': '#f8fafc', // ★ Brightened: f1f5f9 → f8fafc (near white)
      '--text-secondary': '#c9d0d8', // ★ Brightened: cbd5e1 → e2e8f0 (lighter gray)
      '--border-color': '#475569', // ★ Keep: Medium slate
      '--surface-color': '#1e293b', // ★ Keep: Slate surface
      '--hover-bg': '#334155', // ★ Keep: Hover state
      '--input-bg': '#364b7e', // ★ Darkened: 1e293b → 0f172a (input darker)
      '--success-color': '#4ade80', // ★ Keep: Bright green
      '--warning-color': '#fbbf24', // ★ Brightened: facc15 → fbbf24 (more orange)
      '--error-color': '#fb7185', // ★ Brightened: f87171 → fb7185 (brighter red)
      '--info-color': '#22d3ee', // ★ Keep: Cyan
      '--tbl-head-bg': '#233046', // ★ Changed: 334155 → 1e293b (darker header)
      '--tbl-head-text': '#f8fafc', // ★ Brightened: f1f5f9 → f8fafc (whiter text)
      '--tbl-row-bg': '#485064', // ★ Darkened: 1e293b → 0f172a (darker rows)
      '--tbl-row-hover': '#272c33', // ★ Changed: 334155 → 1e293b (lighter hover)
      '--tbl-border': '#334155', // ★ Brightened: 475569 → 334155 (more visible)
      '--tab-active-bg': '#99a1af', // ★ Darkened: 334155 → 1e293b
      '--tab-active-text': '#60a5fa', // ★ Changed: 7c3aed → 60a5fa (brighter blue)
      '--tab-inactive-bg': '#0f172a', // ★ Changed: 1e293b → 0f172a (darker inactive)
      '--tab-inactive-text': '#cbd5e1', // ★ Brightened: 94a3b8 → cbd5e1
      '--glass-bg': '#3f4144', // ★ Keep: Glass background
      '--glass-text': '#f8fafc', // ★ Brightened: f1f5f9 → f8fafc
      '--glass-border': '#334155', // ★ Brightened: 475569 → 334155
      '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.5)',
      '--shadow-md': '0 4px 6px rgba(0, 0, 0, 0.5)',
      '--shadow-lg': '0 10px 15px rgba(51, 51, 51, 0.5)',
    },
    fontFamily: "'Roboto', sans-serif",
    spacingScale: 1,
    classOverrides: {
      'text-dark': { color: '#808080' },
      'bg-light': { backgroundColor: 'var(--bs-light)' }, // ★ Keep: Use Bootstrap's light background variable
      'btn-light': { backgroundColor: 'var(--bs-light)', color: '#1e293b', borderColor: '#475569' }, // ★ Keep: Light buttons with dark text and borders
      'bg-white': { backgroundColor: 'var(--bs-white)' || 'var(--bs-light)' }, // ★ Keep: Map bg-white to light background variable
    },
  },

  minimal: {
    name: 'minimal',
    label: '⚪ Tối Giản (Minimalist)',
    colors: {
      '--primary-color': '#000000',
      '--secondary-color': '#666666',
      '--app-bg': '#ffffff',
      '--header-bg': '#f8f9fa',
      '--footer-bg': '#f8f9fa',
      '--text-color': '#000000',
      '--text-secondary': '#666666',
      '--border-color': '#dee2e6',
      '--surface-color': '#ffffff',
      '--hover-bg': '#f1f1f1',
      '--input-bg': '#ffffff',
      '--success-color': '#444444',
      '--warning-color': '#666666',
      '--error-color': '#000000',
      '--info-color': '#666666',
      '--tbl-head-bg': '#333333',
      '--tbl-head-text': '#ffffff',
      '--tbl-row-bg': '#ffffff',
      '--tbl-row-hover': '#f9f9f9',
      '--tbl-border': '#ddd',
      '--tab-active-bg': '#333333',
      '--tab-active-text': '#ffffff',
      '--tab-inactive-bg': '#f1f1f1',
      '--tab-inactive-text': '#999999',
      '--glass-bg': '#f8f9fa',
      '--glass-text': '#000000',
      '--glass-border': '#dee2e6',
    },
    fontFamily: "'Inter', sans-serif",
    spacingScale: 0.85,
    classOverrides: {},
  },

  warm: {
    name: 'warm',
    label: '🟠 Ấm Áp (Cozy)',
    colors: {
      '--primary-color': '#e76f51',
      '--secondary-color': '#d4a574',
      '--app-bg': '#fff8f0',
      '--header-bg': '#fae1dd',
      '--footer-bg': '#fae1dd',
      '--text-color': '#5e503f',
      '--text-secondary': '#8d7568',
      '--border-color': '#e8d4c8',
      '--surface-color': '#fffaf5',
      '--hover-bg': '#fef3f0',
      '--input-bg': '#fffcf9',
      '--success-color': '#2a9d8f',
      '--warning-color': '#e76f51',
      '--error-color': '#d62828',
      '--info-color': '#f4a261',
      '--tbl-head-bg': '#fec5bb',
      '--tbl-head-text': '#6d4c41',
      '--tbl-row-bg': '#fffaf5',
      '--tbl-row-hover': '#fef3f0',
      '--tbl-border': '#e8d4c8',
      '--tab-active-bg': '#e8e1dd',
      '--tab-active-text': '#d62828',
      '--tab-inactive-bg': '#fae1dd',
      '--tab-inactive-text': '#9d8189',
      '--glass-bg': '#fffaf5',
      '--glass-text': '#5e503f',
      '--glass-border': '#e8d4c8',
    },
    fontFamily: "'Merriweather', serif",
    spacingScale: 1.15,
    classOverrides: {},
  },
};

// =========================================================================
// 2. THEME MANAGER CLASS
// =========================================================================

export default class ThemeManager {
  constructor() {
    this.currentTheme = this.getStoredTheme() || 'light';
    this.classOverridesStyle = null;
    this.init();
  }

  /**
   * Initialize theme manager
   */
  init() {
    this.createClassOverridesStyle();

    // Apply stored theme or default
    this.applyTheme(this.currentTheme);

    // Listen to system theme changes (optional)
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!this.hasUserPreference()) {
          this.applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  /**
   * Create style element for class overrides
   */
  createClassOverridesStyle() {
    if (this.classOverridesStyle) {
      this.classOverridesStyle.remove();
    }

    this.classOverridesStyle = document.createElement('style');
    this.classOverridesStyle.id = 'theme-class-overrides';
    this.classOverridesStyle.setAttribute('data-theme-manager', 'true');
    document.head.appendChild(this.classOverridesStyle);
  }

  /**
   * Apply theme by updating CSS variables and Bootstrap classes
   * @param {string} themeName - 'light', 'dark', 'minimal', 'warm', or 'custom'
   * @returns {void}
   */
  applyTheme(themeName) {
    const theme = THEME_CONFIG[themeName] || THEME_CONFIG['light'];

    if (!theme) {
      logError('Invalid theme: ' + themeName);
      return;
    }

    // Reset documentElement - xóa data-theme, data-bs-theme và inline styles cũ
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.removeAttribute('data-bs-theme');

    root.style.cssText = '';

    if (themeName === 'dark' && !document.body.classList.contains('dark-theme')) {
      root.setAttribute('data-bs-theme', themeName);
      const themeClass = `${themeName}-theme`;
      document.body.classList.add(themeClass);
      // 5. Dispatch custom event
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: themeName } }));
      return;
    }
    document.body.classList.remove('dark-theme');

    this.currentTheme = themeName;

    // 1. Update CSS variables
    this._updateCSSVariables(theme.colors);

    // 2. Update data-theme attribute
    document.documentElement.setAttribute('data-theme', themeName);

    // 3. Update Bootstrap class overrides
    if (theme.classOverrides && Object.keys(theme.classOverrides).length > 0) {
      this._updateClassOverrides(theme.classOverrides);
    }

    // 4. Save to localStorage
    this._saveThemePreference(themeName);

    // 5. Dispatch custom event
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: themeName } }));
  }

  /**
   * Update CSS variables on root element
   * @private
   */
  _updateCSSVariables(colors) {
    const root = document.documentElement;
    Object.entries(colors).forEach(([varName, value]) => {
      root.style.setProperty(varName, value);
    });
  }

  /**
   * Update Bootstrap class overrides
   * @private
   */
  _updateClassOverrides(overrides) {
    let css = '';

    Object.entries(overrides).forEach(([className, styles]) => {
      const selectors = this._generateSelectors(className);
      const styleStr = this._objectToCSS(styles);

      selectors.forEach((selector) => {
        css += `${selector} { ${styleStr} !important; }\n`;
      });
    });

    if (this.classOverridesStyle) {
      this.classOverridesStyle.textContent = css;
    }
  }

  /**
   * Generate CSS selectors for a class
   * @private
   */
  _generateSelectors(className) {
    return [
      `.${className}`,
      `.${className}:hover`,
      `.${className}:focus`,
      `[class*=" ${className}"]`,
      `[class^="${className}"]`,
    ];
  }

  /**
   * Convert object to CSS string
   * @private
   */
  _objectToCSS(styleObj) {
    return Object.entries(styleObj)
      .map(([prop, value]) => {
        const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssProp}: ${value}`;
      })
      .join('; ');
  }

  /**
   * Get stored theme from localStorage
   */
  getStoredTheme() {
    return localStorage.getItem('app-theme');
  }

  /**
   * Check if user has set preference
   */
  hasUserPreference() {
    return localStorage.getItem('app-theme') !== null;
  }

  /**
   * Save theme preference
   * @private
   */
  _saveThemePreference(themeName) {
    localStorage.setItem('app-theme', themeName);
  }

  /**
   * Clear theme preference
   */
  clearPreference() {
    localStorage.removeItem('app-theme');
    this.applyTheme('light');
  }

  /**
   * Get current theme name
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Get current theme config
   */
  getCurrentThemeConfig() {
    return THEME_CONFIG[this.currentTheme] || THEME_CONFIG['light'];
  }

  /**
   * Get all available themes
   */
  getAvailableThemes() {
    return Object.keys(THEME_CONFIG).map((key) => ({
      name: key,
      label: THEME_CONFIG[key].label,
    }));
  }

  /**
   * Toggle between themes
   * @param {string} direction - 'next' or 'prev', defaults to toggle light/dark
   */
  toggleTheme(direction = 'next') {
    const themes = ['light', 'dark', 'minimal', 'warm'];
    const currentIndex = themes.indexOf(this.currentTheme);

    let newIndex;
    if (direction === 'prev') {
      newIndex = currentIndex === 0 ? themes.length - 1 : currentIndex - 1;
    } else {
      newIndex = (currentIndex + 1) % themes.length;
    }

    this.applyTheme(themes[newIndex]);
    return themes[newIndex];
  }

  /**
   * Get color value from current theme
   */
  getColor(colorVar) {
    const varName = colorVar.startsWith('--') ? colorVar : '--' + colorVar;
    const config = this.getCurrentThemeConfig();
    return config.colors[varName] || '';
  }

  /**
   * Update theme colors (for custom theme)
   * @param {Object} colorUpdates - { '--color-name': '#value' }
   */
  updateColors(colorUpdates) {
    if (!colorUpdates || typeof colorUpdates !== 'object') {
      logError('updateColors requires an object with color mappings');
      return;
    }

    // Update current theme config
    const currentConfig = this.getCurrentThemeConfig();
    Object.assign(currentConfig.colors, colorUpdates);

    // Apply updated colors
    this._updateCSSVariables(currentConfig.colors);

    // Mark as custom if not already
    if (this.currentTheme !== 'custom') {
      this.currentTheme = 'custom';
      this._saveThemePreference('custom');
    }
  }

  /**
   * Fill settings form with current theme colors
   * Maps CSS variables to form input element IDs
   */
  fillSettingsForm() {
    const config = this.getCurrentThemeConfig();

    const colorMapping = {
      'st-app-bg': '--app-bg',
      'st-header-bg': '--header-bg',
      'st-footer-bg': '--footer-bg',
      'st-tbl-head-bg': '--tbl-head-bg',
      'st-tbl-head-text': '--tbl-head-text',
      'st-tab-active-bg': '--tab-active-bg',
      'st-tab-active-text': '--tab-active-text',
      'st-tab-inactive-bg': '--tab-inactive-bg',
      'st-tab-inactive-text': '--tab-inactive-text',
      'st-glass-bg': '--glass-bg',
      'st-glass-text': '--glass-text',
      'st-btn-primary': '--primary-color',
      'st-btn-success': '--success-color',
      'st-btn-danger': '--error-color',
      'st-btn-info': '--info-color',
      'st-btn-secondary': '--secondary-color',
      'st-text-color': '--text-color',
      'st-border-color': '--border-color',
      'st-surface-color': '--surface-color',
      'st-hover-bg': '--hover-bg',
      'st-input-bg': '--input-bg',
    };

    Object.entries(colorMapping).forEach(([elementId, colorVar]) => {
      const el = getE(elementId);
      if (el) {
        const color = config.colors[colorVar] || '#000000';
        el.value = color;
      }
    });

    // Fill font settings
    const fontEl = getE('st-font-family');
    if (fontEl) fontEl.value = config.fontFamily || "'Segoe UI', sans-serif";

    const spacingEl = getE('st-spacing-scale');
    if (spacingEl) spacingEl.value = config.spacingScale || 1;

    // Set theme selector
    const presetEl = getE('st-theme-preset');
    if (presetEl) presetEl.value = this.currentTheme;
  }

  /**
   * Setup color picker sync - updates text display when color changes
   * Marks theme as custom when any color is changed
   */
  setupColorSync() {
    const colorPairs = [
      'st-app-bg',
      'st-header-bg',
      'st-footer-bg',
      'st-tbl-head-bg',
      'st-tbl-head-text',
      'st-tab-active-bg',
      'st-tab-active-text',
      'st-tab-inactive-bg',
      'st-tab-inactive-text',
      'st-glass-bg',
      'st-glass-text',
      'st-btn-primary',
      'st-btn-success',
      'st-btn-danger',
      'st-btn-info',
      'st-btn-secondary',
      'st-text-color',
      'st-border-color',
      'st-surface-color',
      'st-hover-bg',
      'st-input-bg',
    ];

    colorPairs.forEach((id) => {
      const picker = getE(id);
      const textEl = getE(id + '-text');

      if (picker && textEl) {
        // Initialize text display
        textEl.value = picker.value;

        // Sync on color change
        picker.oninput = () => {
          textEl.value = picker.value;

          // Mark as custom theme when any color changes
          const presetEl = getE('st-theme-preset');
          if (presetEl && presetEl.value !== 'custom') {
            presetEl.value = 'custom';
          }
        };
      }
    });
  }

  /**
   * Save theme settings from form
   * Collects colors from form and applies via applyTheme or updateColors
   * Returns true if successful, false otherwise
   */
  saveSettingsFromForm() {
    const themePreset = getE('st-theme-preset')?.value;

    if (!themePreset) {
      logError('❌ Please select a theme before saving');
      return false;
    }

    try {
      if (themePreset === 'custom') {
        // Collect all custom colors from form
        const customColors = this._collectFormColors();
        this.updateColors(customColors);
      } else {
        // Apply preset theme
        this.applyTheme(themePreset);
      }
      return true;
    } catch (e) {
      logError('❌ Error saving theme: ' + e.message);
      return false;
    }
  }

  /**
   * Reset to default (light) theme
   * Optionally shows confirmation dialog
   */
  resetToDefault(showConfirm = false) {
    const performReset = () => {
      localStorage.removeItem('app-theme');
      this.currentTheme = 'light';
      this.applyTheme('light');
      this.fillSettingsForm();
      window.dispatchEvent(
        new CustomEvent('theme-changed', {
          detail: { theme: 'light', isDefault: true },
        })
      );
    };

    if (showConfirm) {
      // Use logA for confirmation (from utils.js)
      if (typeof logA === 'function') {
        logA('Khôi phục cài đặt mặc định', 'info', performReset);
      } else {
        if (confirm('Restore default theme settings?')) {
          performReset();
        }
      }
    } else {
      performReset();
    }
  }

  /**
   * Collect all color values from form elements
   * @private
   */
  _collectFormColors() {
    const colors = {};
    const colorMapping = {
      'st-app-bg': '--app-bg',
      'st-header-bg': '--header-bg',
      'st-footer-bg': '--footer-bg',
      'st-tbl-head-bg': '--tbl-head-bg',
      'st-tbl-head-text': '--tbl-head-text',
      'st-tab-active-bg': '--tab-active-bg',
      'st-tab-active-text': '--tab-active-text',
      'st-tab-inactive-bg': '--tab-inactive-bg',
      'st-tab-inactive-text': '--tab-inactive-text',
      'st-glass-bg': '--glass-bg',
      'st-glass-text': '--glass-text',
      'st-btn-primary': '--primary-color',
      'st-btn-success': '--success-color',
      'st-btn-danger': '--error-color',
      'st-btn-info': '--info-color',
      'st-btn-secondary': '--secondary-color',
      'st-text-color': '--text-color',
      'st-border-color': '--border-color',
      'st-surface-color': '--surface-color',
      'st-hover-bg': '--hover-bg',
      'st-input-bg': '--input-bg',
    };

    Object.entries(colorMapping).forEach(([elementId, colorVar]) => {
      const el = getE(elementId);
      if (el && el.value) {
        colors[colorVar] = el.value;
      }
    });

    return colors;
  }

  /**
   * Get all CSS variables for current theme
   */
  getThemeVariables() {
    return this.getCurrentThemeConfig().colors;
  }

  /**
   * Get all CSS variables for all themes
   */
  getAllThemeVariables() {
    return THEME_CONFIG;
  }

  /**
   * Export current settings as JSON
   */
  exportSettings() {
    return {
      theme: this.currentTheme,
      config: this.getCurrentThemeConfig(),
    };
  }

  /**
   * Import settings from JSON
   */
  importSettings(settings) {
    if (settings.theme && THEME_CONFIG[settings.theme]) {
      this.applyTheme(settings.theme);
      return true;
    }
    return false;
  }
}

// =========================================================================
// 3. GLOBAL INITIALIZATION & HELPERS
// =========================================================================

// Create global instance
let THEME_MANAGER = null;

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    THEME_MANAGER = new ThemeManager();
    window.THEME_MANAGER = THEME_MANAGER;
  });
} else {
  THEME_MANAGER = new ThemeManager();
  window.THEME_MANAGER = THEME_MANAGER;
}

/**
 * Global helper: Toggle theme
 */
function toggleTheme(direction = 'next') {
  if (!THEME_MANAGER) return;
  const newTheme = THEME_MANAGER.toggleTheme(direction);
  updateThemeToggleButton(newTheme);
  return newTheme;
}
window.toggleTheme = toggleTheme;
/**
 * Global helper: Apply theme from settings form dropdown
 * Called when user selects a preset from the form
 * @param {string} presetKey - Theme key ('light', 'dark', 'minimal', 'warm', 'custom')
 */
function applyThemePresetFromForm(presetKey) {
  if (!THEME_MANAGER) return;

  const theme = THEME_CONFIG[presetKey];
  if (!theme && presetKey !== 'custom') return;

  if (presetKey !== 'custom') {
    // Use ThemeManager to fill form with all colors + setup sync
    THEME_MANAGER.currentTheme = presetKey;
    THEME_MANAGER.fillSettingsForm(); // ← FILL ALL FIELDS (color + text display)
    THEME_MANAGER.setupColorSync(); // ← SETUP COLOR SYNC
  }

  // Apply the theme (update CSS variables, localStorage, dispatch event)
  THEME_MANAGER.applyTheme(presetKey);
}
window.applyThemePresetFromForm = applyThemePresetFromForm;
/**
 * Global helper: Update theme toggle button
 */
function updateThemeToggleButton(themeName) {
  const btn = getE('theme-toggle');
  if (!btn) return;

  const icons = {
    light: '☀️',
    dark: '🌙',
    minimal: '◯',
    warm: '🔥',
  };

  btn.innerHTML = icons[themeName] || '🎨';
  setVal('st-theme-preset', themeName);
}
window.updateThemeToggleButton = updateThemeToggleButton;
/**
 * Global helper: Preview logo file upload
 * Called from HTML form: <input onchange="previewLogo()" />
 */
function previewLogo() {
  const fileInput = getE('st-logo-upload');
  const preview = getE('st-logo-preview');

  if (!fileInput || !fileInput.files[0] || !preview) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    preview.src = e.target.result;
  };
  reader.readAsDataURL(fileInput.files[0]);
}
window.previewLogo = previewLogo;
/**
 * Global helper: Save settings from form
 * Called from saveThemeSettings() in logic_base.js
 */
function saveThemeSettings() {
  if (!THEME_MANAGER) {
    logError('Theme manager not initialized');
    return false;
  }

  if (!THEME_MANAGER.saveSettingsFromForm()) {
    return false;
  }

  // Close modal if open
  const modalEl = document.getElementById('dynamic-modal');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  // Save shortcuts if function exists
  if (typeof saveShortcutsConfig === 'function') {
    saveShortcutsConfig();
  }

  return true;
}
window.saveThemeSettings = saveThemeSettings;
