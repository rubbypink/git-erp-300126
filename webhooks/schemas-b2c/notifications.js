/**
 * @fileoverview Notifications Schema — Field definitions for the Firestore `notifications` collection.
 * Based on packages/shared/schemas/notifications.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'notifications';

/**
 * Notification document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	userId: { type: 'string', description: 'Reference to users collection document ID' },
	type: { type: 'string', description: '"booking_confirmed" | "booking_cancelled" | "payment_received" | "review_approved" | "system"' },
	title: { type: 'string', description: 'Notification title' },
	message: { type: 'string', description: 'Notification body message' },
	isRead: { type: 'boolean', description: 'Whether the notification has been read' },
	data: { type: 'object', description: 'Arbitrary notification payload' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const notificationsSchema = { COLLECTION_NAME, FIELDS };
