/**
 * =========================================================================
 * M_TouchGestureAdapter.js — Unified Desktop↔Mobile Event Bridge
 * Purpose: Automatically convert ALL mobile touch gestures into standard
 *          desktop DOM events so existing listeners work on mobile
 *          without any code changes.
 *
 * Gesture Mapping:
 *   ┌─────────────────────┬──────────────────────────────────────┐
 *   │  Desktop Event       │  Mobile Gesture (Auto-dispatched)    │
 *   ├─────────────────────┼──────────────────────────────────────┤
 *   │  click               │  Tap (single touch, fast dispatch)   │
 *   │  dblclick            │  Double-tap (2 taps within 300ms)    │
 *   │  contextmenu         │  Long-press (hold ≥ 500ms)           │
 *   └─────────────────────┴──────────────────────────────────────┘
 *
 * How it works:
 *   1. Listens for touch events at document level (event delegation).
 *   2. Detects gesture patterns (tap, double-tap, long-press).
 *   3. Dispatches synthetic MouseEvent (click / dblclick / contextmenu)
 *      with correct clientX/clientY from the touch point.
 *   4. The event bubbles normally → existing desktop handlers just work.
 *   5. Native click events from touch are annotated with _fromTouch flag
 *      and ghost clicks after gestures are automatically suppressed.
 *
 * Smart Click Handling:
 *   - Non-interactive elements (table rows, divs, spans): Fast synthetic
 *     click dispatched from touchend, bypassing native click pipeline.
 *   - Interactive elements (input, button, a, select, textarea, label):
 *     Native click preserved for proper focus/toggle/navigation behavior,
 *     annotated with _fromTouch flag for downstream handlers.
 *
 * Event Flow per gesture:
 *
 *   TAP (non-interactive):
 *     touchstart → touchend → synthetic click → native click suppressed
 *
 *   TAP (interactive: input, button, a...):
 *     touchstart → touchend → native click fires (annotated _fromTouch)
 *
 *   DOUBLE-TAP:
 *     1st touchend → click (synthetic or native)
 *     2nd touchend → click (synthetic) + dblclick (synthetic)
 *     Total: 2 clicks + 1 dblclick — matches desktop mousedown/up/click×2
 *
 *   LONG-PRESS:
 *     touchstart → hold 500ms → contextmenu (synthetic) + haptic
 *     touchend → all clicks suppressed
 *
 * Benefits:
 *   - Zero changes to existing click / dblclick / contextmenu handlers.
 *   - Any NEW desktop listener added in the future also works on mobile.
 *   - Single initialization, document-level delegation — no per-element setup.
 *   - Suppresses native browser context menu after synthetic dispatch.
 *   - Ghost click prevention after long-press and double-tap.
 *   - Scroll/swipe detection — gestures cancelled if finger moves.
 *
 * Usage:
 *   // Standalone:
 *   const adapter = new TouchGestureAdapter();
 *   adapter.init();
 *
 *   // Via module system (recommended — ContextMenu auto-inits this):
 *   A.ContextMenu.touchAdapter  // access the initialized instance
 *
 * @module M_TouchGestureAdapter
 * @version 1.1
 * =========================================================================
 */

// =========================================================================
// 1. DEFAULT CONFIGURATION
// =========================================================================

const GESTURE_DEFAULTS = {
  /** Milliseconds to hold before long-press triggers contextmenu */
  longPressMs: 500,

  /** Max milliseconds between two taps to count as double-tap */
  doubleTapMs: 300,

  /** Max movement (px) allowed during touch before canceling gesture */
  moveTolerance: 10,

  /** Max distance (px) between two taps to count as double-tap */
  tapDistance: 25,

  /** Trigger device vibration on long-press (if supported) */
  hapticFeedback: true,

  /** Duration (ms) to suppress native contextmenu after synthetic dispatch.
   *  Prevents native menu from appearing on Android after our custom menu shows. */
  suppressNativeMs: 800,

  /** Duration (ms) to suppress native click after synthetic click dispatch.
   *  Prevents double-firing when we dispatch our own fast click. */
  suppressNativeClickMs: 400,

  /** Enable tap → click mapping.
   *  Non-interactive elements get fast synthetic click.
   *  Interactive elements keep native click but get _fromTouch annotation. */
  enableClick: true,

  /** Enable long-press → contextmenu mapping */
  enableLongPress: true,

  /** Enable double-tap → dblclick mapping */
  enableDoubleTap: true,
};

// ── Interactive element classification ──────────────────────────────────
// These tags REQUIRE native click for proper focus, toggle, or navigation.
// Non-interactive elements get fast synthetic click dispatched from touchend.

/** @type {Set<string>} HTML tags that need native click behavior */
const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'LABEL', 'OPTION']);

