# BZEAD — Pricing & Markup Logic

> Source of truth: code in `Bzeadstore-main/src/lib/checkoutPricingService.ts`,
> schema in `products`, `product_country_selling_prices`, `orders`, `order_items`.
> Verified against live DB on 2026-05-28.

---

## 1. Tables involved

### `products`
| Column | Meaning |
|---|---|
| `price` `numeric(12,2)` | Base seller price in `products.currency` (typically INR). |
| `currency` `text` (default `INR`) | Source currency of `price` (synced from `origin_country_id` via trigger). |
| `mrp` `numeric(12,2)` | MRP for India (regulated label price). |
| `discount_price` `numeric(12,2)` | Optional discounted base price. |
| `default_selling_price` `numeric(12,2)` | Mirror of `price` maintained by trigger `trg_products_sync_default_selling_price`. |
| `origin_country_id` `uuid` | Drives `currency` via trigger `trg_products_sync_currency_from_origin_country`. |

### `product_country_selling_prices` (per-country markup table)
| Column | Meaning |
|---|---|
| `product_id` `uuid` | FK → `products.id`. |
| `country_id` `uuid` | FK → `countries.id` (destination buyer country). |
| `variant_id` `uuid` (nullable) | Per-variant override; `NULL` = applies to all variants. |
| `selling_price` `numeric(12,2)` | **Final selling price** for that country. Stored as a plain number. |
| `markup_percent` `numeric(10,4)` | Markup % over base `products.price` (informational). |
| `markup_mrp` `numeric(20,2)` | Marked-up MRP (informational). |
| Unique key | `(product_id, country_id, variant_id)` NULLS NOT DISTINCT. |

### `orders` (price-relevant columns)
| Column | Meaning |
|---|---|
| `currency` | Buyer display currency (GBP, EUR, INR, …). |
| `product_subtotal` | Sum of `order_items.customer_line_total` in buyer currency. |
| `platform_fee` | 3% of `(product_subtotal − offer_discount + shipping_charge)` (see `Checkout.tsx`). |
| `shipping_charge`, `offer_discount` | In buyer currency. |
| `total_amount` | `product_subtotal − offer_discount + shipping_charge + platform_fee`. |
| `seller_currency` | Origin/seller currency (INR for India sellers). |
| `seller_items_subtotal` | Items subtotal in **seller currency** (locked at order time). |
| `seller_payout_total` | Final seller-currency payout after platform cut. |
| `seller_earning` | Seller earning in **buyer currency** (legacy / reporting). |
| `buyer_to_seller_fx_rate` | Rate used to convert buyer-ccy → seller-ccy at order time. |
| `platform_markup_total_inr` | Markup margin in INR. |
| `fx_locked_at` | Timestamp the FX snapshot was taken. |
| `stripe_fee` | Stripe processing fee deducted by gateway. |

### `order_items`
| Column | Meaning |
|---|---|
| `price` | Per-unit price in `buyer_currency` (legacy). |
| `customer_unit_price` | Per-unit price charged to buyer (buyer currency). |
| `customer_line_total` | `customer_unit_price × quantity`. |
| `seller_unit_price`, `seller_line_total` | Per-unit / line totals in **seller currency**. |
| `seller_earning_locked` | Locked seller payout per line (seller currency). |
| `locked_fx_rate` | Per-line FX snapshot. |
| `buyer_currency`, `seller_currency` | Snapshot of both sides at order time. |

### `payment_intents`
| Column | Meaning |
|---|---|
| `amount`, `currency` | What Stripe **actually captured** (truth). Currency is lowercase per Stripe. |
| `stripe_payment_intent_id` | Stripe PI id, mirrored in `orders.payment_intent_id`. |

---

## 2. Price resolution at checkout

Code: [`Bzeadstore-main/src/lib/checkoutPricingService.ts`](Bzeadstore-main/src/lib/checkoutPricingService.ts) — function `buildPricing` (~line 430–960).

