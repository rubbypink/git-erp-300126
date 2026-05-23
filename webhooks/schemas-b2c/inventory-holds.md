# Inventory Hold Schema

This document defines the structure of the Inventory Hold document in the Firestore `inventory_holds` collection.

## Overview

- **Collection**: `inventory_holds`
- **Document ID**: Sequential number starting from 10000 (e.g., "10000", "10001").

## Behavior

When a hold is created, `availability` on the service document (or room for hotels) MUST be decremented. When a hold is released, `availability` MUST be incremented back. This is managed by `createInventoryHoldAdmin` / `releaseInventoryHoldAdmin` functions.

## Schema Definition

```javascript
/**
 * Inventory Hold document in Firestore `inventory_holds` collection.
 * @typedef {Object} InventoryHold
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Reference to the service being held */
  serviceId: string,
  /** @type {string} "hotel_room" | "tour" | "activity" | "car" | "rental" */
  serviceType: string,
  /** @type {string | null} Room ID, required when serviceType is "hotel_room" */
  roomId: string | null,
  /** @type {string | null} Rate/package name, required when serviceType is "hotel_room" */
  rateType: string | null,
  /** @type {string} ISO date string YYYY-MM-DD - hold start */
  startDate: string,
  /** @type {string} ISO date string YYYY-MM-DD - hold end */
  endDate: string,
  /** @type {number} Number of units held */
  quantity: number,
  /** @type {string} Reference to users collection document ID */
  userId: string,
  /** @type {string} ISO timestamp of when the hold was created */
  heldAt: string,
  /** @type {string} ISO timestamp - hold expiration (15 minute TTL) */
  expiresAt: string
}
```
