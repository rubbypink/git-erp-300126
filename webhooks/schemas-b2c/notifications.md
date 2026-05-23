# Notification Schema

This document defines the structure of the Notification document in the Firestore `notifications` collection.

## Overview

- **Collection**: `notifications`
- **Document ID**: Sequential number starting from 10000 (e.g., "10000", "10001").

## Schema Definition

```javascript
/**
 * Notification document in Firestore `notifications` collection.
 * @typedef {Object} Notification
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Reference to users collection document ID */
  userId: string,
  /** @type {string} "booking_confirmed" | "booking_cancelled" | "payment_received" | "review_approved" | "system" */
  type: string,
  /** @type {string} Notification title */
  title: string,
  /** @type {string} Notification body message */
  message: string,
  /** @type {boolean} Whether the notification has been read */
  isRead: boolean,
  /** @type {Object} Arbitrary notification payload */
  data: Object,
  /** @type {string} ISO timestamp */
  createdAt: string
}
```
