/**
 * @fileoverview Counters Schema — Field definitions for the Firestore `counters` collection.
 * Based on packages/shared/schemas/counters.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'counters';

/**
 * Counter document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Collection name as document ID (e.g., "bookings")' },
	seq: { type: 'number', required: true, description: 'Auto-incrementing sequence number starting at 10000' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const countersSchema = { COLLECTION_NAME, FIELDS };
