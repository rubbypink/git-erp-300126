# Tour Schema

This document defines the structure of the Tour document in the Firestore `tours` collection.

## Overview

- **Collection**: `tours`
- **Document ID**: Custom ID (e.g., `tour-phu-quoc-1`).
- **Availability**: `availability` field at the document root level (number of tour slots available for booking).

## Schema Definition

```javascript
/**
 * Tour document in Firestore `tours` collection.
 * @typedef {Object} Tour
 */
{
  /** @type {string} Custom ID "tour-phu-quoc-1" */
  id: string,
  /** @type {string} Tour name/title (required) */
  title: string,
  /** @type {string} URL slug (unique) */
  slug: string,

  /** @type {string} Duration string e.g. "3 ngày 2 đêm" */
  duration: string,
  /** @type {number} Number of days */
  durationDays: number,

  /** @type {string} City/region name */
  location: string,
  /** @type {string} Meeting point address */
  address: string,
  /** @type {string} Reference to locations collection */
  locationId: string,

  /** @type {string} Full tour description (HTML) */
  description: string,
  /** @type {string} Short description, max 200 chars */
  excerpt: string,
  /** @type {string} Main photo URL */
  featuredImage: string,
  /** @type {Array<string>} All tour photo URLs */
  gallery: Array<string>,

  /** @type {Array<string>} Tour highlights */
  highlights: Array<string>,
  /** @type {Array<string>} What is included */
  included: Array<string>,
  /** @type {Array<string>} What is not included */
  excluded: Array<string>,
  /** @type {Array<string>} Tour type categories */
  categories: Array<string>,
  /** @type {Array<string>} Tags/keywords */
  tags: Array<string>,

  /** @type {Array<Object>} Day-by-day itinerary */
  itinerary: Array<{
    /** @type {number} Day number */
    day: number,
    /** @type {string} Day title */
    title: string,
    /** @type {string} Day description (HTML) */
    description: string,
    /** @type {string} Meals included */
    meals: string,
    /** @type {string} Overnight location */
    overnight: string
  }>,

  /** @type {Object} Basic pricing info */
  pricing: {
    /** @type {number} Base price in VND */
    basePrice: number,
    /** @type {number} Adult price (VND) */
    adultPrice: number,
    /** @type {number} Child price (VND) */
    childPrice: number,
    /** @type {number} Infant price (VND) */
    infantPrice: number,
    /** @type {string} Currency code (default: VND) */
    currency: string,
    /** @type {number} Percentage required as deposit (0-100). 0 = pay on arrival */
    prepaid: number,
    /** @type {number} Discount percentage (0-100) */
    discountPercent: number
  },

  /** @type {number} Maximum tour capacity */
  capacity: number,
  /** @type {number} Number of tour slots available for booking */
  availability: number,

  /** @type {Object} Rating information */
  rating: {
    /** @type {number} Average rating 1-10 */
    average: number,
    /** @type {number} Number of reviews */
    count: number
  },

  /** @type {boolean} Featured tour flag */
  isFeatured: boolean,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Availability Field (NEW)

The `availability` field is the Single Source of Truth for tour inventory management.

### Tour Slots

- `availability` represents the current number of tour slots available for booking (at the document root level).
- A value of `0` means the tour is fully booked and not available.
- Default during creation: set to `capacity` if provided, otherwise `100`.

### What Updates Availability

| Operation | Effect | Description |
|-----------|--------|-------------|
| `createInventoryHoldAdmin` | Decrements | Temporary hold placed during checkout (15-min TTL) |
| `releaseInventoryHoldAdmin` | Increments | Hold expires or user cancels checkout |
| `createBookingAdmin` | Decrements | Booking is confirmed and paid |
| `cancelBookingAdmin` | Increments | Booking is canceled by user or admin |

### Concurrency

- All availability mutations use `FieldValue.increment()` for atomic, race-condition-safe updates.
- This eliminates the need for distributed locks or transactions for inventory operations.

### For Hotel Rooms

- Hotels use `rooms[].availability` (per-room-type within embedded array). See the Hotel Schema for details.

## Indexes Required

### Single-field indexes (auto-created)

- `isFeatured` (boolean)
- `slug` (string)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### Composite indexes

| Collection | Fields | Purpose |
|------------|--------|---------|
| `tours` | `isFeatured` ASC, `createdAt` DESC | Featured tours sorted by newest |
| `tours` | `rating.average` DESC | Sort by rating |
| `tours` | `pricing.basePrice` ASC | Sort by price low-to-high |
| `tours` | `durationDays` ASC | Sort by trip length |
| `tours` | `updatedAt` DESC | Recently updated tours |

## Related Collections

| Collection | Relationship |
|------------|--------------|
| `bookings` | `items[].serviceId` references tour ID when `serviceType` is `"tour"` |
| `inventory_holds` | `serviceId` references tour ID and `roomId` is `null` when `serviceType` is `"tour"` |
| `reviews` | `tourId` field references tour ID |
| `locations` | `locationId` references location document ID |
| `tour_pricing` | `tourId` field references tour ID for pricing tiers |
| `counters` | `seq` counter for sequential ID generation |
