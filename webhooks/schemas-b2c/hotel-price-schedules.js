/**
 * @fileoverview Hotel Price Schedules Schema Module — Defines Firestore field structure for hotel_price_schedules collection.
 * Based on packages/shared/schemas/hotel-price-schedules.md
 */

/** @type {string} */
export const COLLECTION_NAME = 'hotel_price_schedules';

/**
 * Hotel Price Schedule document field definitions.
 * Each entry: { type, required?, description }
 * @type {Object<string, {type: string, required?: boolean, description: string}>}
 */
export const FIELDS = {
	// Core fields
	id: { type: 'string', description: 'Document ID "{hotelId}_base_{year}"' },

	// Schedule metadata
	info: {
		type: 'object',
		description: 'Schedule metadata',
		properties: {
			hotelId: { type: 'string', description: 'Reference to hotels collection document ID' },
			year: { type: 'number', description: 'Year this schedule applies to (e.g., 2026)' },
			status: { type: 'string', description: '"active" | "inactive" | "expired"' },
			createdAt: { type: 'string', description: 'ISO timestamp' },
			updatedAt: { type: 'string', description: 'ISO timestamp' },
		},
	},

	// Price data map
	priceData: {
		type: 'map',
		description: 'Map of pricing entries keyed by "{roomId}_{rateType}"',
		items: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					startDate: { type: 'string', description: 'ISO date string YYYY-MM-DD - period start' },
					endDate: { type: 'string', description: 'ISO date string YYYY-MM-DD - period end' },
					costPrice: { type: 'number', description: 'Cost price (what the supplier charges) in VND' },
					sellPrice: { type: 'number', description: 'Selling price to customer in VND' },
					supplier: { type: 'string', description: 'Supplier/vendor name' },
					prepaid: { type: 'number', description: 'Percentage required as deposit (0-100). 0 = pay on arrival' },
					periodKey: { type: 'string', description: 'Period identifier (e.g., "peak", "normal", "low")' },
				},
			},
		},
	},
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const hotelPriceSchedulesSchema = { COLLECTION_NAME, FIELDS };
