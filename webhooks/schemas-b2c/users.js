/**
 * @fileoverview Users Schema — Field definitions for the Firestore `users` collection.
 * Based on users.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'users';

/**
 * User document field definitions.
 * Each entry: { type, required?, description }
 * @type {Object<string, {type: string, required?: boolean, description: string}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	uid: { type: 'string', required: true, description: 'Firebase Auth UID (from firebase auth)' },
	email: { type: 'string', required: true, description: 'User email' },
	password: { type: 'string', description: 'Hashed password (if using email/password auth)' },
	fullName: { type: 'string', required: true, description: 'Display name' },
	phone: { type: 'string', description: 'Phone number (optional)' },
	photoURL: { type: 'string', description: 'Avatar URL' },
	role: { type: 'string', description: 'Fixed: "customer" (per system rules — no admin/partner)' },
	status: { type: 'string', description: '"active" | "inactive" | "banned"' },
	createdAt: { type: 'string', description: 'ISO timestamp of creation' },
	updatedAt: { type: 'string', description: 'ISO timestamp of last update' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const usersSchema = { COLLECTION_NAME, FIELDS };
