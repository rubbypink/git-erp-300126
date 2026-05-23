# Prepaid Pricing Documentation

This document specifies the requirement for the `prepaid` field across all service pricing structures in the system.

## Overview

All service pricing tables (tours, hotels, activities, cars, rentals) must include a `prepaid` field to determine the deposit percentage required at the time of booking.

## Field Specification

- **Field Name**: `prepaid`
- **Type**: `Number`
- **Range**: `0` to `100`
- **Description**: Percentage (%) of the total price required as a deposit. 
  - `0` means "Pay on Arrival" (Order).
  - `100` means "Full Prepayment" required.

## Implementation Locations

### 1. Tour Pricing
- **Location**: `tours/{tourId}/tourPricing` subcollection.
- **Requirement**: Add `prepaid: Number` (0-100) to each pricing tier document.

### 2. Hotel Pricing
- **Location**: `hotel_price_schedules` collection → `priceData` objects.
- **Requirement**: Add `prepaid: Number` (0-100) to each `rateType` pricing entry.

### 3. Activity Pricing
- **Location**: `activities` collection → `pricing` field.
- **Requirement**: Add `prepaid: Number` (0-100) to the pricing object.

### 4. Car Pricing
- **Location**: `cars` collection → `pricing` field.
- **Requirement**: Add `prepaid: Number` (0-100) to the pricing object.

### 5. Rental Pricing
- **Location**: `rentals` collection → `pricing` field.
- **Requirement**: Add `prepaid: Number` (0-100) to the pricing object.
