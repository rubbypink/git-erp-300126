# Blog Schema

This document defines the structure of the Blog document in the Firestore `blogs` collection.

## Overview

- **Collection**: `blogs`
- **Document ID**: Sequential number starting from 10000 (e.g., "10000", "10001").

## Schema Definition

```javascript
/**
 * Blog document in Firestore `blogs` collection.
 * @typedef {Object} Blog
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Blog post title */
  title: string,
  /** @type {string} URL-friendly slug (e.g., "top-10-beaches-phu-quoc") */
  slug: string,
  /** @type {string} Short summary of the post */
  excerpt: string,
  /** @type {string} Full HTML content */
  content: string,
  /** @type {string} Featured image URL */
  featuredImage: string,
  /** @type {Array<string>} Array of gallery image URLs */
  gallery: Array<string>,
  /** @type {string} Author name */
  author: string,
  /** @type {string} Category name */
  category: string,
  /** @type {Array<string>} Array of tag strings */
  tags: Array<string>,
  /** @type {boolean} Whether the post is published */
  isPublished: boolean,
  /** @type {string | null} ISO timestamp of when the post was published, null if draft */
  publishedAt: string | null,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```
