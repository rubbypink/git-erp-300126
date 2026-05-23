/**
 * @fileoverview Blogs Schema — Field definitions for the Firestore `blogs` collection.
 * Based on packages/shared/schemas/blogs.md
 */

/** @type {string} Firestore collection name */
export const COLLECTION_NAME = 'blogs';

/**
 * Blog document field definitions.
 * Each entry: { type, required?, description, properties? (for objects), items? (for arrays) }
 * @type {Object<string, {type: string, required?: boolean, description: string, properties?: Object, items?: Object}>}
 */
export const FIELDS = {
	id: { type: 'string', required: true, description: 'Sequential ID "10000", "10001", etc.' },
	title: { type: 'string', required: true, description: 'Blog post title' },
	slug: { type: 'string', required: true, description: 'URL-friendly slug (e.g., "top-10-beaches-phu-quoc")' },
	excerpt: { type: 'string', description: 'Short summary of the post' },
	content: { type: 'string', description: 'Full HTML content' },
	featuredImage: { type: 'string', description: 'Featured image URL' },
	gallery: { type: 'array', items: { type: 'string' }, description: 'Array of gallery image URLs' },
	author: { type: 'string', description: 'Author name' },
	category: { type: 'string', description: 'Category name' },
	tags: { type: 'array', items: { type: 'string' }, description: 'Array of tag strings' },
	isPublished: { type: 'boolean', description: 'Whether the post is published' },
	publishedAt: { type: 'string', description: 'ISO timestamp of when the post was published, null if draft' },
	createdAt: { type: 'string', description: 'ISO timestamp' },
	updatedAt: { type: 'string', description: 'ISO timestamp' },
};

export default FIELDS;

/** @type {{ COLLECTION_NAME: string, FIELDS: Object }} */
export const blogsSchema = { COLLECTION_NAME, FIELDS };