### Step 1 — Pick the source unit price
Per item, priority order (highest wins):

1. **Country-specific override**
   `product_country_selling_prices.selling_price`
   WHERE `product_id = item.productId`
     AND `country_id = destinationCountryId`
     AND `(variant_id IS NULL OR variant_id = item.variantId)`
   → stored into `markupPriceByProductId`.
2. **Rate-card / RPC fallback** (`get_country_markup_prices` RPC)
   Returns a per-country selling price computed off the base.
3. **Base price**
   `products.price` (i.e. `item.unitPrice` from the cart).

### Step 2 — Determine the source currency

```ts
const sourceCurrency = hasMarkupPrice
  ? productCurrencyByProductId.get(item.productId)   // = products.currency
  : (item.currency || 'INR').toUpperCase();
```

> **Important**: the per-country `selling_price` is treated as being in the
> **product's source currency** (i.e. `products.currency` — typically `INR`),
> not in the destination country's currency. The destination currency only
> comes in via FX conversion in Step 3.

### Step 3 — Convert to buyer (target) currency

```ts
const convertedUnitPrice  = roundTo2(convertAmount(sourceUnitPrice, sourceCurrency, targetCurrency, input.rates));
const convertedLineTotal  = roundTo2(convertAmount(sourceUnitPrice * qty, sourceCurrency, targetCurrency, input.rates));
```

`targetCurrency` = buyer's display currency (e.g. `GBP`).
`input.rates` = exchange-rates map (`utils/currency.ts`, `fetchExchangeRates`).

### Step 4 — Subtotal & platform fee

```text
subtotal           = Σ convertedLineTotal
offer_discount     = Σ convertedOfferDiscount       (per-item: special_day, bundle, BxGy)
shipping_charge    = Σ convertedShippingTotal       (Shiprocket / Shippo / rate card)
platform_fee_rate  = 0.03                            (Checkout.tsx)
platform_fee       = round((subtotal − offer_discount + shipping_charge) × 0.03, 2)
total_amount       = subtotal − offer_discount + shipping_charge + platform_fee
```

### Step 5 — Seller-side numbers (locked at order time)

```text
seller_currency           = products.currency for the seller (typically INR)
buyer_to_seller_fx_rate   = rate snapshot used to convert buyer → seller currency
seller_items_subtotal     = Σ seller_line_total                    (seller ccy)
seller_payout_total       = seller_items_subtotal − platform cut   (seller ccy)
platform_markup_total_inr = total markup margin booked, in INR
fx_locked_at              = now()
```

---

## 3. Worked example — order `ORD-1779833529-f55d1dd5`

Buyer: UK shopper. Destination country = `GB`. Buyer currency = `GBP`.
Seller: India. Seller currency = `INR`.

### From `products` and `product_country_selling_prices` (GB):

| Product | `products.price` (INR) | `markup_percent` | `selling_price` (per row, no FX applied) |
|---|---:|---:|---:|
| MARS Cover Rangers | 540.00 | 35.0000 | 729.00 |
| Dot & Key Watermelon Sunscreen | 440.00 | 45.0000 | 638.00 |
| Dr. Sheth's Kesar & Kojic | 340.00 | 45.0000 | 493.00 |
| MILA Beauté GLOSSGirl | 299.00 | 60.0000 | 478.40 |
| BLOCKS PLAY & LEARN | 250.00 | (no GB row) | — |
| L'Oréal Hyaluron Duo | 500.00 | 65.0000 | 825.00 |
| Dot & Key Lip Balm | 245.00 | 60.0000 | 392.00 |

Note: `selling_price = price × (1 + markup_percent / 100)` — verified:
540 × 1.35 = 729.00, 440 × 1.45 = 638.00, 299 × 1.60 = 478.40, 500 × 1.65 = 825.00, etc.

### `order_items` (stored at order time, currency labels copied from order):

