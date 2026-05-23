# Rental Schema

This document defines the structure of the Rental document in the Firestore `rentals` collection.

## Overview

- **Collection**: `rentals`
- **Document ID**: Custom ID (e.g., `rental-villa-phu-quoc`).

## Schema Definition

```javascript
/**
 * Rental document in Firestore `rentals` collection.
 * @typedef {Object} Rental
 */
{
  /** @type {string} Custom ID "rental-villa-phu-quoc" */
  id: string,
  /** @type {string} Rental name (e.g., "Villa Phú Quốc") */
  name: string,
  /** @type {string} URL-friendly slug (e.g., "villa-phu-quoc") */
  slug: string,
  /** @type {string} "villa" | "apartment" | "house" | "resort" */
  type: string,
  /** @type {string} Full description (HTML) */
  description: string,
  /** @type {string} Short description, max 200 chars */
  excerpt: string,

  /** @type {string} Main photo URL */
  featuredImage: string,
  /** @type {Array<string>} Gallery image URLs */
  gallery: Array<string>,

  /** @type {string} City/region name */
  location: string,
  /** @type {string} Reference to locations collection */
  locationId: string,
  /** @type {Object} Full address details */
  address: {
    /** @type {string} Street address */
    street: string,
    /** @type {string} City name */
    city: string,
    /** @type {string} Reference to locations collection */
    cityId: string,
    /** @type {string} Country name */
    country: string
  },

  /** @type {Array<string>} Rental amenities/facilities */
  amenities: Array<string>,
  /** @type {Array<string>} Top features */
  highlights: Array<string>,
  /** @type {Array<string>} What is included */
  included: Array<string>,
  /** @type {Array<string>} What is excluded */
  excluded: Array<string>,
  /** @type {Array<string>} Tags/keywords */
  tags: Array<string>,

  /** @type {Object} Pricing information */
  pricing: {
    /** @type {number} Base price per night in VND */
    basePrice: number,
    /** @type {number} Price per adult per night */
    adultPrice: number,
    /** @type {number} Price per child per night */
    childPrice: number,
    /** @type {string} "VND" | "USD" */
    currency: string,
    /** @type {number} Percentage required as deposit (0-100). 0 = pay on arrival */
    prepaid: number,
    /** @type {number} Discount percentage (0-100) */
    discountPercent: number
  },

  /** @type {number} Number of bedrooms */
  bedrooms: number,
  /** @type {number} Number of bathrooms */
  bathrooms: number,
  /** @type {number} Maximum number of guests */
  maxGuests: number,
  /** @type {number} Number of rental units available for booking */
  availability: number,

  /** @type {Object} Rating information */
  rating: {
    /** @type {number} Average rating 1-5 */
    average: number,
    /** @type {number} Number of reviews */
    count: number
  },

  /** @type {boolean} Whether this rental is featured on homepage */
  isFeatured: boolean,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Availability Logic

- `availability` represents the current number of rental units available for booking.
- A value of `0` means all units are fully booked and not available.
- The value should be decremented when a booking is confirmed and incremented when a booking is canceled or a stay period ends.
- Availability is managed at the root document level (not per date range or room type).
