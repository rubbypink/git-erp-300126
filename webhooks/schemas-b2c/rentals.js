/**
 * @fileoverview Rentals Schema — Field definitions for the Firestore `rentals` collection.
 * Based on packages/shared/schemas/rentals.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'rentals';

/**
 * Rental document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Custom ID "rental-villa-phu-quoc"' },
	name: { type: 'string', required: true, description: 'Rental name (e.g., "Villa Phú Quốc")' },
	slug: { type: 'string', required: true, description: 'URL-friendly slug (e.g., "villa-phu-quoc")' },
	type: { type: 'string', description: '"villa" | "apartment" | "house" | "resort"' },
	description: { type: 'string', description: 'Full description (HTML)' },
	excerpt: { type: 'string', description: 'Short description, max 200 chars' },
	featuredImage: { type: 'string', description: 'Main photo URL' },
	gallery: { type: 'array', items: { type: 'string' }, description: 'Gallery image URLs' },
	location: { type: 'string', description: 'City/region name' },
	locationId: { type: 'string', description: 'Reference to locations collection' },
	address: {
		type: 'object',
		description: 'Full address details',
		properties: {
			street: { type: 'string', description: 'Street address' },
			city: { type: 'string', description: 'City name' },
			cityId: { type: 'string', description: 'Reference to locations collection' },
			country: { type: 'string', description: 'Country name' },
		},
	},
	amenities: { type: 'array', items: { type: 'string' }, description: 'Rental amenities/facilities' },
	highlights: { type: 'array', items: { type: 'string' }, description: 'Top features' },
	included: { type: 'array', items: { type: 'string' }, description: 'What is included' },
	excluded: { type: 'array', items: { type: 'string' }, description: 'What is excluded' },
	tags: { type: 'array', items: { type: 'string' }, description: 'Tags/keywords' },
	pricing: {
		type: 'object',
		description: 'Pricing information',
		properties: {
			basePrice: { type: 'number', description: 'Base price per night in VND' },
			adultPrice: { type: 'number', description: 'Price per adult per night' },
			childPrice: { type: 'number', description: 'Price per child per night' },
			currency: { type: 'string', description: '"VND" | "USD"' },
			prepaid: { type: 'number', description: 'Percentage required as deposit (0-100). 0 = pay on arrival' },
			discountPercent: { type: 'number', description: 'Discount percentage (0-100)' },
		},
	},
	bedrooms: { type: 'number', description: 'Number of bedrooms' },
	bathrooms: { type: 'number', description: 'Number of bathrooms' },
	maxGuests: { type: 'number', description: 'Maximum number of guests' },
	capacity: { type: 'number', description: 'Maximum capacity' },
	availability: { type: 'number', description: 'Number of units available for booking' },
	rating: {
		type: 'object',
		description: 'Rating information',
		properties: {
			average: { type: 'number', description: 'Average rating 1-5' },
			count: { type: 'number', description: 'Number of reviews' },
		},
	},
	isFeatured: { type: 'boolean', description: 'Whether this rental is featured on homepage' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const rentalsSchema = { COLLECTION_NAME, FIELDS };
