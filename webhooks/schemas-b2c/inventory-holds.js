/**
 * @fileoverview Inventory Holds Schema — Field definitions for the Firestore `inventory_holds` collection.
 * Based on packages/shared/schemas/inventory-holds.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'inventory_holds';

/**
 * Inventory Hold document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	serviceId: { type: 'string', required: true, description: 'Reference to the service being held' },
	serviceType: { type: 'string', description: '"hotel_room" | "tour" | "activity" | "car" | "rental"' },
	roomId: { type: 'string', description: 'Room ID, required when serviceType is "hotel_room"' },
	rateType: { type: 'string', description: 'Rate/package name, required when serviceType is "hotel_room"' },
	startDate: { type: 'string', description: 'ISO date string YYYY-MM-DD - hold start' },
	endDate: { type: 'string', description: 'ISO date string YYYY-MM-DD - hold end' },
	quantity: { type: 'number', description: 'Number of units held' },
	userId: { type: 'string', description: 'Reference to users collection document ID' },
	heldAt: { type: 'string', description: 'ISO timestamp of when the hold was created' },
	expiresAt: { type: 'string', description: 'ISO timestamp - hold expiration (15 minute TTL)' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const inventoryHoldsSchema = { COLLECTION_NAME, FIELDS };
