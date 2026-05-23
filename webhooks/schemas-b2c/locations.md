# Location Schema

This document defines the structure of the Location document in the Firestore `locations` collection.

## Overview

- **Collection**: `locations`
- **Document ID**: Sequential number starting from 10000.

## Schema Definition

```javascript
/**
 * Location document in Firestore `locations` collection.
 * @typedef {Object} Location
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Location name (e.g., "Phú Quốc") */
  name: string,
  /** @type {string} URL-friendly slug (e.g., "phu-quoc") */
  slug: string,
  /** @type {string} "island" | "city" | "province" | "district" | "ward" */
  type: string,
  /** @type {string | null} Reference to parent location ID, null for top-level */
  parentId: string | null,
  /** @type {string} Cover image URL */
  image: string,
  /** @type {string} Short description */
  description: string,
  /** @type {string} "active" | "inactive" */
  status: string,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```
