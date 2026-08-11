import { supabase } from './supabase';

export interface PublicProductPrice {
  productId: string;
  sellingPrice: number;
  publicUnitPrice: number;
  markupMrp: number;
}

export interface CheckoutPricingItem {
  productId: string;
  quantity: number;
  sellingPrice: number;
  publicUnitPrice: number;
  lineTotal: number;
}

export interface CheckoutIneligibleItem {
  productId: string;
  availableCountries: string[];
}

export interface CheckoutPricingResult {
  baseSubtotal: number;
  buyerProductSubtotal: number;
  platformHandlingCharge: number;
  shipping: number;
  total: number;
  items: CheckoutPricingItem[];
  ineligibleItems: CheckoutIneligibleItem[];
}

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export async function fetchPublicProductPrices(
  productIds: string[],
  country?: string | null,
  priceOverrides?: Record<string, number>,
) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length === 0) {
    return { data: [] as PublicProductPrice[], error: null as string | null };
  }

  const hasOverrides = Boolean(
    priceOverrides
    && Object.keys(priceOverrides).length > 0
    && Object.values(priceOverrides).some((value) => Number.isFinite(Number(value)) && Number(value) > 0)
  );

  const rpcName = hasOverrides
    ? 'get_public_product_prices_with_overrides'
    : 'get_public_product_prices';

  const rpcPayload: Record<string, unknown> = {
    p_product_ids: uniqueProductIds,
    p_country: country || null,
  };

  if (hasOverrides) {
    rpcPayload.p_price_overrides = priceOverrides;
  }

  const { data, error } = await supabase.rpc(rpcName, rpcPayload);

  if (error) {
    const message = error.message || 'Failed to fetch public product prices.';
    return { data: [] as PublicProductPrice[], error: message };
  }

  const parsed = ((data || []) as any[]).map((row) => ({
    productId: String(row.product_id),
    sellingPrice: toNumber(row.selling_price),
    publicUnitPrice: toNumber(row.selling_price),
    markupMrp: toNumber(row.markup_mrp),
  }));

  return { data: parsed, error: null as string | null };
}

export async function calculateCheckoutPricing(items: Array<{ productId: string; quantity: number }>, country?: string | null) {
  const payload = items
    .filter((item) => item.productId && item.quantity > 0)
    .map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }));

  if (payload.length === 0) {
    return {
      data: {
        baseSubtotal: 0,
        buyerProductSubtotal: 0,
        platformHandlingCharge: 0,
        shipping: 0,
        total: 0,
        items: [],
        ineligibleItems: [],
      } as CheckoutPricingResult,
      error: null as string | null,
    };
  }

  const { data, error } = await supabase.rpc('calculate_checkout_pricing', {
    p_items: payload,
    p_country: country || null,
  });

  if (error) {
    return { data: null as CheckoutPricingResult | null, error: error.message || 'Failed to calculate checkout pricing.' };
  }

  const raw = data as any;
  const baseSubtotal = toNumber(raw?.base_subtotal);
  const platformHandlingCharge = toNumber(raw?.platform_commission_charge ?? raw?.platform_handling_charge);
  const shipping = toNumber(raw?.shipping);
  const parsed: CheckoutPricingResult = {
    baseSubtotal,
    buyerProductSubtotal: baseSubtotal,
    platformHandlingCharge,
    shipping,
    total: baseSubtotal + platformHandlingCharge + shipping,
    items: ((raw?.items || []) as any[]).map((item) => ({
      productId: String(item.product_id),
      quantity: toNumber(item.quantity),
      sellingPrice: toNumber(item.selling_price),
      publicUnitPrice: toNumber(item.selling_price),
      lineTotal: toNumber(item.selling_price) * toNumber(item.quantity),
    })),
    ineligibleItems: ((raw?.ineligible_items || []) as any[]).map((item) => ({
      productId: String(item.product_id || ''),
      availableCountries: Array.isArray(item.available_countries)
        ? item.available_countries.map((country: unknown) => String(country || '').trim()).filter(Boolean)
        : [],
    })),
  };

  return { data: parsed, error: null as string | null };
}
