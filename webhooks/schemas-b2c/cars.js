/**
 * @fileoverview Cars Schema — Field definitions for the Firestore `cars` collection.
 * Based on packages/shared/schemas/cars.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'cars';

/**
 * Car document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Custom ID "car-4-seat-city"' },
	name: { type: 'string', required: true, description: 'Car name (e.g., "Xe 4 chỗ thành phố")' },
	slug: { type: 'string', required: true, description: 'URL-friendly slug (e.g., "xe-4-cho-thanh-pho")' },
	type: { type: 'string', description: '"4-seat" | "7-seat" | "16-seat" | "29-seat"' },
	description: { type: 'string', description: 'Full description (HTML)' },
	excerpt: { type: 'string', description: 'Short description, max 200 chars' },
	featuredImage: { type: 'string', description: 'Main photo URL' },
	gallery: { type: 'array', items: { type: 'string' }, description: 'Gallery image URLs' },
	highlights: { type: 'array', items: { type: 'string' }, description: 'Top features' },
	included: { type: 'array', items: { type: 'string' }, description: 'What is included' },
	excluded: { type: 'array', items: { type: 'string' }, description: 'What is excluded' },
	categories: { type: 'array', items: { type: 'string' }, description: 'Car categories' },
	tags: { type: 'array', items: { type: 'string' }, description: 'Tags/keywords' },
	pricing: {
		type: 'object',
		description: 'Pricing information',
		properties: {
			basePrice: { type: 'number', description: 'Base price in VND' },
			adultPrice: { type: 'number', description: 'Price per adult' },
			childPrice: { type: 'number', description: 'Price per child' },
			currency: { type: 'string', description: '"VND" | "USD"' },
			prepaid: { type: 'number', description: 'Percentage required as deposit (0-100). 0 = pay on arrival' },
			discountPercent: { type: 'number', description: 'Discount percentage (0-100)' },
		},
	},
	capacity: { type: 'number', description: 'Maximum passenger capacity' },
	availability: { type: 'number', description: 'Number of cars available for booking' },
	rating: {
		type: 'object',
		description: 'Rating information',
		properties: {
			average: { type: 'number', description: 'Average rating 1-5' },
			count: { type: 'number', description: 'Number of reviews' },
		},
	},
	isFeatured: { type: 'boolean', description: 'Whether this car is featured on homepage' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const carsSchema = { COLLECTION_NAME, FIELDS };
