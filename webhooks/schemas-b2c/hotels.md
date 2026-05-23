# Hotel Schema

This document defines the structure of the Hotel document in the Firestore `hotels` collection.

## Overview

- **Collection**: `hotels`
- **Document ID**: Custom ID (e.g., `hotel-phu-quoc-1`).
- **Rooms**: Embedded as `rooms[]` array within the hotel document (NOT a separate collection).

## Schema Definition

```javascript
/**
 * Hotel document in Firestore `hotels` collection.
 * @typedef {Object} Hotel
 */
{
  /** @type {string} Custom ID "hotel-phu-quoc-1" */
  id: string,
  /** @type {string} Hotel name (required) */
  name: string,
  /** @type {string} URL-friendly slug (unique) */
  slug: string,
  /** @type {number} Star rating 1-5 */
  starRating: number,

  /** @type {Object} Address information */
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

  /** @type {Object} Basic pricing info */
  pricing: {
    /** @type {number} Base price in VND */
    basePrice: number,
    /** @type {string} Currency code (default: VND) */
    currency: string,
    /** @type {number} Percentage required as deposit (0-100). 0 = pay on arrival */
    prepaid: number
  },

  /** @type {string} Full hotel description (HTML) */
  description: string,
  /** @type {string} Short description, max 200 chars */
  excerpt: string,
  /** @type {string} Main photo URL */
  featuredImage: string,
  /** @type {Array<string>} Gallery image URLs */
  gallery: Array<string>,

  /** @type {Array<string>} Hotel facilities */
  amenities: Array<string>,
  /** @type {Array<string>} Top features */
  highlights: Array<string>,
  /** @type {Array<string>} Tags like resort, sea-view, pool */
  tags: Array<string>,

  /** @type {Object} Guest rating info */
  rating: {
    /** @type {number} Average guest rating 1-10 */
    average: number,
    /** @type {number} Number of reviews */
    count: number
  },

  /** @type {Object} Hotel policies */
  policies: {
    /** @type {string} Check-in time e.g. 14:00 */
    checkIn: string,
    /** @type {string} Check-out time e.g. 12:00 */
    checkOut: string,
    /** @type {string} Cancellation policy (HTML) */
    cancellation: string,
    /** @type {string} Children policy (HTML) */
    children: string,
    /** @type {string} Pets policy (HTML) */
    pets: string,
    /** @type {string} Taxes & fees (HTML) */
    taxes: string,
    /** @type {string} Additional notes (HTML) */
    notes: string
  },

  /** @type {Object} Map coordinates */
  map: {
    /** @type {number} Latitude */
    lat: number,
    /** @type {number} Longitude */
    lng: number
  },

  /** @type {string} Phone number */
  phone: string,
  /** @type {string} Email address */
  email: string,
  /** @type {string} Website URL */
  website: string,

  /** @type {Array<Object>} Embedded array of room objects */
  rooms: Array<{
    /** @type {string} Room ID (unique within hotel) */
    id: string,
    /** @type {string} Room type name (required) */
    name: string,
    /** @type {string} URL slug (unique within hotel) */
    slug: string,
    /** @type {string} Room description (HTML) */
    description: string,
    /** @type {string} Room featured image URL */
    featuredImage: string,
    /** @type {Array<string>} Room gallery URLs */
    gallery: Array<string>,
    /** @type {string} Bed type e.g. 1 giường King */
    bedType: string,
    /** @type {number} Maximum adults */
    maxAdults: number,
    /** @type {number} Maximum children */
    maxChildren: number,
    /** @type {number} Total maximum guests */
    maxGuests: number,
    /** @type {number} Room size in m² */
    roomSize: number,
    /** @type {Array<string>} Room amenities */
    amenities: Array<string>,
    /** @type {Array<string>} Included items */
    included: Array<string>,
    /** @type {number} Total physical rooms of this type */
    totalRooms: number,
    /** @type {number} Number of rooms available for booking */
    availability: number,
    /** @type {boolean} Active status */
    isActive: boolean,
    /** @type {number} Display order */
    sortOrder: number
  }>,

  /** @type {boolean} Featured hotel flag */
  isFeatured: boolean,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Availability Field (NEW)

The `availability` field is the Single Source of Truth for inventory management across all bookable services. Its behavior differs by entity type:

### Hotel Rooms (embedded `rooms[].availability`)

- Each room object in the `rooms[]` array has its own `availability` field.
- This represents how many rooms of that specific type are currently available for booking.
- A value of `0` means that room type is fully booked.

### What Updates Availability

| Operation                   | Effect     | Description                                        |
| --------------------------- | ---------- | -------------------------------------------------- |
| `createInventoryHoldAdmin`  | Decrements | Temporary hold placed during checkout (15-min TTL) |
| `releaseInventoryHoldAdmin` | Increments | Hold expires or user cancels checkout              |
| `createBookingAdmin`        | Decrements | Booking is confirmed and paid                      |
| `cancelBookingAdmin`        | Increments | Booking is canceled by user or admin               |

### Concurrency

- All availability mutations use `FieldValue.increment()` for atomic, race-condition-safe updates.
- This eliminates the need for distributed locks or transactions for inventory operations.

### Default Value

- During creation or backfill, `availability` is set to `totalRooms` for each room (i.e., all rooms are available).
- For services without `totalRooms`, the default is `100`.

### For Other Services

- **Tours, Activities, Cars, Rentals**: `availability` is at the document root level (not per-array-item).
- See individual schema files for details.

## Indexes Required

### Single-field indexes (auto-created)

- `isFeatured` (boolean)
- `slug` (string)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### Composite indexes

| Collection | Fields                             | Purpose                          |
| ---------- | ---------------------------------- | -------------------------------- |
| `hotels`   | `isFeatured` ASC, `createdAt` DESC | Featured hotels sorted by newest |
| `hotels`   | `rating.average` DESC              | Sort by guest rating             |
| `hotels`   | `pricing.basePrice` ASC            | Sort by price low-to-high        |
| `hotels`   | `updatedAt` DESC                   | Recently updated hotels          |

## Related Collections

| Collection              | Relationship                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `bookings`              | `items[].serviceId` references hotel ID when `serviceType` is `"hotel"`                              |
| `inventory_holds`       | `serviceId` references hotel ID and `roomId` references room ID when `serviceType` is `"hotel_room"` |
| `reviews`               | `hotelId` field references hotel ID                                                                  |
| `locations`             | `address.cityId` references location document ID                                                     |
| `hotel_price_schedules` | `hotelId` field references hotel ID for seasonal pricing                                             |
| `counters`              | `seq` counter for sequential ID generation                                                           |
