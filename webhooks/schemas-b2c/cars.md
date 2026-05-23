# Car Schema

This document defines the structure of the Car document in the Firestore `cars` collection.

## Overview

- **Collection**: `cars`
- **Document ID**: Custom ID (e.g., `car-4-seat-city`).

## Schema Definition

```javascript
/**
 * Car document in Firestore `cars` collection.
 * @typedef {Object} Car
 */
{
  /** @type {string} Custom ID "car-4-seat-city" */
  id: string,
  /** @type {string} Car name (e.g., "Xe 4 chỗ thành phố") */
  name: string,
  /** @type {string} URL-friendly slug (e.g., "xe-4-cho-thanh-pho") */
  slug: string,
  /** @type {string} "4-seat" | "7-seat" | "16-seat" | "29-seat" */
  type: string,
  /** @type {string} Full description (HTML) */
  description: string,
  /** @type {string} Short description, max 200 chars */
  excerpt: string,

  /** @type {string} Main photo URL */
  featuredImage: string,
  /** @type {Array<string>} Gallery image URLs */
  gallery: Array<string>,
  /** @type {Array<string>} Top features */
  highlights: Array<string>,
  /** @type {Array<string>} What is included */
  included: Array<string>,
  /** @type {Array<string>} What is excluded */
  excluded: Array<string>,
  /** @type {Array<string>} Car categories */
  categories: Array<string>,
  /** @type {Array<string>} Tags/keywords */
  tags: Array<string>,

  /** @type {Object} Pricing information */
  pricing: {
    /** @type {number} Base price in VND */
    basePrice: number,
    /** @type {number} Price per adult */
    adultPrice: number,
    /** @type {number} Price per child */
    childPrice: number,
    /** @type {string} "VND" | "USD" */
    currency: string,
    /** @type {number} Percentage required as deposit (0-100). 0 = pay on arrival */
    prepaid: number,
    /** @type {number} Discount percentage (0-100) */
    discountPercent: number
  },

  /** @type {number} Maximum passenger capacity */
  capacity: number,
  /** @type {number} Number of cars available for booking */
  availability: number,

  /** @type {Object} Rating information */
  rating: {
    /** @type {number} Average rating 1-5 */
    average: number,
    /** @type {number} Number of reviews */
    count: number
  },

  /** @type {boolean} Whether this car is featured on homepage */
  isFeatured: boolean,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Availability Logic

- `availability` represents the current number of cars available for booking.
- A value of `0` means the car is fully booked and not available.
- The value should be decremented when a booking is confirmed and incremented when a booking is canceled or a rental period ends.
- Availability is managed at the root document level (not per variant or date range).
