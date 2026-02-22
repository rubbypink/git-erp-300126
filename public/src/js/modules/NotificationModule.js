/**
 * 9 TRIP ERP - CLIENT SIDE
 * NotificationModule - Notification Management System
 * Standard: Singleton Pattern + Firebase Cloud Functions v2
 * 
 * Usage in main.js:
 * 1. NotificationModule.getInstance() → Returns singleton
 * 2. Async init runs automatically in background
 * 3. OR await NotificationModule.getInstance().waitForInitialization()
 */

class NotificationModule {
    static #instance = null;

    // ★ CONFIGURATION
    static CONFIG = {
        REGION: 'asia-southeast1',
        VAPID_KEY: 'BPX6h6jp0syY263nIiwVKB-7TJRp83xoo1rFt0fLJ9w-wvb87Xd-aKcFg3j1-dzrKgAY5fEuUzohdmdlX-nnPdE'
    };

    constructor() {
        // === LIFECYCLE STATE ===
        this.isInitialized = false;
        this._initPromise = null;

        // === FIREBASE SDK ===
        this.sendTopicMessage = null;
        this.messaging = null;

        // === DEVICE STATE ===
        this.isOnline = navigator.onLine;
        this.fcmToken = null;
        this.notificationPermission = null;

        // === USER STATE ===
        this.currentUser = null;

        // ===STORAGE ===
        this.unreadNotifications = [];
        this.storageKey = 'app_unread_notifications';
        this.tokenKey = 'app_fcm_token';

        // ★ OPTIMIZATION: Track registration state to prevent redundant calls
        this._lastRegisteredToken = null;
        this._lastRegisteredTopics = null;
        this._registrationInProgress = false;

        // ★ OPTIONS
        this.options = {
            enabled: true,
            retryAttempts: 2,
            retryDelayMs: 1000,
            debug: true,
            persistOfflineMessages: true,
            maxStoredNotifications: 100,
            requestTokenPermission: true
        };

        // ★ AUTO SETUP
        this._setupNetworkListeners();
        this._initPromise = this._initialize(); // Fire-and-forget async init
    }

    // =========================================================================
    // SINGLETON PATTERN
    // =========================================================================

    /**
     * Get or create singleton instance
     * Init runs automatically in background
     * 
     * @returns {NotificationModule} Singleton instance
     */
    static getInstance() {
        if (!NotificationModule.#instance) {
            NotificationModule.#instance = new NotificationModule();
        }
        return NotificationModule.#instance;
    }

    /**
     * Wait for initialization to complete (if needed)
     * 
     * @returns {Promise<boolean>} True when ready
     */
    async waitForInitialization() {
        await this._initPromise;
        return this.isInitialized;
    }

    // =========================================================================
    // STATIC METHODS (For direct class method calls)
    // =========================================================================

    /**
     * Static: Send to Sales role
     */
    static async sendToSales(title, body) {
        return NotificationModule.getInstance().sendToSales(title, body);
    }

    /**
     * Static: Send to Operator role
     */
    static async sendToOperator(title, body) {
        return NotificationModule.getInstance().sendToOperator(title, body);
    }

    /**
     * Static: Send to Accountant role
     */
    static async sendToAccountant(title, body) {
        return NotificationModule.getInstance().sendToAccountant(title, body);
    }

    /**
     * Static: Send to All users
     */
    static async sendToAll(title, body) {
        return NotificationModule.getInstance().sendToAll(title, body);
    }

    /**
     * Static: Send to Admin
     */
    static async sendToAdmin(title, body) {
        return NotificationModule.getInstance().sendToAdmin(title, body);
    }

    /**
     * Static: Send to any topic
     */
    static async send(topic, title, body) {
        return NotificationModule.getInstance().send(topic, title, body);
    }

    // =========================================================================
    // INITIALIZATION (AUTO-RUNS IN CONSTRUCTOR)
    // =========================================================================

