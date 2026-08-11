import React from 'react';
import { useNavigate } from 'react-router-dom';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { AUTH_LOGO_SRC } from '../../components/auth/AuthBrandMark';

/**
 * Native-only welcome / splash landing page for the Bzead Seller Android app.
 *
 * Shows the BZEAD logo on a dark gradient with a single "Get Started"
 * button that navigates to /seller/login. NO header. NO bottom nav.
 *
 * On the web build this component renders nothing — the public web
 * marketing landing at /seller is served by `SellerLanding.tsx` and
 * remains untouched. This page is only mounted in the seller-app bundle
 * at the dedicated route /seller/welcome.
 */
export const SellerNativeLanding: React.FC = () => {
  const navigate = useNavigate();

  // Safety net — the route is only registered in the seller-app build,
  // but if anything ever lands here on plain web, send the user to the
  // real public landing rather than rendering this minimal screen.
  if (!isNativePlatform) {
    if (typeof window !== 'undefined') {
      window.location.replace('/seller');
    }
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between text-white"
      style={{
        background:
          'linear-gradient(160deg, #0b1f5f 0%, #12307a 48%, #1d4b8f 100%)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Top spacer */}
      <div className="h-4" aria-hidden="true" />

      {/* Logo + tagline */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <img
          src={AUTH_LOGO_SRC}
          alt="BZEAD"
          className="h-16 sm:h-20 w-auto max-w-[min(100%,280px)] object-contain select-none drop-shadow-lg"
          draggable={false}
        />
        <p className="mt-6 text-base font-semibold tracking-wide text-amber-300">
          Bzead Seller
        </p>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-blue-100/80">
          Grow your business with BZEAD. Manage your products, orders and
          payouts — all from your phone.
        </p>
      </div>

      {/* Get Started button */}
      <div className="w-full px-6">
        <button
          type="button"
          onClick={() => navigate('/seller/login')}
          className="block w-full rounded-xl bg-amber-400 px-6 py-4 text-base font-bold text-blue-950 shadow-lg shadow-amber-400/25 active:scale-[0.98] transition-transform"
        >
          Get Started
        </button>
      </div>
    </div>
  );
};

export default SellerNativeLanding;