/** @type {string} CSS selector for interactive ancestors (e.g. <span> inside <button>) */
const INTERACTIVE_ANCESTOR = 'a, button, label, [role="button"], [role="link"], [contenteditable="true"]';

// =========================================================================
// 2. TOUCH GESTURE ADAPTER CLASS
// =========================================================================

class TouchGestureAdapter {
  /** @type {object} Merged configuration */
  #config;

  /** @type {boolean} Whether init() has been called */
  #initialized = false;

  /** @type {AbortController} For cleanup of all document listeners */
  #abortController = null;

  // ── Long-press gesture state ──────────────────────────────────────────
  /** @type {number|null} Timer ID for long-press threshold */
  #lpTimer = null;
  /** @type {number} Touch start X coordinate */
  #lpStartX = 0;
  /** @type {number} Touch start Y coordinate */
  #lpStartY = 0;
  /** @type {EventTarget|null} Element under finger at touchstart */
  #lpTarget = null;
  /** @type {boolean} Whether long-press fired (suppress subsequent tap) */
  #lpTriggered = false;

  // ── Double-tap gesture state ──────────────────────────────────────────
  /** @type {number} Timestamp of last single tap */
  #lastTapTime = 0;
  /** @type {number} X of last tap */
  #lastTapX = 0;
  /** @type {number} Y of last tap */
  #lastTapY = 0;

  // ── Click / tap state ─────────────────────────────────────────────────
  /** @type {number} Timestamp of last touchend (for _fromTouch annotation) */
  #lastTouchEndTime = 0;
  /** @type {number} Timestamp of last synthetic click dispatch */
  #lastSyntheticClick = 0;
  /** @type {boolean} Whether to suppress the next native click entirely */
  #suppressClick = false;

  // ── Native event suppression ──────────────────────────────────────────
  /** @type {number} Timestamp of last synthetic contextmenu dispatch */
  #lastSyntheticContextmenu = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {object} [config] - Override any GESTURE_DEFAULTS value
   */
  constructor(config = {}) {
    this.#config = { ...GESTURE_DEFAULTS, ...config };
  }

  /**
   * Check if the current device uses touch as PRIMARY input.
   *
   * Uses CSS media query `(pointer: coarse)` which correctly distinguishes:
   *  - Phone/Tablet (primary = finger)           → true
   *  - Desktop with touch monitor (primary = mouse) → false
   *  - Windows Chrome/Edge reporting maxTouchPoints > 0 on non-touch desktop → false
   *
   * Fallback for browsers without matchMedia: original check + screen size heuristic.
   *
   * @returns {boolean}
   */
  static get isTouch() {
    // matchMedia('(pointer: coarse)') — primary input device is imprecise (finger)
    // Desktop PCs with touch-capable hardware still report 'pointer: fine' (mouse)
    if (window.matchMedia) {
      return window.matchMedia('(pointer: coarse)').matches;
    }
    // Fallback: require both touch API AND small screen (< 1024px)
    return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth <= 1024;
  }

  /**
   * Initialize document-level touch listeners.
   *
   * - Safe to call multiple times (idempotent).
   * - Only activates on touch-capable devices.
   * - Returns `this` for chaining: `new TouchGestureAdapter().init()`
   *
   * @returns {TouchGestureAdapter}
   */
  init() {
    if (this.#initialized) return this;

    // Skip entirely on non-touch devices (pure desktop mouse/keyboard)
    if (!TouchGestureAdapter.isTouch) {
      console.log('[TouchGestureAdapter] Non-touch device — skipped init.');
      return this;
    }

    this.#initialized = true;
    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;

    // ── Core touch lifecycle ─────────────────────────────────────────
    document.addEventListener('touchstart', (e) => this.#onTouchStart(e), {
      signal,
      passive: true,
    });

    document.addEventListener('touchmove', (e) => this.#onTouchMove(e), {
      signal,
      passive: true,
    });

