/**
 * @fileoverview Bookings Schema — Field definitions for the Firestore `bookings` collection.
 * Based on bookings.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'bookings';

/**
 * Booking document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000", "10001", etc.' },
	userId: { type: 'string', required: true, description: 'Reference to users collection document ID' },
	bookingCode: { type: 'string', description: 'Optional booking code, defaults to id if not set' },

	// Items
	items: {
		type: 'array',
		description: 'List of items in the booking',
		items: {
			type: 'object',
			properties: {
				serviceId: { type: 'string', description: 'ID of the service (hotel/tour/activity/car/rental)' },
				serviceType: { type: 'string', description: '"hotel" | "tour" | "activity" | "car" | "rental"' },
				serviceTitle: { type: 'string', description: 'Display name of the service' },
				featuredImage: { type: 'string', description: 'URL to featured image' },
				startDate: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
				endDate: { type: 'string', description: 'ISO date string YYYY-MM-DD (optional)' },
				adults: { type: 'number', description: 'Number of adults' },
				children: { type: 'number', description: 'Number of children' },
				infants: { type: 'number', description: 'Number of infants' },
				basePrice: { type: 'number', description: 'Base price per unit' },
				childPrice: { type: 'number', description: 'Total price for child' },
				infantPrice: { type: 'number', description: 'Total price for infant' },
				total: { type: 'number', description: 'Total price for this item' },
				currency: { type: 'string', description: '"VND", "USD"' },
				rateType: { type: 'string', description: 'Rate/package name' },
				prepaid: { type: 'number', description: 'Percentage (%) required as deposit (0-100). 0 = pay on arrival (order)' },
			},
		},
	},

	// Payment
	payment: {
		type: 'object',
		description: 'Payment information',
		properties: {
			prepaid: { type: 'string', description: '"full" | "deposit" | "order" — payment type' },
			total: { type: 'number', description: 'Total booking amount' },
			deposit: { type: 'number', description: 'Amount to prepay (calculated from items prepaid %)' },
			balance: { type: 'number', description: 'Remaining balance (total - deposit)' },
			gate: { type: 'string', description: 'Payment gateway: "MOMO" | "VNPAY" | "PAYPAL"' },
			date: { type: 'string', description: 'ISO timestamp of payment' },
			dueDate: { type: 'string', description: 'ISO date string — payment deadline' },
		},
	},

	// Status
	status: {
		type: 'string',
		description: '"pending" | "ordered" | "deposited" | "confirmed" | "paid" | "canceled" | "refund" | "completed"',
	},

	// Contact info
	contactInfo: {
		type: 'object',
		description: 'Customer contact information',
		properties: {
			fullName: { type: 'string', description: 'Customer full name' },
			email: { type: 'string', description: 'Customer email' },
			phone: { type: 'string', description: 'Customer phone number' },
			specialRequests: { type: 'string', description: 'Any special requests (empty string if none)' },
		},
	},

	// Guest counts
	adults: { type: 'number', description: 'Number of adults' },
	children: { type: 'number', description: 'Number of children' },
	startDate: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
	endDate: { type: 'string', description: 'ISO date string YYYY-MM-DD' },

	// ERP
	couponCode: { type: 'string', description: 'Applied coupon code, null if none' },
	erpSyncStatus: { type: 'string', description: '"pending" | "synced" | "failed"' },

	// Timestamps
	createdAt: { type: 'string', description: 'ISO timestamp of creation' },
	updatedAt: { type: 'string', description: 'ISO timestamp of last update' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const bookingsSchema = { COLLECTION_NAME, FIELDS };
