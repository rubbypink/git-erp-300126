# Hotel Price Schedule Schema

This document defines the structure of the Hotel Price Schedule document in the Firestore `hotel_price_schedules` collection.

## Overview

- **Collection**: `hotel_price_schedules`
- **Document ID**: `{hotelId}_base_{year}` (e.g., `hotel-phu-quoc-1_base_2026`).

## Schema Definition

```javascript
/**
 * Hotel Price Schedule document in Firestore `hotel_price_schedules` collection.
 * @typedef {Object} HotelPriceSchedule
 */
{
  /** @type {string} Document ID "{hotelId}_base_{year}" */
  id: string,

  /** @type {Object} Schedule metadata */
  info: {
    /** @type {string} Reference to hotels collection document ID */
    hotelId: string,
    /** @type {number} Year this schedule applies to (e.g., 2026) */
    year: number,
    /** @type {string} "active" | "inactive" | "expired" */
    status: string,
    /** @type {string} ISO timestamp */
    createdAt: string,
    /** @type {string} ISO timestamp */
    updatedAt: string
  },

  /**
   * Map of pricing entries keyed by "{roomId}_{rateType}".
   * Each key maps to an array of period-based pricing entries.
   * @type {Object<string, Array<Object>>}
   */
  priceData: {
    [roomId_rateType: string]: Array<{
      /** @type {string} ISO date string YYYY-MM-DD - period start */
      startDate: string,
      /** @type {string} ISO date string YYYY-MM-DD - period end */
      endDate: string,
      /** @type {number} Cost price (what the supplier charges) in VND */
      costPrice: number,
      /** @type {number} Selling price to customer in VND */
      sellPrice: number,
      /** @type {string} Supplier/vendor name */
      supplier: string,
      /** @type {number} Percentage required as deposit (0-100). 0 = pay on arrival */
      prepaid: number,
      /** @type {string} Period identifier (e.g., "peak", "normal", "low") */
      periodKey: string
    }>
  }
}
```

## Price Data Logic

- `priceData` is a map (Firestore Map type) where each key follows the format `{roomId}_{rateType}`.
  - `roomId`: Reference to a room document in the hotel's rooms subcollection.
  - `rateType`: Rate category (e.g., `standard`, `deluxe`, `promotion`).
- Each key maps to an array of pricing entries, each defining a date period with cost and sell prices.
- Overlapping date periods for the same `roomId_rateType` are not allowed. The system should validate this on write.
- `status` is set to `"active"` by default (not `"actived"`). This was corrected from earlier versions.
- When querying, filter by `info.status === "active"` and `info.year === currentYear` to find the current valid schedule.
