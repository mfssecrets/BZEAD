# APPLOGIC

## Goal
Ensure one strict, consistent pricing pipeline across:
- home listings
- section/category listings
- product details
- wishlist
- cart
- shipping
- review
- checkout/payment

## Mandatory Rules
1. User location/country must always be resolved before final pricing.
2. Destination-aware public pricing must be fetched from backend pricing RPCs for every product shown to the buyer.
3. For non-origin-country buyers, destination/country markup (or country-specific selling price) must be applied when available.
4. If no destination override exists, fallback must be product default selling price.
5. Display currency must be buyer-country/user currency, using real FX conversion rates.
6. Currency conversion must happen exactly once per displayed amount (no double conversion).
7. The same effective per-product unit price must be used consistently across wishlist, cart, shipping, review, checkout, and payment creation.
8. Checkout/payment totals must be recalculated from destination-aware backend pricing before order placement.

## Country Resolution Order
1. Selected shipping address country (if available)
2. Detected location country
3. Profile country
4. Safe fallback country only if all above are unavailable

## Pricing Source Order
1. Country-specific product selling price (if configured for destination)
2. Markup-derived destination selling price
3. Default selling price

## Currency Handling
1. Keep source price and source currency paired.
2. Convert source amount to buyer display currency once.
3. Format using target currency symbol/code.
4. Never convert an already-converted amount again.

## Admin Price Save Requirements
1. Save default selling price + default selling country to products table.
2. Upsert country-wise selling prices to product_country_selling_prices.
3. Surface validation/RLS/save errors inside modal immediately.
4. Do not report success unless write operations are confirmed.

## Validation Checklist
- Same SKU shows same destination-aware unit price on all buyer pages.
- Wishlist total equals sum of line prices in same display currency.
- Cart subtotal equals sum of selected item line totals.
- Shipping/review/checkout totals match backend destination quote.
- PaymentIntent amount equals final checkout total.