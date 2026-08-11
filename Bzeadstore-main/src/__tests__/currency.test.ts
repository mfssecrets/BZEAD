import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  convertAmount,
  formatCurrency,
  currencyForCountry,
  fetchExchangeRates,
  isExchangeRateUnavailable,
} from '../utils/currency';

// Mock supabase so DB queries fail immediately (no real network calls in tests)
vi.mock('../lib/supabase', () => {
  const makeBuilder = (): any => {
    const p = Promise.resolve({ data: null, error: { message: 'DB unavailable in tests' } });
    return Object.assign(p, {
      select: () => makeBuilder(),
      eq: () => makeBuilder(),
      not: () => makeBuilder(),
    });
  };
  return { supabase: { from: () => makeBuilder() } };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── convertAmount ─────────────────────────────────────────────────────
describe('convertAmount', () => {
  const rates = { USD: 1, INR: 83.5, EUR: 0.92, GBP: 0.79, JPY: 149.5 };

  it('returns same amount when currencies match', () => {
    expect(convertAmount(100, 'USD', 'USD', rates)).toBe(100);
  });

  it('converts USD to INR', () => {
    const result = convertAmount(10, 'USD', 'INR', rates);
    expect(result).toBe(835);
  });

  it('converts INR to USD', () => {
    const result = convertAmount(835, 'INR', 'USD', rates);
    expect(result).toBe(10);
  });

  it('converts between two non-USD currencies via USD', () => {
    const result = convertAmount(100, 'EUR', 'GBP', rates);
    // 100 EUR → USD = 100 / 0.92 ≈ 108.70, → GBP = 108.70 * 0.79 ≈ 85.87
    expect(result).toBeCloseTo(85.87, 1);
  });

  it('returns original amount if "from" rate is missing', () => {
    expect(convertAmount(100, 'XXX', 'USD', rates)).toBe(100);
  });

  it('returns original amount if "to" rate is missing', () => {
    expect(convertAmount(100, 'USD', 'XXX', rates)).toBe(100);
  });

  it('handles zero amount', () => {
    expect(convertAmount(0, 'USD', 'INR', rates)).toBe(0);
  });
});

// ── formatCurrency ────────────────────────────────────────────────────
describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    const result = formatCurrency(10.5, 'USD');
    expect(result).toContain('10.50');
    expect(result).toContain('$');
  });

  it('formats INR correctly', () => {
    const result = formatCurrency(1000, 'INR');
    expect(result).toContain('₹');
  });

  it('formats JPY without decimals', () => {
    const result = formatCurrency(1000, 'JPY');
    expect(result).toContain('1,000');
    expect(result).not.toContain('.00');
  });

  it('handles invalid currency gracefully', () => {
    const result = formatCurrency(50, 'ZZZZ');
    expect(result).toContain('50');
  });
});

// ── currencyForCountry ────────────────────────────────────────────────
describe('currencyForCountry', () => {
  it('returns INR for country tokens in sync mode', () => {
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('GB')).toBe('INR');
    expect(currencyForCountry('ZZ')).toBe('INR');
  });

  it('returns INR for empty string', () => {
    expect(currencyForCountry('')).toBe('INR');
  });

  it('returns the currency code if already a valid currency', () => {
    expect(currencyForCountry('USD')).toBe('USD');
    expect(currencyForCountry('EUR')).toBe('EUR');
    expect(currencyForCountry('gbp')).toBe('GBP');
  });
});

describe('exchange rate availability', () => {
  it('reports unavailable when all rate sources are unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const rates = await fetchExchangeRates();

    // No hardcoded fallback — returns empty object when all sources fail
    expect(Object.keys(rates).length).toBe(0);
    expect(isExchangeRateUnavailable()).toBe(true);
  });
});