    // touchend: non-passive — we MUST call preventDefault() after
    // long-press / double-tap to suppress native click / zoom
    document.addEventListener('touchend', (e) => this.#onTouchEnd(e), {
      signal,
      passive: false,
    });

    document.addEventListener('touchcancel', () => this.#cancelLongPress(), { signal });

    // ── Suppress native contextmenu after our synthetic one ──────────
    document.addEventListener(
      'contextmenu',
      (e) => {
        if (e._synthetic) return;
        if (Date.now() - this.#lastSyntheticContextmenu < this.#config.suppressNativeMs) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      { signal, capture: true }
    );

    // ── Click handler: annotate touch-clicks + suppress ghost clicks ─
    // This capture-phase listener serves three purposes:
    //   1. Annotate native clicks from touch with _fromTouch flag
    //   2. Suppress ghost clicks after long-press / double-tap
    //   3. Suppress redundant native clicks when synthetic click was dispatched
    document.addEventListener(
      'click',
      (e) => {
        // Let our own synthetic clicks through untouched
        if (e._synthetic) return;

        // 1. Annotate native clicks that come from touch interactions
        if (Date.now() - this.#lastTouchEndTime < this.#config.suppressNativeClickMs) {
          e._fromTouch = true;
        }

        // 2. Hard suppress: after long-press or double-tap, kill the ghost click
        if (this.#suppressClick) {
          this.#suppressClick = false;
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        // 3. Soft suppress: native click after we already dispatched synthetic click.
        //    stopImmediatePropagation prevents double-firing of click handlers,
        //    but we do NOT preventDefault — native behaviors like focus, checkbox
        //    toggle, and link navigation still work from the native event.
        if (Date.now() - this.#lastSyntheticClick < this.#config.suppressNativeClickMs) {
          e.stopImmediatePropagation();
        }
      },
      { signal, capture: true }
    );
    console.log('[TouchGestureAdapter] ✅ Initialized — tap → click, double-tap → dblclick, long-press → contextmenu');
    return this;
  }

  /**
   * Tear down all listeners and clean up.
   */
  destroy() {
    this.#cancelLongPress();
    this.#abortController?.abort();
    this.#abortController = null;
    this.#initialized = false;
    this.#suppressClick = false;
    this.#lastTouchEndTime = 0;
    this.#lastSyntheticClick = 0;
    this.#lastSyntheticContextmenu = 0;
    this.#lastTapTime = 0;
    document.getElementById('touch-gesture-adapter-css')?.remove();
  }

  /** @returns {boolean} Whether the adapter is active */
  get active() {
    return this.#initialized;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOUCH EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * touchstart — Record finger position and start long-press timer.
   * Multi-finger touches cancel any pending gesture.
   *
   * @param {TouchEvent} e
   */
  #onTouchStart(e) {
    // Multi-finger → not a single gesture, cancel
    if (e.touches.length !== 1) {
      this.#cancelLongPress();
      return;
    }

    const touch = e.touches[0];
    this.#lpStartX = touch.clientX;
    this.#lpStartY = touch.clientY;
    this.#lpTarget = e.target;
    this.#lpTriggered = false;

    // ── Start long-press timer ──────────────────────────────────────
    if (this.#config.enableLongPress) {
      this.#cancelLongPress(); // Clear any lingering timer

      this.#lpTimer = setTimeout(() => {
        this.#lpTriggered = true;
        this.#suppressClick = true; // Prevent ghost click after menu shows

        // Dispatch synthetic contextmenu at the touch position
        this.#dispatch('contextmenu', this.#lpTarget, this.#lpStartX, this.#lpStartY);
        this.#lastSyntheticContextmenu = Date.now();

        // Haptic feedback (subtle vibration)
        if (this.#config.hapticFeedback && navigator.vibrate) {
          navigator.vibrate(30);
        }
      }, this.#config.longPressMs);
    }
  }

  /**
   * touchmove — Cancel long-press if finger moves beyond tolerance.
   * This ensures scrolling doesn't trigger the context menu.
   *
   * @param {TouchEvent} e
   */
  #onTouchMove(e) {
    if (!this.#lpTimer || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - this.#lpStartX);
    const dy = Math.abs(touch.clientY - this.#lpStartY);

    if (dx > this.#config.moveTolerance || dy > this.#config.moveTolerance) {
      this.#cancelLongPress();
    }
  }

  /**
   * touchend — Unified gesture detection and event dispatch.
   *
   * Priority order:
   *   1. Long-press already fired → suppress click, done.
   *   2. Finger moved too much → was a scroll/swipe, ignore entirely.
   *   3. Double-tap pattern → dispatch click (2nd) + dblclick.
   *   4. Single tap → dispatch click (fast, for non-interactive) or
   *      let native click handle it (for interactive elements).
   *
   * @param {TouchEvent} e
   */
  #onTouchEnd(e) {
    this.#cancelLongPress();
    this.#lastTouchEndTime = Date.now();

    // ── 1. Post long-press: suppress everything ─────────────────────
    if (this.#lpTriggered) {
      e.preventDefault();
      this.#lpTriggered = false;
      this.#suppressClick = true;
      return;
    }

    const touch = e.changedTouches?.[0];
    if (!touch) return;

    // ── 2. Scroll / swipe detection ─────────────────────────────────
    // If finger moved significantly between touchstart and touchend,
    // this was a scroll or swipe gesture, not a tap.
    const moveDx = Math.abs(touch.clientX - this.#lpStartX);
    const moveDy = Math.abs(touch.clientY - this.#lpStartY);

    if (moveDx > this.#config.moveTolerance || moveDy > this.#config.moveTolerance) {
      this.#lastTapTime = 0; // Reset double-tap tracking
      return;
    }

    const now = Date.now();
    const target = e.target;
    const cx = touch.clientX;
    const cy = touch.clientY;

    // ── 3. Double-tap detection ─────────────────────────────────────
    if (this.#config.enableDoubleTap && this.#lastTapTime > 0) {
      const dtDx = Math.abs(cx - this.#lastTapX);
      const dtDy = Math.abs(cy - this.#lastTapY);
      const timeDiff = now - this.#lastTapTime;

      if (timeDiff > 0 && timeDiff < this.#config.doubleTapMs && dtDx < this.#config.tapDistance && dtDy < this.#config.tapDistance) {
        // ✅ Double-tap detected!
        e.preventDefault();

        // Dispatch click (for 2nd tap) + dblclick — matches desktop order:
        // Desktop: mousedown→mouseup→click → mousedown→mouseup→click→dblclick
        if (this.#config.enableClick) {
          this.#dispatch('click', target, cx, cy);
          this.#lastSyntheticClick = now;
        }
        this.#dispatch('dblclick', target, cx, cy);

        // Reset to prevent triple-tap from firing another dblclick
        this.#lastTapTime = 0;
        this.#suppressClick = true; // Suppress native click for 2nd tap
        return;
      }
    }

    // ── 4. Single tap → click ───────────────────────────────────────
    if (this.#config.enableClick) {
      if (!this.#isInteractiveElement(target)) {
        // Non-interactive element: dispatch fast synthetic click.
        // The capture-phase click listener will suppress the redundant
        // native click (soft suppress — keeps default behaviors).
        this.#dispatch('click', target, cx, cy);
        this.#lastSyntheticClick = now;
      }
      // Interactive elements (input, button, a, select, textarea, label):
      // Let native click handle it for proper focus, toggle, navigation.
      // The capture-phase listener annotates it with _fromTouch.
    }

    // Record position & time for potential double-tap
    this.#lastTapTime = now;
    this.#lastTapX = cx;
    this.#lastTapY = cy;
  }

  /**
   * Cancel the long-press timer if running.
   */
  #cancelLongPress() {
    if (this.#lpTimer) {
      clearTimeout(this.#lpTimer);
      this.#lpTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ELEMENT CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check whether the tapped element is an interactive form element
   * that requires native click behavior for proper functionality.
   *
   * Interactive elements (INPUT, BUTTON, A, etc.):
   *   → Native click preserved for focus, toggle, navigation.
   *   → Annotated with `_fromTouch = true` by capture-phase listener.
   *
   * Non-interactive elements (TR, TD, DIV, SPAN, etc.):
   *   → Fast synthetic click dispatched from touchend.
   *   → Native click suppressed to prevent double-firing.
   *
   * @param {EventTarget} el - The tapped element
   * @returns {boolean} true if element needs native click
   */
  #isInteractiveElement(el) {
    if (!(el instanceof HTMLElement)) return false;

    // Direct tag check (INPUT, TEXTAREA, SELECT, BUTTON, A, LABEL, OPTION)
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;

    // Content-editable elements need native focus behavior
    if (el.isContentEditable) return true;

    // Ancestor check: <span> inside <button>, <i> inside <a>, etc.
    if (el.closest(INTERACTIVE_ANCESTOR)) return true;

    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SYNTHETIC EVENT DISPATCH
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create and dispatch a synthetic MouseEvent from touch coordinates.
   *
   * The event is marked with `_synthetic = true` and `_fromTouch = true`
   * so handlers can distinguish it from real mouse events if needed.
   *
   * @param {string}      eventType - DOM event name ('click', 'contextmenu', 'dblclick')
   * @param {EventTarget} target    - Element to dispatch on
   * @param {number}      clientX   - Viewport X coordinate
   * @param {number}      clientY   - Viewport Y coordinate
   */
  #dispatch(eventType, target, clientX, clientY) {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      screenX: window.screenX + clientX,
      screenY: window.screenY + clientY,
    });

    // Mark so handlers can detect synthetic origin
    event._synthetic = true;
    event._fromTouch = true;

    target.dispatchEvent(event);
  }
}

// =========================================================================
// AUTO-INITIALIZATION
// =========================================================================
// Self-initializing: just importing this module activates the adapter.
// On touch devices, all desktop events (click, dblclick, contextmenu)
// are automatically bridged from touch gestures.
// On non-touch devices, this is a no-op (zero overhead).

/** @type {TouchGestureAdapter} Singleton instance */
const MobileEvent = new TouchGestureAdapter();
MobileEvent.init();

// =========================================================================
// EXPORT
// =========================================================================
export default MobileEvent;
