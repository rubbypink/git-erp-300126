# Activity Schema

This document defines the structure of the Activity document in the Firestore `activities` collection.

## Overview

- **Collection**: `activities`
- **Document ID**: Custom ID (e.g., `act-hoi-an-cooking`).
- **Availability**: `availability` field at the document root level (number of activity slots available for booking).

## Schema Definition

```javascript
/**
 * Activity document in Firestore `activities` collection.
 * @typedef {Object} Activity
 */
{
  /** @type {string} Custom ID "act-hoi-an-cooking" */
  id: string,
  /** @type {string} URL slug (unique) */
  slug: string,
  /** @type {string} Activity name/title (required) */
  title: string,

  /** @type {string} Duration e.g. "1/2 ngày", "1 ngày" */
  duration: string,
  /** @type {string} Detailed duration e.g. "Khoảng 20 phút" */
  durationDetail: string,

  /** @type {string} City/region name */
  location: string,
  /** @type {string} Reference to locations collection */
  locationId: string,
  /** @type {string} Specific address */
  locationDetail: string,

  /** @type {string} Opening hours / show times */
  openingHours: string,

  /** @type {number} Maximum participants */
  capacity: number,
  /** @type {number} Number of activity slots available for booking */
  availability: number,

  /** @type {string} Short description */
  excerpt: string,
  /** @type {string} Full description (HTML) */
  description: string,
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
  /** @type {Array<string>} Activity categories */
  categories: Array<string>,
  /** @type {Array<string>} Tags/keywords */
  tags: Array<string>,

  /** @type {Object} Pricing with basePrice and tiers array */
  pricing: {
    /** @type {number} Lowest adult price for filter/sort (VND) */
    basePrice: number,
    /** @type {number} Default adult price (VND) */
    adultPrice: number,
    /** @type {number} Default child price (VND) */
    childPrice: number,
    /** @type {number} Default infant price (VND) */
    infantPrice: number,
    /** @type {string} Currency code (default: VND) */
    currency: string,
    /** @type {number} Percentage required as deposit (0-100). 0 = pay on arrival */
    prepaid: number,
    /** @type {number} Discount percentage (0-100) */
    discountPercent: number,
    /** @type {Array<Object>} Pricing tiers */
    tiers: Array<{
      /** @type {string} Price ID (unique within activity) */
      id: string,
      /** @type {string} Package/tier name */
      name: string,
      /** @type {string} Tier description */
      description: string,
      /** @type {number} Adult price (VND) */
      adultPrice: number,
      /** @type {number} Child price (VND, 0 if free) */
      childPrice: number,
      /** @type {string} Currency code */
      currency: string,
      /** @type {number} Discount percent 0-100 */
      discountPercent: number,
      /** @type {Array<string>} Included items */
      included: Array<string>
    }>
  },

  /** @type {Object} Rating information */
  rating: {
    /** @type {number} Average rating 1-10 */
    average: number,
    /** @type {number} Number of reviews */
    count: number
  },

  /** @type {boolean} Featured activity flag */
  isFeatured: boolean,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Availability Field (NEW)

The `availability` field is the Single Source of Truth for activity inventory management.

### Activity Slots

- `availability` represents the current number of activity slots available for booking (at the document root level).
- A value of `0` means the activity is fully booked and not available.
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
| `activities` | `isFeatured` ASC, `createdAt` DESC | Featured activities sorted by newest |
| `activities` | `rating.average` DESC | Sort by rating |
| `activities` | `pricing.basePrice` ASC | Sort by price low-to-high |
| `activities` | `updatedAt` DESC | Recently updated activities |

## Related Collections

| Collection | Relationship |
|------------|--------------|
| `bookings` | `items[].serviceId` references activity ID when `serviceType` is `"activity"` |
| `inventory_holds` | `serviceId` references activity ID and `roomId` is `null` when `serviceType` is `"activity"` |
| `reviews` | `activityId` field references activity ID |
| `locations` | `locationId` references location document ID |
| `counters` | `seq` counter for sequential ID generation |
