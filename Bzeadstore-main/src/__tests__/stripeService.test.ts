import { describe, it, expect } from 'vitest';
import { toStripeAmount, fromStripeAmount } from '../lib/stripeService';

describe('toStripeAmount', () => {
  it('converts USD dollars to cents', () => {
    expect(toStripeAmount(10.50, 'USD')).toBe(1050);
  });

  it('converts INR to paise', () => {
    expect(toStripeAmount(499.99, 'INR')).toBe(49999);
  });

  it('handles zero-decimal currency (JPY)', () => {
    expect(toStripeAmount(1000, 'JPY')).toBe(1000);
  });

  it('handles zero-decimal currency (KRW)', () => {
    expect(toStripeAmount(5000, 'KRW')).toBe(5000);
  });

  it('rounds to nearest integer', () => {
    expect(toStripeAmount(10.555, 'USD')).toBe(1056);
  });

  it('handles zero amount', () => {
    expect(toStripeAmount(0, 'USD')).toBe(0);
  });

  it('is case-insensitive for currency', () => {
    expect(toStripeAmount(10, 'usd')).toBe(1000);
    expect(toStripeAmount(10, 'Usd')).toBe(1000);
  });
});

describe('fromStripeAmount', () => {
  it('converts cents back to USD', () => {
    expect(fromStripeAmount(1050, 'USD')).toBe(10.50);
  });

  it('converts paise back to INR', () => {
    expect(fromStripeAmount(49999, 'INR')).toBe(499.99);
  });

  it('handles zero-decimal currency (JPY)', () => {
    expect(fromStripeAmount(1000, 'JPY')).toBe(1000);
  });

  it('round-trips correctly', () => {
    const original = 99.99;
    const stripe = toStripeAmount(original, 'EUR');
    const back = fromStripeAmount(stripe, 'EUR');
    expect(back).toBe(original);
  });
});
