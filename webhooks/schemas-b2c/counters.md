# Counter Schema

This document defines the structure of the Counter document in the Firestore `counters` collection.

## Overview

- **Collection**: `counters`
- **Document ID**: Collection name (e.g., `bookings`, `hotels`, `reviews`).

## Usage

Used by `generateNextId()` for atomic sequential ID generation across all collections.

## Schema Definition

```javascript
/**
 * Counter document in Firestore `counters` collection.
 * @typedef {Object} Counter
 */
{
  /** @type {string} Collection name as document ID (e.g., "bookings") */
  id: string,
  /** @type {number} Auto-incrementing sequence number starting at 10000 */
  seq: number
}
```
