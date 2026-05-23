/**
 * @fileoverview Settings Schema — Field definitions for the Firestore `settings` collection.
 * Based on packages/shared/schemas/settings.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'settings';

/**
 * Settings document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	key: { type: 'string', description: 'Setting key (e.g., "site_general", "payment_config", "email_config")' },
	value: { type: 'object', description: 'Setting value (JSON object)' },
	description: { type: 'string', description: 'Human-readable description' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const settingsSchema = { COLLECTION_NAME, FIELDS };
