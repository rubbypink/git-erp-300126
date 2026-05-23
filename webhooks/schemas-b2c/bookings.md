# Booking Schema

This document defines the structure of the Booking document in the Firestore `bookings` collection.

## Overview

- **Collection**: `bookings`
- **Document ID**: Sequential number starting from 10000 (e.g., "10000", "10001").

## Schema Definition

```javascript
/**
 * Booking document in Firestore `bookings` collection.
 * @typedef {Object} Booking
 */
{
  /** @type {string} Sequential ID "10000", "10001", etc. */
  id: string,
  /** @type {string} Reference to users collection document ID */
  userId: string,
  /** @type {string} Optional booking code, defaults to id if not set */
  bookingCode: string,

  /** @type {Array<Object>} List of items in the booking */
  items: Array<{
    /** @type {string} ID of the service (hotel/tour/activity/car/rental) */
    serviceId: string,
    /** @type {string} "hotel" | "tour" | "activity" | "car" | "rental" */
    serviceType: string,
    /** @type {string} Display name of the service */
    serviceTitle: string,
    /** @type {string} URL to featured image */
    featuredImage: string,
    /** @type {string} ISO date string YYYY-MM-DD */
    startDate: string,
    /** @type {string} ISO date string YYYY-MM-DD (optional) */
    endDate: string,
    /** @type {number} Number of adults */
    adults: number,
    /** @type {number} Number of children */
    children: number,
    /** @type {number} Number of infants */
    infants: number,
    /** @type {number} Base price per unit */
    basePrice: number,
    /** @type {number} Total price for child */
    childPrice: number,
    /** @type {number} Total price for infant */
    infantPrice: number,
    /** @type {number} Total price for this item */
    total: number,
    /** @type {string} "VND", "USD" */
    currency: string,
    /** @type {string} Rate/package name */
    rateType: string,
    /** @type {number} Percentage (%) required as deposit (0-100). 0 = pay on arrival (order) */
    prepaid: number
  }>,

  /** @type {Object} Payment information */
  payment: {
    /** @type {string} "full" | "deposit" | "order" - payment type */
    prepaid: string,
    /** @type {number} Total booking amount */
    total: number,
    /** @type {number} Amount to prepay (calculated from items' prepaid %) */
    deposit: number,
    /** @type {number} Remaining balance (total - deposit) */
    balance: number,
    /** @type {string} Payment gateway: "MOMO" | "VNPAY" | "PAYPAL" */
    gate: string,
    /** @type {string} ISO timestamp of payment */
    date: string,
    /** @type {string} ISO date string - payment deadline. If prepaid is "order", dueDate = first item's startDate */
    dueDate: string
  },

  /** @type {string} "pending" | "ordered" | "deposited" | "confirmed" | "paid" | "canceled" | "refund" | "completed" */
  status: string,

  /** @type {Object} Customer contact information */
  contactInfo: {
    /** @type {string} Customer full name */
    fullName: string,
    /** @type {string} Customer email */
    email: string,
    /** @type {string} Customer phone number */
    phone: string,
    /** @type {string} Any special requests (empty string if none) */
    specialRequests: string
  },

  /** @type {number} no of adults */
  adults: number,
  /** @type {number} no of child */
  children: number,

  /** @type {string | null} Applied coupon code, null if none */
  couponCode: string | null,
  /** @type {string} "pending" | "synced" | "failed" */
  erpSyncStatus: string,

  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Status Definitions

- `pending`: Waiting for payment. Auto-canceled if not updated within 60 minutes.
- `ordered`: No prepayment required (`payment.prepaid = "order"`).
- `deposited`: Partial payment made (`payment.deposit > 0` AND `payment.balance > 0`).
- `confirmed`: Confirmation email sent to customer.
- `paid`: Fully paid (`payment.total === payment.deposit` AND `payment.deposit > 0`).
- `canceled`: Booking has been canceled.
- `refund`: Waiting for refund processing.
- `completed`: Customer has completed the service.

## Deposit Calculation Logic

- `payment.deposit` is the sum of `(item.total * item.prepaid / 100)` for all booking items.
- If ALL items have `prepaid = 0`, then `payment.prepaid = "order"` and `payment.dueDate = items[0].startDate`.
- If ANY item has `prepaid > 0`, the minimum deposit is the sum calculated above.
- `payment.balance = payment.total - payment.deposit`.
