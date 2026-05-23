/**
 * @fileoverview Locations Schema — Field definitions for the Firestore `locations` collection.
 * Based on packages/shared/schemas/locations.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'locations';

/**
 * Location document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	name: { type: 'string', required: true, description: 'Location name (e.g., "Phú Quốc")' },
	slug: { type: 'string', required: true, description: 'URL-friendly slug (e.g., "phu-quoc")' },
	type: { type: 'string', description: '"island" | "city" | "province" | "district" | "ward"' },
	parentId: { type: 'string', description: 'Reference to parent location ID, null for top-level' },
	image: { type: 'string', description: 'Cover image URL' },
	description: { type: 'string', description: 'Short description' },
	status: { type: 'string', description: '"active" | "inactive"' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const locationsSchema = { COLLECTION_NAME, FIELDS };
