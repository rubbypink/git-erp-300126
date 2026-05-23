# User Schema

This document defines the structure of the User document in the Firestore `users` collection.

## Overview

- **Collection**: `users`
- **Document ID**: Sequential number starting from 10000 (e.g., "10000", "10001").
- **Authentication**: Links to Firebase Authentication via the `uid` field.

## Schema Definition

```javascript
/**
 * User document in Firestore `users` collection.
 * @typedef {Object} User
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Firebase Auth UID (from firebase auth) */
  uid: string,
  /** @type {string} User email */
  email: string,
  /** @type {string} Display name */
  fullName: string,
  /** @type {string} Phone number (optional) */
  phone: string,
  /** @type {string} Avatar URL */
  photoURL: string,
  /** @type {string} Fixed: "customer" (per system rules - no admin/partner) */
  role: string,
  /** @type {string} "active" | "inactive" | "banned" */
  status: string,
  /** @type {string} ISO timestamp */
  createdAt: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```
