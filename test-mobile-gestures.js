/**
 * =========================================================================
 * MOBILE GESTURES TEST SCRIPT
 * =========================================================================
 * Run this in browser console to test mobile gestures
 * Usage: Copy & paste into F12 Console on mobile emulator
 * 
 * Last Updated: Feb 5, 2026
 */

// ═════════════════════════════════════════════════════════════
// TEST 1: Check if mobile detected
// ═════════════════════════════════════════════════════════════
console.log('=== TEST 1: MOBILE DETECTION ===');
const isMobile = window.matchMedia('(max-width: 768px)').matches;
console.log('Is Mobile (≤768px)?:', isMobile ? '✅ YES' : '❌ NO');
console.log('Window size:', `${window.innerWidth}x${window.innerHeight}`);

// ═════════════════════════════════════════════════════════════
// TEST 2: Check EventManager
// ═════════════════════════════════════════════════════════════
console.log('\n=== TEST 2: EVENT MANAGER ===');
const hasEventManager = typeof window.eventManager !== 'undefined';
console.log('EventManager exists?:', hasEventManager ? '✅ YES' : '❌ NO');

if (hasEventManager) {
    console.log('Initialized?:', window.eventManager.isInitialized ? '✅ YES' : '❌ NO');
    console.log('isMobile():', window.eventManager.isMobile() ? '✅ YES' : '❌ NO');
    console.log('Touch state:', window.eventManager.touchState);
}

// ═════════════════════════════════════════════════════════════
// TEST 3: Check required DOM elements
// ═════════════════════════════════════════════════════════════
console.log('\n=== TEST 3: DOM ELEMENTS ===');
const elements = {
    'Detail tbody': document.getElementById('detail-tbody'),
    'Context menu': document.getElementById('myContextMenu'),
    'Dashboard tab': document.getElementById('tab-dashboard'),
    'Main form': document.getElementById('main-form')
};

Object.entries(elements).forEach(([name, el]) => {
    console.log(`${name}:`, el ? '✅ FOUND' : '❌ MISSING');
});

// ═════════════════════════════════════════════════════════════
// TEST 4: Check Event Listeners (Advanced)
// ═════════════════════════════════════════════════════════════
console.log('\n=== TEST 4: EVENT LISTENERS ===');
const tbody = document.getElementById('detail-tbody');
if (tbody) {
    console.log('Testing touchstart listener on tbody...');
    // This will only show if we manually trigger it
    console.log('✓ Trying to get events (browser limitation prevents full read)');
    console.log('✓ Long-press test: Hold on any detail row for 500ms');
}

// ═════════════════════════════════════════════════════════════
// TEST 5: Manual Gesture Test Functions
// ═════════════════════════════════════════════════════════════
console.log('\n=== TEST 5: MANUAL TESTS ===');
console.log('Run these commands in console:');
console.log('- testDoubleTap()     → Simulate double-tap on first row');
console.log('- testLongPress()     → Simulate long-press on first row');
console.log('- testGestureTimeout()→ Check gesture timeout values');
console.log('- testTouchEvent()    → Check if touch events fire');

// Simulate double-tap
window.testDoubleTap = function() {
    const row = document.querySelector('#tab-dashboard table tbody tr');
    if (!row) {
        console.log('❌ No Dashboard row found');
        return;
    }
    
    console.log('📱 Simulating double-tap on row:', row.id || row.textContent.substring(0, 50));
    
    // First tap
    const event1 = new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [{clientX: 100, clientY: 100}]
    });
    row.dispatchEvent(event1);
    console.log('Tap 1...');
    
    // Second tap within 300ms
    setTimeout(() => {
        const event2 = new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [{clientX: 100, clientY: 100}]
        });
        row.dispatchEvent(event2);
        console.log('Tap 2 (within 300ms) ✅');
    }, 100);
};

// Simulate long-press
window.testLongPress = function() {
    const row = document.querySelector('#detail-tbody tr');
    if (!row) {
        console.log('❌ No detail row found');
        return;
    }
    
    console.log('📱 Simulating long-press on row:', row.id || row.textContent.substring(0, 50));
    
    // touchstart
    const startEvent = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [{clientX: 100, clientY: 100}]
    });
    row.dispatchEvent(startEvent);
    console.log('Touch started... waiting 500ms...');
    
    // Wait 500ms (long-press timeout)
    setTimeout(() => {
        console.log('✅ 500ms reached - context menu should appear!');
        const menu = document.getElementById('myContextMenu');
        if (menu && menu.style.display === 'block') {
            console.log('✅ Context menu VISIBLE');
        } else {
            console.log('⚠️ Context menu not visible (check if gesture handler fired)');
        }
    }, 500);
};

// Check gesture timeouts
window.testGestureTimeout = function() {
    if (!window.eventManager) {
        console.log('❌ EventManager not found');
        return;
    }
    const ts = window.eventManager.touchState;
    console.log('📊 Gesture Timeouts:');
    console.log('  Double-tap window: ' + ts.doubleTapTimeout + 'ms');
    console.log('  Long-press duration: ' + ts.longPressTimeout + 'ms');
};

// Test if touch events work
window.testTouchEvent = function() {
    const el = document.querySelector('#detail-tbody tr') || document.body;
    console.log('Testing touch events on:', el.id || el.tagName);
    
    let touchFired = false;
    const handler = () => {
        touchFired = true;
        console.log('✅ Touch event FIRED!');
        el.removeEventListener('touchstart', handler);
    };
    
    el.addEventListener('touchstart', handler, {once: true});
    console.log('📱 Listener added - now tap on element to test...');
    
    // Auto-cleanup after 3 seconds
    setTimeout(() => {
        el.removeEventListener('touchstart', handler);
        if (!touchFired) {
            console.log('❌ No touch event detected in 3 seconds');
            console.log('💡 Tip: Make sure you\'re on a touch device or using mobile emulator');
        }
    }, 3000);
};

// ═════════════════════════════════════════════════════════════
// FINAL SUMMARY
// ═════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(60));
console.log('MOBILE GESTURES TEST COMPLETE');
console.log('='.repeat(60));

if (isMobile && hasEventManager && window.eventManager.isInitialized) {
    console.log('✅ All systems ready! Try the gestures:');
    console.log('   1. Double-tap on any row in Dashboard');
    console.log('   2. Long-press on any detail row');
} else {
    console.log('⚠️ Some checks failed. Possible issues:');
    if (!isMobile) console.log('   - Not in mobile viewport (< 768px)');
    if (!hasEventManager) console.log('   - EventManager not initialized');
    if (hasEventManager && !window.eventManager.isInitialized) {
        console.log('   - EventManager not fully initialized');
    }
}

console.log('\n📚 For more info, see:');
console.log('   - MOBILE_GESTURES_GUIDE.md');
console.log('   - MOBILE_GESTURES_QUICK_REF.md');
console.log('   - MOBILE_GESTURES_DEVELOPER_GUIDE.md');