    /**
     * Private: Initialize module (called automatically from constructor)
     * Runs in background without blocking
     */
    async _initialize() {
        if (this.isInitialized) return true;

        try {
            // 1. Check Firebase SDK
            if (!window.firebase || !window.firebase.functions) {
                throw new Error('Firebase SDK not loaded!');
            }
            if (window.CURRENT_USER) {
                this.setCurrentUser(window.CURRENT_USER);
            } else {
                this._log('⚠️ CURRENT_USER not found, topics will register after login', 'warning');
            }

            // 2. Setup Cloud Functions
            const app = window.firebase.app();
            this.sendTopicMessage = app.functions(NotificationModule.CONFIG.REGION)
                                       .httpsCallable('sendTopicMessage');

            // 3. Setup Firebase Messaging (FCM)
            if (window.firebase.messaging && NotificationModule.CONFIG.VAPID_KEY) {
                this.messaging = window.firebase.messaging();

                // A. Listen for foreground messages
                this.messaging.onMessage((payload) => {
                    this._handleIncomingMessage(payload);
                });

                // B. Setup background listener (from Service Worker)
                this._setupBroadcastListener();

                // C. Get FCM token (auto-request if needed)
                await this._initializeNotificationPermission();
                await this._requestFCMToken();
            }

            // 4. Load unread from storage
            this._loadUnreadFromStorage();

            this.isInitialized = true;
            this._log('✅ Notification module initialized', 'success');
            return true;

        } catch (err) {
            console.error('[NotificationModule] ❌ Init error:', err);
            return false;
        }
    }

    // =========================================================================
    // NETWORK LISTENERS
    // =========================================================================