| Item | `customer_unit_price` | `customer_line_total` | `buyer_currency` | `seller_currency` |
|---|---:|---:|---|---|
| MARS | 729.00 | 729.00 | GBP | INR |
| Sunscreen | 638.00 | 638.00 | GBP | INR |
| Dr. Sheth's | 493.00 | 493.00 | GBP | INR |
| MILA | 478.40 | 478.40 | GBP | INR |
| BLOCKS | 250.00 | 250.00 | GBP | INR |
| L'Oréal | 825.00 | 825.00 | GBP | INR |
| Lip Balm | 392.00 | 392.00 | GBP | INR |

Sum = **3,805.40** = `orders.product_subtotal`.
Fee = 3,805.40 × 0.03 = **114.16** = `orders.platform_fee`.
Total = **3,919.56** = `orders.total_amount`. ✓ internally consistent.

### What Stripe actually captured (truth):

From `stripe_webhook_events.payload` and `payment_intents`:

```
amount          = 2958     (minor units)
amount_received = 2958
currency        = "gbp"
```

→ Stripe charged the buyer **£29.58 GBP**, not £3,919.56.

### Seller-side reconciliation:

```
seller_items_subtotal      = 2614.00 INR   (= sum of products.price: 540+440+340+299+250+500+245)
seller_payout_total        =  2378.74 INR
buyer_to_seller_fx_rate    =   128.67269537   (stored)
platform_markup_total_inr  = 501726.35
stripe_fee                 =     0.64 GBP
```

Reality check — implied buyer→seller FX from the actual Stripe charge:
`2614 INR / £29.58 ≈ 88.4 INR/GBP` (matches real-world GBP→INR).
But `orders.buyer_to_seller_fx_rate` says **128.67** (≠ reality).

---

## 4. The bug observed on this order

| Side | Number | Status |
|---|---|---|
| Stripe charge | £29.58 | ✅ matches `seller_items_subtotal / real_FX` |
| `orders.total_amount` | £3,919.56 | ❌ ~133× too high |
| `orders.product_subtotal` | £3,805.40 | ❌ inflated |
| `orders.platform_fee` | £114.16 | ❌ derived from inflated subtotal |
| `orders.buyer_to_seller_fx_rate` | 128.67 | ❌ fabricated |
| `orders.seller_items_subtotal` (INR) | 2,614.00 | ✅ correct (real FX) |
| `orders.seller_payout_total` (INR) | 2,378.74 | ✅ plausible |
| Admin orders page display | £3,919.56 | ❌ shows inflated DB value |
| Buyer invoice PDF | GBP 3,919.56 | ❌ shows inflated DB value |

### Root cause
In **Step 2** above, when a per-country override exists in
`product_country_selling_prices`, the code labels it with
`products.currency` (= `INR`) and then converts INR → GBP via FX.
That produces the *correct* £29.58 charge that Stripe captured.

But **`order_items.customer_unit_price` / `customer_line_total`** and
**`orders.product_subtotal` / `total_amount`** were written using the
*pre-conversion* number (e.g. `729`) **labeled as the buyer currency
(`GBP`)** instead of the converted value (~£8.28). So:

- ✅ Stripe was given the FX-converted minor-unit amount → correct charge.
- ❌ The persisted order records skipped the FX step on the customer side,
  so they read `INR value × (1 + markup%)` with a `GBP` label.

### Why prior orders look fine
| Order | Date | `product_subtotal` | `seller_items_subtotal / fx_rate` | Match? |
|---|---|---:|---:|---|
| ORD-…-7748cafb | 2026-05-14 | £5.02 | 457 / 129.50 ≈ 3.53 | within FX/markup tolerance ✓ |
| ORD-…-0112c866 | 2026-05-14 | £2.02 | 169 / 129.50 ≈ 1.30 | ✓ |
| ORD-…-ba1a7bca | 2026-05-14 | €20.00 | 1411 / 112.23 ≈ 12.57 | ✓ |
| ORD-…-0c669b00 | 2026-05-21 | £0.75 | 56 / 129.95 ≈ 0.43 | ✓ |
| **ORD-…-f55d1dd5** | **2026-05-26** | **£3,805.40** | **2614 / 128.67 ≈ 20.32** | **✗ ~187× off** |

