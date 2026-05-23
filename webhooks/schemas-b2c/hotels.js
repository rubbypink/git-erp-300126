/**
 * @fileoverview Hotels Schema — Field definitions for the Firestore `hotels` collection.
 * Based on hotels.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'hotels';

/**
 * Hotel document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	// Core fields
	id: { type: 'string', required: true, description: 'Custom document ID e.g. hotel-phu-quoc-1' },
	name: { type: 'string', required: true, description: 'Hotel name (required)' },
	slug: { type: 'string', required: true, description: 'URL-friendly slug (unique)' },
	starRating: { type: 'number', description: 'Star rating 1-5' },

	// Address
	address: {
		type: 'object',
		description: 'Address information',
		properties: {
			street: { type: 'string', description: 'Street address' },
			city: { type: 'string', description: 'City name' },
			cityId: { type: 'string', description: 'Reference to locations collection' },
			country: { type: 'string', description: 'Country name' },
		},
	},

	// Pricing
	pricing: {
		type: 'object',
		description: 'Basic pricing info',
		properties: {
			basePrice: { type: 'number', description: 'Base price in VND' },
			currency: { type: 'string', description: 'Currency code (default: VND)' },
			prepaid: { type: 'number', description: 'Percentage required as deposit (0-100). 0 = pay on arrival' },
		},
	},

	// Content
	description: { type: 'string', description: 'Full hotel description (HTML)' },
	excerpt: { type: 'string', description: 'Short description, max 200 chars' },
	featuredImage: { type: 'string', description: 'Main photo URL' },
	gallery: { type: 'array', items: { type: 'string' }, description: 'Gallery image URLs' },

	// Features
	amenities: { type: 'array', items: { type: 'string' }, description: 'Hotel facilities' },
	highlights: { type: 'array', items: { type: 'string' }, description: 'Top features' },
	tags: { type: 'array', items: { type: 'string' }, description: 'Tags like resort, sea-view, pool' },

	// Ratings
	rating: {
		type: 'object',
		description: 'Guest rating info',
		properties: {
			average: { type: 'number', description: 'Average guest rating 1-10' },
			count: { type: 'number', description: 'Number of reviews' },
		},
	},

	// Policies
	policies: {
		type: 'object',
		description: 'Hotel policies',
		properties: {
			checkIn: { type: 'string', description: 'Check-in time e.g. 14:00' },
			checkOut: { type: 'string', description: 'Check-out time e.g. 12:00' },
			cancellation: { type: 'string', description: 'Cancellation policy (HTML)' },
			children: { type: 'string', description: 'Children policy (HTML)' },
			pets: { type: 'string', description: 'Pets policy (HTML)' },
			taxes: { type: 'string', description: 'Taxes & fees (HTML)' },
			notes: { type: 'string', description: 'Additional notes (HTML)' },
		},
	},

	// Map coordinates
	map: {
		type: 'object',
		description: 'Map coordinates',
		properties: {
			lat: { type: 'number', description: 'Latitude' },
			lng: { type: 'number', description: 'Longitude' },
		},
	},

	// Contact
	phone: { type: 'string', description: 'Phone number' },
	email: { type: 'string', description: 'Email address' },
	website: { type: 'string', description: 'Website URL' },

	// Rooms (embedded array)
	rooms: {
		type: 'array',
		description: 'Embedded array of room objects',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Room ID (unique within hotel)' },
				name: { type: 'string', required: true, description: 'Room type name (required)' },
				slug: { type: 'string', description: 'URL slug (unique within hotel)' },
				description: { type: 'string', description: 'Room description (HTML)' },
				featuredImage: { type: 'string', description: 'Room featured image URL' },
				gallery: { type: 'array', items: { type: 'string' }, description: 'Room gallery URLs' },
				bedType: { type: 'string', description: 'Bed type e.g. 1 giường King' },
				maxAdults: { type: 'number', description: 'Maximum adults' },
				maxChildren: { type: 'number', description: 'Maximum children' },
				maxGuests: { type: 'number', description: 'Total maximum guests' },
				roomSize: { type: 'number', description: 'Room size in m²' },
				amenities: { type: 'array', items: { type: 'string' }, description: 'Room amenities' },
				included: { type: 'array', items: { type: 'string' }, description: 'Included items' },
				totalRooms: { type: 'number', description: 'Total physical rooms of this type' },
				availability: { type: 'number', description: 'Number of rooms available for booking' },
				isActive: { type: 'boolean', description: 'Active status' },
				sortOrder: { type: 'number', description: 'Display order' },
			},
		},
	},

	// Flags
	isFeatured: { type: 'boolean', description: 'Featured hotel flag' },

	// Timestamps
	createdAt: { type: 'string', description: 'ISO timestamp of creation' },
	updatedAt: { type: 'string', description: 'ISO timestamp of last update' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const hotelsSchema = { COLLECTION_NAME, FIELDS };
