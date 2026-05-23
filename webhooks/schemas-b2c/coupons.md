# Coupon Schema

This document defines the structure of the Coupon document in the Firestore `coupons` collection.

## Overview

- **Collection**: `coupons`
- **Document ID**: Sequential number starting from 10000.

## Schema Definition

```javascript
/**
 * Coupon document in Firestore `coupons` collection.
 * @typedef {Object} Coupon
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Coupon code (e.g., "SUMMER26") */
  code: string,
  /** @type {string} "hotels" | "tours" | "activites" | "all". Default "all" */
  serviceType: string,
  /** @type {string} exactly id of service that can apply coupon - Example: "the-nice-hotel-phu-quoc" or "tour-cano-3-dao" */
  serviceName: string,  
  /** @type {string} "percentage" | "fixed" */
  discountType: string,
  /** @type {number} 10 (10%) or 100000 (100k VND fixed) */
  discountValue: number,
  /** @type {number} Minimum order value to apply */
  minOrderValue: number,
  /** @type {number} Maximum discount amount cap */
  maxDiscount: number,
  /** @type {string} ISO timestamp - coupon validity start */
  startDate: string,
  /** @type {string} ISO timestamp - coupon validity end */
  endDate: string,
  /** @type {number} Max number of uses */
  usageLimit: number,
  /** @type {number} Current usage count */
  usedCount: number,
  /** @type {string} "active" | "inactive" | "expired" */
  status: string,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```

## Coupon Logic

- `serviceName` require `serviceType` as "all" or match type of original service. Example `serviceName` = "tour-cano-3-dao", so this coupon must have `serviceType` as "all" or "tours".
