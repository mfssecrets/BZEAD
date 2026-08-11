import React from 'react';

/**
 * Seller auth-page header.
 *
 * The seller Android app's landing and login pages must have NO header
 * and NO bottom nav, so this component always renders nothing. Kept
 * (rather than removed) so the existing imports in SellerLogin,
 * SellerSignup and SellerForgotPassword continue to compile untouched.
 * The web build never rendered anything here either, so this is a
 * no-op for bzead.com.
 */
export const SellerAuthHeader: React.FC = () => null;

export default SellerAuthHeader;