    _setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this._log('🌐 Network restored', 'info');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this._log('📡 Network lost', 'warning');
        });
    }

    // =========================================================================
    // NOTIFICATION PERMISSION
    // =========================================================================

    /**
     * Initialize browser notification permission (call once)
     */
    async _initializeNotificationPermission() {
        try {
            if (!window.Notification) {
                this.notificationPermission = 'denied';
                return;
            }

            const current = window.Notification.permission;

            if (current === 'granted') {
                this.notificationPermission = 'granted';
                this._log('✅ Notification permission granted', 'success');
            } else if (current === 'denied') {
                this.notificationPermission = 'denied';
                this._log('⚠️ Notification permission denied', 'warning');
            } else {
                // Prompt user
                const permission = await window.Notification.requestPermission();
                this.notificationPermission = permission;

                if (permission === 'granted') {
                    this._log('✅ User granted Notification permission', 'success');
                } else {
                    this._log('⚠️ User denied Notification permission', 'warning');
                }
            }
        } catch (err) {
            console.warn('[NotificationModule] Permission init error:', err);
            this.notificationPermission = 'denied';
        }
    }

    /**
     * Request new permission (if user wants to re-enable)
     */
    static async requestPermissionAgain() {
        const instance = NotificationModule.getInstance();

        if (!window.Notification) {
            console.error('Browser does not support Notification API');
            return instance.notificationPermission;
        }

        const permission = await window.Notification.requestPermission();
        instance.notificationPermission = permission;

        if (permission === 'granted') {
            instance._log('✅ User granted permission', 'success');
            await instance._requestFCMToken();
        } else {
            instance._log('⚠️ User denied permission', 'warning');
        }

        return permission;
    }

    // =========================================================================
    // FCM TOKEN MANAGEMENT
    // =========================================================================

    /**
     * Request FCM token (only if permission granted)
     */
    async _requestFCMToken() {
        try {
            if (!('serviceWorker' in navigator)) return null;

            // Check permission state
            if (this.notificationPermission !== 'granted') {
                this._log('⚠️ No permission for FCM token', 'warning');
                return null;
            }

            // Get token
            const registration = await navigator.serviceWorker.ready;
            const newToken = await this.messaging.getToken({
                vapidKey: NotificationModule.CONFIG.VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (newToken) {
                this._log('✅ FCM token obtained', 'success');
                localStorage.setItem(this.tokenKey, newToken);

                // ★ OPTIMIZATION: Only register if token changed
                if (newToken !== this._lastRegisteredToken) {
                    console.log('[NotificationModule] 💫 Token changed, registering with Firebase...');
                    this.fcmToken = newToken;
                    await this._registerTopicsOnServer(newToken);
                } else {
                    console.log('[NotificationModule] ✓ Token unchanged, skipping registration');
                    this.fcmToken = newToken;
                }
            }
            return newToken;

        } catch (err) {
            console.warn('[NotificationModule] FCM token error:', err);
            return null;
        }
    }

    /**
     * Get or request token
     */
    static async getOrRequestToken() {
        const instance = NotificationModule.getInstance();

        // 1. Check memory
        if (instance.fcmToken) {
            return instance.fcmToken;
        }

        // 2. Check localStorage
        const saved = localStorage.getItem('app_fcm_token');
        if (saved) {
            instance.fcmToken = saved;
            return saved;
        }

        // 3. Request new
        console.log('⚠️ Token not found, requesting...');
        return await instance._requestFCMToken();
    }

    // =========================================================================
    // TOPIC SUBSCRIPTION
    // =========================================================================

    /**
     * Auto-register topics based on user role
     * ★ OPTIMIZED: Skips redundant registrations
     */
    async _registerTopicsOnServer(token) {
        // Prevent double registration request
        if (this._registrationInProgress) {
            console.log('[NotificationModule] 🔄 Registration already in progress, skipping...');
            return;
        }

        if (!this.currentUser) {
            console.log('[NotificationModule] ⏳ CURRENT_USER not ready, retrying in 2s...');
            setTimeout(() => this._registerTopicsOnServer(token), 2000);
            return;
        }

        this._registrationInProgress = true;

        try {
            const topics = ['All'];
            const role = this.currentUser.role?.toLowerCase() || '';

            if (role.includes('sale') || role === 'admin') topics.push('Sales');
            if (role.includes('operator') || role.includes('op') || role === 'admin') topics.push('Operator');
            if (role.includes('account') || role.includes('acc') || role === 'admin') topics.push('Accountant');
            if (role === 'admin') topics.push('Admin');

            // ★ OPTIMIZATION: Check if topics unchanged
            const topicsStr = topics.sort().join(',');
            const lastTopicsStr = this._lastRegisteredTopics ? this._lastRegisteredTopics.sort().join(',') : '';
            
            if (token === this._lastRegisteredToken && topicsStr === lastTopicsStr) {
                console.log('[NotificationModule] ✓ Topics & token already registered, skipping');
                return;
            }

            this._log(`🔄 Registering topics: ${topics.join(', ')}...`);

            const app = window.firebase.app();
            const subscribeFn = app.functions(NotificationModule.CONFIG.REGION)
                                   .httpsCallable('subscribeToTopics');

            await subscribeFn({ token, topics });

            // ★ TRACK: Update what was registered
            this._lastRegisteredToken = token;
            this._lastRegisteredTopics = [...topics];  // Clone array

            this._log('✅ Topics registered', 'success');

        } catch (err) {
            console.error('[NotificationModule] Topic registration error:', err);
        } finally {
            this._registrationInProgress = false;
        }
    }

    // =========================================================================
    // BACKGROUND LISTENER (Service Worker)
    // =========================================================================

    _setupBroadcastListener() {
        const channel = new BroadcastChannel('erp_notification_channel');
        console.log('[NotificationModule] 📻 BroadcastChannel listening on [erp_notification_channel]');

        channel.onmessage = (event) => {
            console.log('[NotificationModule] 📨 BroadcastChannel message received:', event.data);
            if (event.data && event.data.type === 'BACKGROUND_MESSAGE') {
                const payload = event.data.payload;
                this._log('📻 Background message received', 'info');

                // ★ Service Worker sends: { notification: { title, body }, data: {...}, timestamp }
                this._handleIncomingMessage({
                    notification: payload.notification,  // Already has title & body
                    data: payload.data,
                    timestamp: payload.timestamp
                });
            }
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                console.log('[NotificationModule] 📲 ServiceWorker message received:', event.data);
                if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
                    if (event.data.url && event.data.url !== '/') {
                        window.location.href = event.data.url;
                    }
                }
            });
        }
    }

    // =========================================================================
    // SENDING MESSAGES
    // =========================================================================

    /**
     * Send notification to topic
     */
    async send(topic, title, body) {
        if (!this._validateSendConditions(topic, title, body)) {
            return { success: false, error: 'Invalid data' };
        }

        return this._sendWithRetry(topic, title, body);
    }

    async _sendWithRetry(topic, title, body, attempt = 1) {
        try {
            if (this.options.debug) {
                console.log(`[NotificationModule] 📤 Sending (attempt ${attempt})...`);
            }

            // ★ Add sender information
            const senderName = this._getSenderName();
            const payload = { 
                topic, 
                title, 
                body,
                sender: senderName  // Add sender name to payload
            };
            
            const result = await this.sendTopicMessage(payload);
            const responseData = result.data;

            this._log(`✅ Sent! ID: ${responseData.messageId} (from: ${senderName})`, 'success');

            return {
                success: true,
                messageId: responseData.messageId,
                timestamp: responseData.timestamp
            };

        } catch (error) {
            console.error(`[NotificationModule] ❌ Error (${attempt}):`, error.code, error.message);

            if (attempt < this.options.retryAttempts) {
                const delay = this.options.retryDelayMs * attempt;
                await this._delay(delay);
                return this._sendWithRetry(topic, title, body, attempt + 1);
            }

            return { success: false, error: error.message };
        }
    }

    _validateSendConditions(topic, title, body) {
        if (!topic || !title || !body) {
            this._log('❌ Invalid data', 'error');
            return false;
        }
        if (!this.currentUser && !window.CURRENT_USER) {
            this._log('❌ Login required', 'error');
            return false;
        }
        return true;
    }

    // =========================================================================
    // RECEIVING MESSAGES
    // =========================================================================

    _handleIncomingMessage(payload) {
        // ★ Use ID from Service Worker if available, otherwise generate new one
        const uniqueId = payload.data?.id || `msg_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

        const notification = {
            id: uniqueId,
            title: payload.notification?.title || 'New notification',
            body: payload.notification?.body || '',
            timestamp: payload.timestamp || new Date().toISOString(),
            read: false,
            data: payload.data || {}
        };

        console.log('[NotificationModule] 📬 Adding notification:', notification);
        this.unreadNotifications.unshift(notification);
        console.log('[NotificationModule] 📊 Total unread:', this.unreadNotifications.length);

        if (this.options.persistOfflineMessages) {
            this._saveUnreadToStorage();
        }

        window.dispatchEvent(new CustomEvent('notification_received', {
            detail: notification
        }));

        this._showNotificationBadge();
    }

    // =========================================================================
    // STORAGE & UI
    // =========================================================================

    _saveUnreadToStorage() {
        const limited = this.unreadNotifications.slice(0, this.options.maxStoredNotifications);
        localStorage.setItem(this.storageKey, JSON.stringify(limited));
    }

    _loadUnreadFromStorage() {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
            this.unreadNotifications = JSON.parse(stored);
            this._showNotificationBadge();
        }
    }

    _showNotificationBadge() {
        const count = this.unreadNotifications.filter(n => !n.read).length;
        window.dispatchEvent(new CustomEvent('notification_count_changed', {
            detail: { count }
        }));
    }

    // =========================================================================
    // NOTIFICATION MANAGEMENT (For UI Panel)
    // =========================================================================

    /**
     * Get all notifications (with limit)
     * @param {number} limit - Max results (default 50)
     * @returns {Array} Notifications array
     */
    getAllNotifications(limit = 50) {
        const result = this.unreadNotifications.slice(0, limit);
        console.log('[NotificationModule] 📋 getAllNotifications() returning', result.length, 'items');
        return result;
    }

    /**
     * Get unread notification count
     * @returns {number} Count of unread notifications
     */
    getUnreadNotificationCount() {
        return this.unreadNotifications.filter(n => !n.read).length;
    }

    /**
     * Mark specific notification as read
     * @param {string} notificationId - Notification ID to mark read
     */
    markNotificationAsRead(notificationId) {
        const notif = this.unreadNotifications.find(n => n.id === notificationId);
        if (notif && !notif.read) {
            notif.read = true;
            this._saveUnreadToStorage();
            this._showNotificationBadge();
            
            // Dispatch event for UI update
            window.dispatchEvent(new CustomEvent('notification_marked_read', {
                detail: { id: notificationId }
            }));
            
            this._log('✓ Notification marked as read', 'info');
        }
    }

    /**
     * Mark all notifications as read
     */
    markAllNotificationsAsRead() {
        let changed = false;
        this.unreadNotifications.forEach(n => {
            if (!n.read) {
                n.read = true;
                changed = true;
            }
        });
        
        if (changed) {
            this._saveUnreadToStorage();
            this._showNotificationBadge();
            
            window.dispatchEvent(new CustomEvent('notification_marked_read', {
                detail: { all: true }
            }));
            
            this._log('✓ All notifications marked as read', 'info');
        }
    }

    /**
     * Clear all notifications
     */
    clearAllNotifications() {
        this.unreadNotifications = [];
        this._saveUnreadToStorage();
        this._showNotificationBadge();
        
        window.dispatchEvent(new CustomEvent('notification_cleared', {
            detail: { count: 0 }
        }));
        
        this._log('✓ All notifications cleared', 'info');
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /**
     * Set current user and re-register if role changed
     */
    setCurrentUser(user) {
        const oldRole = this.currentUser?.role;
        const newRole = user?.role;
        const roleChanged = oldRole && oldRole !== newRole;

        this.currentUser = user;

        // ★ OPTIMIZATION: If role changed and we have token, re-register
        if (roleChanged && this.fcmToken) {
            console.log(`[NotificationModule] 🔄 Role changed: ${oldRole} → ${newRole}, updating topics...`);
            this._registerTopicsOnServer(this.fcmToken);  // Fire and forget
        }
    }

    /**
     * Get sender name from current user
     * ★ Multiple fallback options for different user object structures
     */
    _getSenderName() {
        // Check various possible locations of user name
        const name = 
            this.currentUser?.userProfile?.user_name ||      // Preferred structure
            this.currentUser?.profile?.user_name ||          // Alternative
            this.currentUser?.user_name ||                   // Direct property
            this.currentUser?.name ||                        // Generic name field
            window.CURRENT_USER?.userProfile?.user_name ||   // Window global fallback
            window.CURRENT_USER?.profile?.user_name ||       // Window global alternative
            window.CURRENT_USER?.user_name ||                // Window global direct
            window.CURRENT_USER?.name ||                     // Window global generic
            'Unknown User';                                  // Default fallback
        
        return name;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _log(msg, type = 'info') {
        if (!this.options.debug) return;
        const prefix = '[NotificationModule] ';
        if (typeof log === 'function') {
            log(prefix + msg, type);
        } else {
            console.log(prefix + msg);
        }
    }

    // =========================================================================
    // CONSOLE TESTING HELPERS
    // =========================================================================

    /**
     * Call any Cloud Function from console
     * Usage: await Notification.request('sendTopicMessage', {...})
     */
    static async request(functionName, data = {}) {
        try {
            if (!window.firebase || !window.firebase.functions) {
                throw new Error('❌ Firebase SDK not loaded!');
            }

            const app = window.firebase.app();
            const fn = app.functions(NotificationModule.CONFIG.REGION)
                          .httpsCallable(functionName);

            console.log(`📤 Calling ${functionName}...`, data);
            const result = await fn(data);

            console.log(`✅ ${functionName} success:`, result.data);
            return result.data;

        } catch (error) {
            console.error(`❌ ${functionName} error:`, {
                code: error.code,
                message: error.message,
                details: error
            });
            throw error;
        }
    }

    // ===== SHORTCUTS =====
    async sendToSales(title, body) { return this.send('Sales', title, body); }
    async sendToOperator(title, body) { return this.send('Operator', title, body); }
    async sendToAccountant(title, body) { return this.send('Accountant', title, body); }
    async sendToAll(title, body) { return this.send('All', title, body); }
    async sendToAdmin(title, body) { return this.send('Admin', title, body); }
}

export default NotificationModule;

// ★ GLOBAL EXPORTS
window.NotificationModule = NotificationModule;

// ★ GLOBAL FUNCTIONS (For UI Panel & Other Modules)
// These are delegated to singleton instance
window.getAllNotifications = (limit = 50) => {
    const instance = NotificationModule.getInstance();
    return instance.getAllNotifications(limit);
};

window.getUnreadNotificationCount = () => {
    const instance = NotificationModule.getInstance();
    return instance.getUnreadNotificationCount();
};

window.markNotificationAsRead = (notificationId) => {
    const instance = NotificationModule.getInstance();
    return instance.markNotificationAsRead(notificationId);
};

window.markAllNotificationsAsRead = () => {
    const instance = NotificationModule.getInstance();
    return instance.markAllNotificationsAsRead();
};

window.clearAllNotifications = () => {
    const instance = NotificationModule.getInstance();
    return instance.clearAllNotifications();
};
