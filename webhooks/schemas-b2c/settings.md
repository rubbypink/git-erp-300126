# Settings Schema

This document defines the structure of the Setting document in the Firestore `settings` collection.

## Overview

- **Collection**: `settings`
- **Document ID**: Sequential number starting from 10000.

## Schema Definition

```javascript
/**
 * Settings document in Firestore `settings` collection.
 * @typedef {Object} Setting
 */
{
  /** @type {string} Sequential ID "10000" */
  id: string,
  /** @type {string} Setting key (e.g., "site_general", "payment_config", "email_config") */
  key: string,
  /** @type {Object} Setting value (JSON object) */
  value: Object,
  /** @type {string} Human-readable description */
  description: string,
  /** @type {string} ISO timestamp */
  updatedAt: string
}
```
