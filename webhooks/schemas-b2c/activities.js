/**
 * @fileoverview Activities Schema Module — Defines Firestore field structure for activities collection.
 * Based on packages/shared/schemas/activities.md
 */

/** @type {string} */
export const COLLECTION_NAME = 'activities';

/**
 * Activity document field definitions.
 * Each entry: { type, required?, description }
 * @type {Object<string, {type: string, required?: boolean, description: string}>}
 */
export const FIELDS = {
	// Core fields
	id: { type: 'string', description: 'Custom ID "act-hoi-an-cooking"' },
	slug: { type: 'string', description: 'URL slug (unique)' },
	title: { type: 'string', required: true, description: 'Activity name/title (required)' },

	// Duration
	duration: { type: 'string', description: 'Duration e.g. "1/2 ngày", "1 ngày"' },
	durationDetail: { type: 'string', description: 'Detailed duration e.g. "Khoảng 20 phút"' },

	// Location
	location: { type: 'string', description: 'City/region name' },
	locationId: { type: 'string', description: 'Reference to locations collection' },
	locationDetail: { type: 'string', description: 'Specific address' },

	// Schedule
	openingHours: { type: 'string', description: 'Opening hours / show times' },
	capacity: { type: 'number', description: 'Maximum participants' },
	availability: { type: 'number', description: 'Number of activity slots available for booking' },

	// Content
	excerpt: { type: 'string', description: 'Short description' },
	description: { type: 'string', description: 'Full description (HTML)' },
	featuredImage: { type: 'string', description: 'Main photo URL' },
	gallery: { type: 'array', items: { type: 'string' }, description: 'Gallery image URLs' },

	// Features
	highlights: { type: 'array', items: { type: 'string' }, description: 'Top features' },
	included: { type: 'array', items: { type: 'string' }, description: 'What is included' },
	excluded: { type: 'array', items: { type: 'string' }, description: 'What is excluded' },
	categories: { type: 'array', items: { type: 'string' }, description: 'Activity categories' },
	tags: { type: 'array', items: { type: 'string' }, description: 'Tags/keywords' },

	// Pricing
	pricing: {
		type: 'object',
		description: 'Pricing with basePrice and tiers array',
		properties: {
			basePrice: { type: 'number', description: 'Lowest adult price for filter/sort (VND)' },
			adultPrice: { type: 'number', description: 'Default adult price (VND)' },
			childPrice: { type: 'number', description: 'Default child price (VND)' },
			infantPrice: { type: 'number', description: 'Default infant price (VND)' },
			currency: { type: 'string', description: 'Currency code (default: VND)' },
			prepaid: { type: 'number', description: 'Percentage required as deposit (0-100). 0 = pay on arrival' },
			discountPercent: { type: 'number', description: 'Discount percentage (0-100)' },
			tiers: {
				type: 'array',
				description: 'Pricing tiers',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string', description: 'Price ID (unique within activity)' },
						name: { type: 'string', description: 'Package/tier name' },
						description: { type: 'string', description: 'Tier description' },
						adultPrice: { type: 'number', description: 'Adult price (VND)' },
						childPrice: { type: 'number', description: 'Child price (VND, 0 if free)' },
						currency: { type: 'string', description: 'Currency code' },
						discountPercent: { type: 'number', description: 'Discount percent 0-100' },
						included: { type: 'array', items: { type: 'string' }, description: 'Included items' },
					},
				},
			},
		},
	},

	// Rating
	rating: {
		type: 'object',
		description: 'Rating information',
		properties: {
			average: { type: 'number', description: 'Average rating 1-10' },
			count: { type: 'number', description: 'Number of reviews' },
		},
	},

	// Meta
	isFeatured: { type: 'boolean', description: 'Featured activity flag' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const activitiesSchema = { COLLECTION_NAME, FIELDS };