Something in the price-write path changed between 2026-05-21 and 2026-05-26
that caused order #1 to persist unconverted numbers. Likely culprits to
inspect: the RPC behind order insertion, recent edits to `orderService.ts`
/ `checkoutPricingService.ts`, and any change to how
`customer_unit_price` is sourced (it may now be reading `markupPrice`
directly instead of the FX-converted `convertedUnitPrice`).

---

## 5. Where each number is set in code

| Value | Producer |
|---|---|
| `markupPriceByProductId` (per-country override) | `checkoutPricingService.ts` lines ~530–545 |
| `sourceUnitPrice` selection | `checkoutPricingService.ts` lines ~863–871 |
| FX conversion → buyer currency | `convertAmount(...)` from `utils/currency.ts`, called lines ~951–954 |
| Platform fee 3% | `pages/user/Checkout.tsx` line ~34 |
| Invoice PDF rendering & currency symbol | `utils/invoicePdf.ts` (`formatAmountForPdf`) |
| Order write (persists `customer_unit_price`, totals, FX, seller amounts) | `lib/orderService.ts` + Supabase RPC `create_order_*` (server-side) |
| Stripe PI amount → minor units | Stripe edge function (see `supabase/functions/`) |

---

## 6. Verification queries (paste into psql)

```sql
-- last order summary
select id, order_number, currency, product_subtotal, platform_fee, total_amount,
       seller_currency, seller_items_subtotal, seller_payout_total, buyer_to_seller_fx_rate
from orders order by created_at desc limit 1;

-- order items vs product base price & markup
with gb as (select id from countries where iso2='GB')
select oi.product_name, p.price as base_inr, p.currency as base_ccy,
       pcsp.markup_percent, pcsp.selling_price as gb_selling,
       oi.customer_unit_price, oi.customer_line_total, oi.buyer_currency
from order_items oi
join products p on p.id = oi.product_id
left join product_country_selling_prices pcsp
       on pcsp.product_id = oi.product_id
      and pcsp.country_id = (select id from gb)
      and (pcsp.variant_id is null or pcsp.variant_id = oi.variant_id)
where oi.order_id = '<order_uuid>'
order by oi.created_at;

-- truth: what Stripe actually charged
select stripe_payment_intent_id, amount, currency, status
from payment_intents
where order_id = '<order_uuid>';

-- webhook payload (definitive)
select payload->'data'->'object'->>'amount'          as minor_units,
       payload->'data'->'object'->>'amount_received' as captured_minor,
       payload->'data'->'object'->>'currency'        as ccy
from stripe_webhook_events
where payment_intent_id = '<pi_xxx>';
```

---

## 7. Rules going forward (do not violate)

1. **Stripe is truth.** For any "was the buyer charged X" question, read
   `payment_intents.amount` / the webhook payload (minor units) before
   trusting `orders.total_amount`.
2. **Buyer side must FX-convert.** Per-country `selling_price` is stored in
   the product's source currency; it must be passed through
   `convertAmount(...)` into the buyer's currency before being persisted as
   `customer_unit_price` / `customer_line_total`.
3. **Seller side must lock FX.** `seller_*` columns must use the locked
   rate at `fx_locked_at`. Don't recompute them from the buyer side after
   the fact.
4. **Currency symbol vs code in PDFs.** The default jsPDF font (WinAnsi)
   supports `£ € $ ¥ ¢`. `₹` is not in WinAnsi — fall back to the ISO code
   for currencies whose symbols can't be drawn. See `formatAmountForPdf`
   in `utils/invoicePdf.ts`.
