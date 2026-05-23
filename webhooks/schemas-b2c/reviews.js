/**
 * @fileoverview Reviews Schema — Field definitions for the Firestore `reviews` collection.
 * Based on packages/shared/schemas/reviews.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'reviews';

/**
 * Review document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	serviceId: { type: 'string', description: 'Reference to the service being reviewed' },
	serviceType: { type: 'string', description: '"hotel" | "tour" | "activity" | "car" | "rental"' },
	userId: { type: 'string', description: 'Reference to users collection document ID' },
	userName: { type: 'string', description: 'Display name of the reviewer' },
	userAvatar: { type: 'string', description: 'Avatar URL of the reviewer' },
	rating: { type: 'number', description: 'Rating from 1 to 10' },
	title: { type: 'string', description: 'Review title' },
	content: { type: 'string', description: 'Review content' },
	images: { type: 'array', items: { type: 'string' }, description: 'Array of image URLs' },
	status: { type: 'string', description: '"approved" | "pending" | "rejected"' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const reviewsSchema = { COLLECTION_NAME, FIELDS };
