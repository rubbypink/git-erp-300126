/**
 * @fileoverview Tours Schema Module — Defines Firestore field structure for tours collection.
 * Based on packages/shared/schemas/tours.md
 */

/** @type {string} */
export const COLLECTION_NAME = 'tours';

/**
 * Tour document field definitions.
 * Each entry: { type, required?, description }
 * @type {Object<string, {type: string, required?: boolean, description: string}>}
 */
export const FIELDS = {
	// Core fields
	id: { type: 'string', description: 'Custom ID "tour-phu-quoc-1"' },
	title: { type: 'string', required: true, description: 'Tour name/title (required)' },
	slug: { type: 'string', description: 'URL slug (unique)' },

	// Duration
	duration: { type: 'string', description: 'Duration string e.g. "3 ngày 2 đêm"' },
	durationDays: { type: 'number', description: 'Number of days' },

	// Location
	location: { type: 'string', description: 'City/region name' },
	address: { type: 'string', description: 'Meeting point address' },
	locationId: { type: 'string', description: 'Reference to locations collection' },
	departureCity: { type: 'string', description: 'Departure city (e.g. Hà Nội, TP.HCM)' },
	
	
	// Content
	description: { type: 'string', description: 'Full tour description (HTML)' },
	excerpt: { type: 'string', description: 'Short description, max 200 chars' },
	featuredImage: { type: 'string', description: 'Main photo URL' },
	gallery: { type: 'array', items: { type: 'string' }, description: 'All tour photo URLs' },
	faq: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } } }, description: 'FAQ items' },

	// Features
	highlights: { type: 'array', items: { type: 'string' }, description: 'Tour highlights' },
	included: { type: 'array', items: { type: 'string' }, description: 'What is included' },
	excluded: { type: 'array', items: { type: 'string' }, description: 'What is not included' },
	categories: { type: 'array', items: { type: 'string' }, description: 'Tour type categories' },
	tags: { type: 'array', items: { type: 'string' }, description: 'Tags/keywords' },

	// Itinerary
	itinerary: {
		type: 'array',
		description: 'Day-by-day itinerary',
		items: {
			type: 'object',
			properties: {
				day: { type: 'number', description: 'Day number' },
				title: { type: 'string', description: 'Day title' },
				description: { type: 'string', description: 'Day description (HTML)' },
				meals: { type: 'string', description: 'Meals included' },
				overnight: { type: 'string', description: 'Overnight location' },
			},
		},
	},

	// Pricing
	pricing: {
		type: 'object',
		description: 'Basic pricing info',
		properties: {
			basePrice: { type: 'number', description: 'Base price in VND' },
			adultPrice: { type: 'number', description: 'Adult price (VND)' },
			childPrice: { type: 'number', description: 'Child price (VND)' },
			infantPrice: { type: 'number', description: 'Infant price (VND)' },
			currency: { type: 'string', description: 'Currency code (default: VND)' },
			prepaid: { type: 'number', description: 'Percentage required as deposit (0-100). 0 = pay on arrival' },
			discountPercent: { type: 'number', description: 'Discount percentage (0-100)' },
		},
	},
	cancellationPolicy: { type: 'string', description: 'Cancellation policy text' },
	
	// Capacity
	capacity: { type: 'number', description: 'Maximum tour capacity' },
	availability: { type: 'number', description: 'Number of tour slots available for booking' },

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
	isFeatured: { type: 'boolean', description: 'Featured tour flag' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const toursSchema = { COLLECTION_NAME, FIELDS };
