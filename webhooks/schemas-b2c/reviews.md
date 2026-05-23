# Review Schema

This document defines the structure of the Review document in the Firestore `reviews` collection.

## Overview

- **Collection**: `reviews`
- **Document ID**: Sequential number starting from 10000 (e.g., "10000", "10001").

## Schema Definition

```javascript
/**
 * Review document in Firestore `reviews` collection.
 * @typedef {Object} Review
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Reference to the service being reviewed */
  serviceId: string,
  /** @type {string} "hotel" | "tour" | "activity" | "car" | "rental" */
  serviceType: string,
  /** @type {string} Reference to users collection document ID */
  userId: string,
  /** @type {string} Display name of the reviewer */
  userName: string,
  /** @type {string} Avatar URL of the reviewer */
  userAvatar: string,
  /** @type {number} Rating from 1 to 10 */
  rating: number,
  /** @type {string} Review title */
  title: string,
  /** @type {string} Review content */
  content: string,
  /** @type {Array<string>} Array of image URLs */
  images: Array<string>,
  /** @type {string} "approved" | "pending" | "rejected" */
  status: string,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```
