// DEPRECATED: Use tours.js instead (this file kept for reference only)
// /**
//  * @fileoverview Tour Schema Module — Defines extraction schemas, agent prompts, and Firestore mapping for tours.
//  * @module tour-schema
//  * @version 2.0.0
//  */
// 
// import { schemaToExtractSchema, schemaToListExtractSchema } from './schema-utils.mjs';
// 
// // ============================================================================
// // TOUR SCHEMA METADATA
// // ============================================================================
// 
// /**
//  * Tour schema metadata definitions per tours.schema.md v2.0.0
//  * @constant {Object<string, {type: string, required?: boolean, description: string}>}
//  */
// export const TOUR_SCHEMA = {
// 	// Core fields
// 	title: { type: 'string', required: true, description: 'Tour name/title (required)' },
// 	slug: { type: 'string', required: true, description: 'URL slug (unique)' },
// 
// 	// Duration
// 	duration: { type: 'string', description: 'Duration string e.g. 3 ngày 2 đêm' },
// 	durationDays: { type: 'number', description: 'Number of days' },
// 
// 	// Location
// 	location: { type: 'string', description: 'City/region name' },
// 	address: { type: 'string', description: 'Meeting point address' },
// 	locationId: { type: 'string', description: 'Reference to locations collection' },
// 
// 	// Content
// 	description: { type: 'string', description: 'Full tour description (HTML)' },
// 	excerpt: { type: 'string', description: 'Short description, max 200 chars' },
// 	featuredImage: { type: 'string', description: 'Main photo URL' },
// 	gallery: { type: 'array', items: { type: 'string' }, description: 'All tour photo URLs' },
// 
// 	// Features
// 	highlights: { type: 'array', items: { type: 'string' }, description: 'Tour highlights' },
// 	included: { type: 'array', items: { type: 'string' }, description: 'What is included' },
// 	excluded: { type: 'array', items: { type: 'string' }, description: 'What is not included' },
// 	categories: { type: 'array', items: { type: 'string' }, description: 'Tour type categories' },
// 	tags: { type: 'array', items: { type: 'string' }, description: 'Tags/keywords' },
// 
// 	// Itinerary
// 	itinerary: {
// 		type: 'array',
// 		description: 'Day-by-day itinerary',
// 		items: {
// 			type: 'object',
// 			properties: {
// 				day: { type: 'number', description: 'Day number' },
// 				title: { type: 'string', description: 'Day title' },
// 				description: { type: 'string', description: 'Day description (HTML)' },
// 				meals: { type: 'string', description: 'Meals included' },
// 				overnight: { type: 'string', description: 'Overnight location' },
// 				images: { type: 'array', items: { type: 'string' }, description: 'Day images' },
// 			},
// 		},
// 	},
// 
// 	// Map
// 	map: { type: 'object', description: 'Map coordinates', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
// 
// 	// Pricing (basic - detailed in tourPricing subcollection)
// 	pricing: {
// 		type: 'object',
// 		description: 'Basic pricing info',
// 		properties: {
// 			adultPrice: { type: 'number', description: 'Adult price (VND)' },
// 			childPrice: { type: 'number', description: 'Child price (VND)' },
// 			infantPrice: { type: 'number', description: 'Infant price (VND)' },
// 			currency: { type: 'string', description: 'Currency code' },
// 			minPeople: { type: 'number', description: 'Minimum people' },
// 			maxPeople: { type: 'number', description: 'Maximum people' },
// 			discountPercent: { type: 'number', description: 'Discount percent 0-100' },
// 		},
// 	},
// 
// 	// Policies
// 	cancellationPolicy: { type: 'string', description: 'Cancellation policy (HTML)' },
// 	childrenPolicy: { type: 'string', description: 'Children policy (HTML)' },
// 	notes: { type: 'array', items: { type: 'string' }, description: 'Important traveler notes' },
// 
// 	// FAQ
// 	faq: { type: 'array', description: 'FAQ items', items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } } } },
// 
// 	// Contact
// 	phone: { type: 'string', description: 'Phone number' },
// 	email: { type: 'string', description: 'Email address' },
// 	website: { type: 'string', description: 'Website URL - default: https://9tripphuquoc.com' },
// 
// 	// Reviews (embedded map)
// 	reviews: {
// 		type: 'map',
// 		description: 'Embedded reviews map',
// 		items: {
// 			type: 'object',
// 			properties: {
// 				id: { type: 'string' },
// 				reviewerName: { type: 'string' },
// 				reviewerAvatar: { type: 'string' },
// 				rating: { type: 'number' },
// 				text: { type: 'string' },
// 				date: { type: 'string' },
// 				country: { type: 'string' },
// 				sortOrder: { type: 'number' },
// 			},
// 		},
// 	},
// 
// 	// Meta
// 	isFeatured: { type: 'boolean', description: 'Featured tour flag' },
// 	status: { type: 'string', description: 'Status: active/inactive' },
// 	metaTitle: { type: 'string', description: 'SEO title' },
// 	metaDescription: { type: 'string', description: 'SEO description' },
// 	createdAt: { type: 'timestamp', required: true, description: 'Creation timestamp' },
// 	updatedAt: { type: 'timestamp', required: true, description: 'Last update timestamp' },
// };
// 
// /**
//  * Required tour fields for validation
//  * @constant {string[]}
//  */
// export const TOUR_REQUIRED_FIELDS = ['title', 'slug'];
// 
// // ============================================================================
// // TOUR PRICING SCHEMA (for subcollection)
// // ============================================================================
// 
// /**
//  * Tour pricing tier schema for tourPricing subcollection
//  * @constant {Object}
//  */
// export const TOUR_PRICING_SCHEMA = {
// 	type: 'object',
// 	properties: {
// 		id: { type: 'string', description: 'Price tier ID' },
// 		name: { type: 'string', description: 'Package name e.g. Tour ghép, Tour riêng' },
// 		description: { type: 'string', description: 'Package description' },
// 		isFeatured: { type: 'boolean', description: 'Featured tier flag' },
// 		adultPrice: { type: 'number', description: 'Adult price (VND)' },
// 		childPrice: { type: 'number', description: 'Child price (VND, 0 if free)' },
// 		infantPrice: { type: 'number', description: 'Infant price (VND, 0 if free)' },
// 		currency: { type: 'string', description: 'Currency code (default: VND)' },
// 		minPeople: { type: 'number', description: 'Minimum people' },
// 		maxPeople: { type: 'number', description: 'Maximum people' },
// 		included: { type: 'array', items: { type: 'string' }, description: 'Included items' },
// 		isActive: { type: 'boolean', description: 'Active status' },
// 		sortOrder: { type: 'number', description: 'Display order' },
// 		createdAt: { type: 'string', description: 'Creation timestamp' },
// 		updatedAt: { type: 'string', description: 'Last update timestamp' },
// 	},
// 	required: ['name'],
// };
// 
// // ============================================================================
// // FIRECRAWL EXTRACTION SCHEMA
// // ============================================================================
// 
// /**
//  * JSON Schema for Firecrawl tour detail extraction
//  * Generated from TOUR_SCHEMA
//  * @constant {Object}
//  */
// export const TOUR_EXTRACT_SCHEMA = { ...schemaToExtractSchema(TOUR_SCHEMA), required: ['title'] };
// 
// /**
//  * Simplified flat schema for extract() API — optimized for LLM-powered extraction.
//  * Uses flat properties (no deep nesting) to work reliably with the extract endpoint.
//  * Costs ~5-15 credits vs 100-500 for the full agent schema.
//  *
//  * @constant {Object}
//  */
// export const TOUR_EXTRACT_SCHEMA_FLAT = {
// 	type: 'object',
// 	properties: {
// 		title: { type: 'string', description: 'Tour name/title (required)' },
// 		duration: { type: 'string', description: 'Duration e.g. "3 ngày 2 đêm"' },
// 		durationDays: { type: 'number', description: 'Number of days' },
// 		location: { type: 'string', description: 'City/region name' },
// 		address: { type: 'string', description: 'Meeting point address' },
// 		departureCity: { type: 'string', description: 'Departure city (e.g. Hà Nội, TP.HCM)' },
// 		description: { type: 'string', description: 'Full tour description (HTML ok)' },
// 		excerpt: { type: 'string', description: 'Short description max 200 chars' },
// 		featuredImage: { type: 'string', description: 'Main photo URL (full absolute)' },
// 		gallery: { type: 'array', items: { type: 'string' }, description: 'ALL photo URLs (absolute, deduplicated)' },
// 		highlights: { type: 'array', items: { type: 'string' }, description: 'Top features' },
// 		included: { type: 'array', items: { type: 'string' }, description: 'What is included' },
// 		excluded: { type: 'array', items: { type: 'string' }, description: 'What is not included' },
// 		categories: { type: 'array', items: { type: 'string' }, description: 'Tour type categories' },
// 		itinerary: { type: 'array', description: 'Day-by-day itinerary', items: { type: 'object', properties: { day: { type: 'number' }, title: { type: 'string' }, description: { type: 'string' }, meals: { type: 'string' } } } },
// 		adultPrice: { type: 'number', description: 'Adult price in VND' },
// 		childPrice: { type: 'number', description: 'Child price in VND' },
// 		currency: { type: 'string', description: 'Currency code (default: VND)' },
// 		cancellationPolicy: { type: 'string', description: 'Cancellation policy text' },
// 		childrenPolicy: { type: 'string', description: 'Children policy text' },
// 		notes: { type: 'array', items: { type: 'string' }, description: 'Important traveler notes' },
// 		faq: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } } }, description: 'FAQ items' },
// 		phone: { type: 'string', description: 'Phone number' },
// 		email: { type: 'string', description: 'Email address' },
// 		website: { type: 'string', description: 'Website URL' },
// 	},
// 	required: ['title'],
// };
// 
// /**
//  * Schema metadata for list page items
//  * @constant {Object}
//  */
// const TOUR_LIST_ITEM_SCHEMA = {
// 	title: { type: 'string', description: 'Tour name' },
// 	url: { type: 'string', description: 'Full absolute URL to tour detail page' },
// 	price: { type: 'number', description: 'Starting price' },
// 	duration: { type: 'string', description: 'Tour duration' },
// 	image: { type: 'string', description: 'Thumbnail URL' },
// 	category: { type: 'string', description: 'Tour category' },
// };
// 
// /**
//  * JSON Schema for Firecrawl tour list page extraction
//  * Generated from TOUR_LIST_ITEM_SCHEMA
//  * @constant {Object}
//  */
// export const TOUR_LIST_EXTRACT_SCHEMA = schemaToListExtractSchema(TOUR_LIST_ITEM_SCHEMA, 'tours', { requiredFields: ['title', 'url'] });
// 
// // ============================================================================
// // UTILITY FUNCTIONS
// // ============================================================================
// 
// /**
//  * Vietnamese diacritics map for slug generation
//  * @constant {Object<string, string>}
//  */
// const VIETNAMESE_DIACRITICS_MAP = {
// 	à: 'a',
// 	á: 'a',
// 	ả: 'a',
// 	ã: 'a',
// 	ạ: 'a',
// 	ă: 'a',
// 	ằ: 'a',
// 	ắ: 'a',
// 	ẳ: 'a',
// 	ẵ: 'a',
// 	ặ: 'a',
// 	â: 'a',
// 	ầ: 'a',
// 	ấ: 'a',
// 	ẩ: 'a',
// 	ẫ: 'a',
// 	ậ: 'a',
// 	đ: 'd',
// 	è: 'e',
// 	é: 'e',
// 	ẻ: 'e',
// 	ẽ: 'e',
// 	ẹ: 'e',
// 	ê: 'e',
// 	ề: 'e',
// 	ế: 'e',
// 	ể: 'e',
// 	ễ: 'e',
// 	ệ: 'e',
// 	ì: 'i',
// 	í: 'i',
// 	ỉ: 'i',
// 	ĩ: 'i',
// 	ị: 'i',
// 	ò: 'o',
// 	ó: 'o',
// 	ỏ: 'o',
// 	õ: 'o',
// 	ọ: 'o',
// 	ô: 'o',
// 	ồ: 'o',
// 	ố: 'o',
// 	ổ: 'o',
// 	ỗ: 'o',
// 	ộ: 'o',
// 	ơ: 'o',
// 	ờ: 'o',
// 	ớ: 'o',
// 	ở: 'o',
// 	ỡ: 'o',
// 	ợ: 'o',
// 	ù: 'u',
// 	ú: 'u',
// 	ủ: 'u',
// 	ũ: 'u',
// 	ụ: 'u',
// 	ư: 'u',
// 	ừ: 'u',
// 	ứ: 'u',
// 	ử: 'u',
// 	ữ: 'u',
// 	ự: 'u',
// 	y: 'y',
// 	ỳ: 'y',
// 	ý: 'y',
// 	ỷ: 'y',
// 	ỹ: 'y',
// 	ỵ: 'y',
// 	À: 'A',
// 	Á: 'A',
// 	Ả: 'A',
// 	Ã: 'A',
// 	Ạ: 'A',
// 	Ă: 'A',
// 	Ằ: 'A',
// 	Ắ: 'A',
// 	Ẳ: 'A',
// 	Ẵ: 'A',
// 	Ặ: 'A',
// 	Â: 'A',
// 	Ầ: 'A',
// 	Ấ: 'A',
// 	Ẩ: 'A',
// 	Ẫ: 'A',
// 	Ậ: 'A',
// 	Đ: 'D',
// 	È: 'E',
// 	É: 'E',
// 	Ẻ: 'E',
// 	Ẽ: 'E',
// 	Ẹ: 'E',
// 	Ê: 'E',
// 	Ề: 'E',
// 	Ế: 'E',
// 	Ể: 'E',
// 	Ễ: 'E',
// 	Ệ: 'E',
// 	Ì: 'I',
// 	Í: 'I',
// 	Ỉ: 'I',
// 	Ĩ: 'I',
// 	Ị: 'I',
// 	Ò: 'O',
// 	Ó: 'O',
// 	Ỏ: 'O',
// 	Õ: 'O',
// 	Ọ: 'O',
// 	Ô: 'O',
// 	Ồ: 'O',
// 	Ố: 'O',
// 	Ổ: 'O',
// 	Ỗ: 'O',
// 	Ộ: 'O',
// 	Ơ: 'O',
// 	Ờ: 'O',
// 	Ớ: 'O',
// 	Ở: 'O',
// 	Ỡ: 'O',
// 	Ợ: 'O',
// 	Ù: 'U',
// 	Ú: 'U',
// 	Ủ: 'U',
// 	Ũ: 'U',
// 	Ụ: 'U',
// 	Ư: 'U',
// 	Ừ: 'U',
// 	Ứ: 'U',
// 	Ử: 'U',
// 	Ữ: 'U',
// 	Ự: 'U',
// 	Y: 'Y',
// 	Ỳ: 'Y',
// 	Ý: 'Y',
// 	Ỷ: 'Y',
// 	Ỹ: 'Y',
// 	Ỵ: 'Y',
// };
// 
// /**
//  * Generate URL-friendly slug from text with Vietnamese diacritics support
//  * @param {string} text - Input text
//  * @returns {string} URL-friendly slug
//  */
// export function generateSlug(text) {
// 	if (!text || typeof text !== 'string') return '';
// 
// 	return text
// 		.toString()
// 		.trim()
// 		.split('')
// 		.map((char) => VIETNAMESE_DIACRITICS_MAP[char] || char)
// 		.join('')
// 		.toLowerCase()
// 		.replace(/[^a-z0-9\s-]/g, '')
// 		.replace(/\s+/g, '-')
// 		.replace(/-+/g, '-')
// 		.replace(/^-|-$/g, '');
// }
// 
// /**
//  * Generate review key from reviewer name and date
//  * @param {Object} review - Review object
//  * @param {number} index - Review index
//  * @returns {string} Review key
//  */
// function generateReviewKey(review, index) {
// 	const nameSlug = generateSlug(review.reviewerName || 'anonymous');
// 	const dateSlug = generateSlug(review.date || '');
// 	return `review_${nameSlug}${dateSlug ? '-' + dateSlug : ''}-${index}`;
// }
// 
// // ============================================================================
// // FIRESTORE MAPPING
// // ============================================================================
// 
// /**
//  * Map raw scraped tour data to Firestore document structure per tours.schema.md v2.0.0
//  * Returns both tour data and pricing tiers for subcollection
//  * @param {Object} rawData - Raw scraped data from Firecrawl
//  * @returns {{tourData: Object, pricingTiers: Array}} Firestore-ready objects
//  */
// export function MAP_TO_FIRESTORE(rawData) {
// 	if (!rawData || typeof rawData !== 'object') {
// 		throw new Error('Invalid raw data: expected object');
// 	}
// 
// 	// Generate slug from title
// 	const slug = rawData.slug || generateSlug(rawData.title);
// 
// 	// Extract gallery URLs and normalize
// 	const gallery = (rawData.gallery || []).map((url) => (typeof url === 'string' ? url.replace(/\/max\d+(?:x\d+)?\//i, '/max1024x768/') : '')).filter(Boolean);
// 
// 	// Map reviews to embedded Map object
// 	const reviewsMap = {};
// 	(rawData.reviews || []).slice(0, 10).forEach((review, index) => {
// 		const key = generateReviewKey(review, index);
// 		reviewsMap[key] = {
// 			id: key,
// 			reviewerName: review.reviewerName || '',
// 			reviewerAvatar: review.reviewerAvatar || '',
// 			rating: review.rating || 0,
// 			text: review.text || '',
// 			date: review.date || '',
// 			country: review.country || '',
// 			sortOrder: index + 1,
// 		};
// 	});
// 
// 	// Build tags from categories, location, duration
// 	const tags = Array.isArray(rawData.tags) ? [...rawData.tags] : [];
// 	if (rawData.location) tags.push(rawData.location);
// 	if (rawData.duration) tags.push(rawData.duration);
// 	if (rawData.categories) tags.push(...rawData.categories);
// 
// 	// Build pricing tiers for subcollection (if multiple tiers exist)
// 	const pricingTiers = [];
// 	if (rawData.pricing) {
// 		// Default tier from main pricing
// 		const defaultTier = {
// 			id: `tier_${slug}_default`,
// 			name: 'Tour ghép',
// 			description: 'Tour ghép đoàn tiêu chuẩn',
// 			isFeatured: true,
// 			adultPrice: rawData.pricing.adultPrice || 0,
// 			childPrice: rawData.pricing.childPrice || 0,
// 			infantPrice: rawData.pricing.infantPrice || 0,
// 			currency: rawData.pricing.currency || 'VND',
// 			minPeople: rawData.pricing.minPeople || 1,
// 			maxPeople: rawData.pricing.maxPeople || 20,
// 			included: Array.isArray(rawData.included) ? rawData.included : [],
// 			isActive: true,
// 			sortOrder: 1,
// 			createdAt: new Date().toISOString(),
// 			updatedAt: new Date().toISOString(),
// 		};
// 		pricingTiers.push(defaultTier);
// 
// 		// Private tour tier if maxPeople is small
// 		if (rawData.pricing.maxPeople && rawData.pricing.maxPeople <= 8) {
// 			const privateTier = {
// 				id: `tier_${slug}_private`,
// 				name: 'Tour riêng',
// 				description: 'Tour riêng cho nhóm nhỏ',
// 				isFeatured: false,
// 				adultPrice: Math.round((rawData.pricing.adultPrice || 0) * 1.3),
// 				childPrice: rawData.pricing.childPrice || 0,
// 				infantPrice: rawData.pricing.infantPrice || 0,
// 				currency: rawData.pricing.currency || 'VND',
// 				minPeople: 1,
// 				maxPeople: rawData.pricing.maxPeople,
// 				included: Array.isArray(rawData.included) ? rawData.included : [],
// 				isActive: true,
// 				sortOrder: 2,
// 				createdAt: new Date().toISOString(),
// 				updatedAt: new Date().toISOString(),
// 			};
// 			pricingTiers.push(privateTier);
// 		}
// 	}
// 
// 	// Map itinerary
// 	const itinerary = (rawData.itinerary || []).map((day, index) => ({
// 		day: day.day || index + 1,
// 		title: day.title || `Ngày ${day.day || index + 1}`,
// 		description: day.description || '',
// 		meals: day.meals || '',
// 		overnight: day.overnight || '',
// 		images: Array.isArray(day.images) ? day.images : [],
// 	}));
// 
// 	// Build tour document
// 	const tourData = {
// 		// Core
// 		title: rawData.title || '',
// 		slug,
// 
// 		// Duration
// 		duration: rawData.duration || '',
// 		durationDays: rawData.durationDays || null,
// 
// 		// Location
// 		location: rawData.location || '',
// 		address: rawData.address || '',
// 
// 		// Content
// 		description: rawData.description || '',
// 		excerpt: rawData.excerpt || rawData.description?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
// 		featuredImage: rawData.featuredImage || gallery[0] || '',
// 		gallery: [...new Set(gallery)].slice(0, 30),
// 
// 		// Features
// 		highlights: Array.isArray(rawData.highlights) ? rawData.highlights : [],
// 		included: Array.isArray(rawData.included) ? rawData.included : [],
// 		excluded: Array.isArray(rawData.excluded) ? rawData.excluded : [],
// 		categories: Array.isArray(rawData.categories) ? rawData.categories : [],
// 		tags: [...new Set(tags)],
// 
// 		// Itinerary
// 		itinerary,
// 
// 		// Map
// 		map: rawData.map || null,
// 
// 		// Basic pricing (ERP sync fields)
// 		pricing: {
// 			adultPrice: rawData.pricing?.adultPrice || null,
// 			childPrice: rawData.pricing?.childPrice || null,
// 			infantPrice: rawData.pricing?.infantPrice || null,
// 			currency: rawData.pricing?.currency || 'VND',
// 			minPeople: rawData.pricing?.minPeople || null,
// 			maxPeople: rawData.pricing?.maxPeople || null,
// 			discountPercent: rawData.pricing?.discountPercent || 0,
// 		},
// 
// 		// Policies
// 		cancellationPolicy: rawData.cancellationPolicy || '',
// 		childrenPolicy: rawData.childrenPolicy || '',
// 		notes: Array.isArray(rawData.notes) ? rawData.notes : [],
// 
// 		// FAQ
// 		faq: Array.isArray(rawData.faq) ? rawData.faq : [],
// 
// 		// Contact
// 		phone: rawData.phone || '',
// 		email: rawData.email || '',
// 		website: rawData.website || '',
// 
// 		// Reviews
// 		reviews: reviewsMap,
// 
// 		// Meta
// 		isFeatured: rawData.isFeatured || false,
// 		status: rawData.status || 'active',
// 
// 		// Timestamps
// 		createdAt: rawData.createdAt || new Date().toISOString(),
// 		updatedAt: rawData.updatedAt || new Date().toISOString(),
// 
// 		// Internal tracking
// 		_firecrawlCredits: rawData._firecrawlCredits || 0,
// 	};
// 
// 	return { tourData, pricingTiers };
// }
// 
// // Alias export for convenience
// export { MAP_TO_FIRESTORE as mapTourToFirestore };
// 
// // [DEAD CODE] Default export — never imported as default by any skill
// // export default {
// // 	TOUR_SCHEMA,
// // 	TOUR_REQUIRED_FIELDS,
// // 	TOUR_EXTRACT_SCHEMA,
// // 	TOUR_EXTRACT_SCHEMA_FLAT,
// // 	TOUR_LIST_EXTRACT_SCHEMA,
// // 	TOUR_PRICING_SCHEMA,
// // 	TOUR_AGENT_PROMPT,
// // 	MAP_TO_FIRESTORE,
// // 	mapTourToFirestore: MAP_TO_FIRESTORE,
// // 	generateSlug,
// // };
