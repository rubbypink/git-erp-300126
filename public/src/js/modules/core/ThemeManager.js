/**
 * =========================================================================
 * THEME-MANAGER.JS - Simplified Theme Manager
 * Purpose: Quản lý 3 chế độ (System/Auto, Minimal, Warm)
 * =========================================================================
 */

const THEME_CONFIG = {
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
        },
        fontFamily: "'Inter', sans-serif",
        spacingScale: 0.85,
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
        },
        fontFamily: "'Merriweather', serif",
        spacingScale: 1.15,
    },
};

export default class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('app-theme') || 'system';
        this.init();
    }

    init() {
        // 1. Áp dụng theme hiện tại
        this.applyTheme(this.currentTheme, false);

        // 2. Lắng nghe thay đổi theme hệ thống
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (this.currentTheme === 'system') {
                    this._updateBootstrapTheme();
                }
            });
        }
    }

    /**
     * Áp dụng theme
     * @param {string} themeName - 'system', 'minimal', 'warm', 'custom'
     * @param {boolean} save - Có lưu vào localStorage hay không
     */
    applyTheme(themeName, save = true) {
        const root = document.documentElement;

        // Reset styles cũ trước khi áp dụng
        root.style.cssText = '';
        root.removeAttribute('data-theme');

        this.currentTheme = themeName;

        // Cập nhật hiển thị UI section tùy chỉnh nếu đang mở form
        const customSection = document.getElementById('custom-color-section');
        if (customSection) {
            customSection.classList.toggle('d-none', themeName !== 'custom' && !THEME_CONFIG[themeName]);
        }

        if (THEME_CONFIG[themeName]) {
            const theme = THEME_CONFIG[themeName];
            this._updateCSSVariables(theme.colors);
            root.style.setProperty('--font-family', theme.fontFamily);
            root.setAttribute('data-theme', themeName);
            // Palette riêng mặc định là light mode Bootstrap để đảm bảo độ tương phản
            root.setAttribute('data-bs-theme', 'light');
        } else if (themeName === 'custom') {
            const customColors = this._getStoredCustomColors();
            if (customColors) this._updateCSSVariables(customColors);
            root.setAttribute('data-theme', 'custom');
            root.setAttribute('data-bs-theme', 'light');
        } else {
            // Chế độ hệ thống (System)
            this._updateBootstrapTheme(themeName);
        }

        if (save) localStorage.setItem('app-theme', themeName);

        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: themeName, saved: save } }));
        this.updateThemeToggleButton(themeName);
    }

    /**
     * Cập nhật data-bs-theme theo hệ thống hoặc manual
     * @private
     */
    _updateBootstrapTheme(mode = 'system') {
        const root = document.documentElement;
        if (mode === 'dark') {
            root.setAttribute('data-bs-theme', 'dark');
            document.body.classList.add('dark-theme');
        } else if (mode === 'light') {
            root.setAttribute('data-bs-theme', 'light');
            document.body.classList.remove('dark-theme');
        } else {
            // System
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
            if (isDark) document.body.classList.add('dark-theme');
            else document.body.classList.remove('dark-theme');
        }
    }

    _updateCSSVariables(colors) {
        const root = document.documentElement;
        Object.entries(colors).forEach(([name, value]) => {
            root.style.setProperty(name, value);
        });
    }

    _getStoredCustomColors() {
        try {
            return JSON.parse(localStorage.getItem('app-theme-custom-colors'));
        } catch (e) {
            return null;
        }
    }

    saveCustomColors(colors) {
        localStorage.setItem('app-theme-custom-colors', JSON.stringify(colors));
        this.applyTheme('custom');
    }

    /**
     * Fill settings form
     */
    fillSettingsForm() {
        const presetEl = document.getElementById('st-theme-preset');
        if (presetEl) presetEl.value = this.currentTheme;

        // Điền màu sắc nếu có mapping
        const config = THEME_CONFIG[this.currentTheme] || { colors: {} };
        const colorMapping = this._getColorMapping();

        Object.entries(colorMapping).forEach(([id, varName]) => {
            const el = document.getElementById(id);
            if (el) {
                const color = rootStyle().getPropertyValue(varName).trim() || config.colors[varName] || '#000000';
                el.value = color;
                const textEl = document.getElementById(id + '-text');
                if (textEl) textEl.value = el.value;
            }
        });
    }

    _getColorMapping() {
        return {
            'st-primary-color': '--primary-color',
            'st-app-bg': '--app-bg',
            'st-header-bg': '--header-bg',
            'st-text-color': '--text-color',
            'st-surface-color': '--surface-color',
        };
    }

    setupColorSync() {
        const mapping = this._getColorMapping();
        Object.keys(mapping).forEach((id) => {
            const picker = document.getElementById(id);
            const text = document.getElementById(id + '-text');
            if (picker && text) {
                picker.oninput = () => {
                    text.value = picker.value;
                    const preset = document.getElementById('st-theme-preset');
                    if (preset) preset.value = 'custom';
                };
            }
        });
    }

    toggleTheme() {
        const modes = ['system', 'minimal', 'warm'];
        let idx = modes.indexOf(this.currentTheme);
        if (idx === -1) idx = 0;
        const next = modes[(idx + 1) % modes.length];
        this.applyTheme(next);
        return next;
    }
    updateThemeToggleButton(themeName) {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        const icons = { system: '🌓', minimal: '⚪', warm: '🟠', dark: '🌙', light: '☀️' };
        btn.innerHTML = `<i class="fa-solid"></i> ${icons[themeName] || '🎨'}`;
    }
}

// Helpers
const rootStyle = () => getComputedStyle(document.documentElement);

// Global instance initialization
let THEME_MANAGER = new ThemeManager();
window.THEME_MANAGER = THEME_MANAGER;

// Global functions for compatibility
window.toggleTheme = () => THEME_MANAGER.toggleTheme();
window.applyThemePresetFromForm = (val) => THEME_MANAGER.applyTheme(val);

window.saveThemeSettings = () => {
    const preset = document.getElementById('st-theme-preset')?.value;
    if (preset === 'custom') {
        const colors = {};
        const mapping = THEME_MANAGER._getColorMapping();
        Object.entries(mapping).forEach(([id, varName]) => {
            const val = document.getElementById(id)?.value;
            if (val) colors[varName] = val;
        });
        THEME_MANAGER.saveCustomColors(colors);
    } else {
        THEME_MANAGER.applyTheme(preset);
    }

    // Close modal
    const modalEl = document.getElementById('dynamic-modal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    return true;
};

window.previewLogo = () => {
    const file = document.getElementById('st-logo-upload')?.files[0];
    const preview = document.getElementById('st-logo-preview');
    if (file && preview) {
        const reader = new FileReader();
        reader.onload = (e) => (preview.src = e.target.result);
        reader.readAsDataURL(file);
    }
};
