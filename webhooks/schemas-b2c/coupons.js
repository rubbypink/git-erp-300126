/**
 * @fileoverview Coupons Schema — Field definitions for the Firestore `coupons` collection.
 * Based on packages/shared/schemas/coupons.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'coupons';

/**
 * Coupon document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000"' },
	code: { type: 'string', required: true, description: 'Coupon code (e.g., "SUMMER26")' },
	serviceType: { type: 'string', description: '"hotels" | "tours" | "activities" | "all". Default "all"' },
	serviceName: { type: 'string', description: 'Exactly id of service that can apply coupon' },
	discountType: { type: 'string', description: '"percentage" | "fixed"' },
	discountValue: { type: 'number', description: '10 (10%) or 100000 (100k VND fixed)' },
	minOrderValue: { type: 'number', description: 'Minimum order value to apply' },
	maxDiscount: { type: 'number', description: 'Maximum discount amount cap' },
	startDate: { type: 'string', description: 'ISO timestamp - coupon validity start' },
	endDate: { type: 'string', description: 'ISO timestamp - coupon validity end' },
	usageLimit: { type: 'number', description: 'Max number of uses' },
	usedCount: { type: 'number', description: 'Current usage count' },
	status: { type: 'string', description: '"active" | "inactive" | "expired"' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const couponsSchema = { COLLECTION_NAME, FIELDS };
