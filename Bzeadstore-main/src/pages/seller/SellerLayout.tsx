/**
 * SellerLayout.tsx
 * ────────────────
 * Shared layout shell for ALL seller sub-pages.
 * Provides: fixed header, sidebar nav, footer, logout dialog, nav-loading overlay.
 *
 * Sub-pages render inside <main> via `children`.
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard, Package, ShoppingBag,
  MapPin, Settings, LogOut, Bell, Wallet, User,
  X, Loader2, Menu, BookOpen, HelpCircle,
} from 'lucide-react';
import NotificationBell from '../../components/common/NotificationBell';
import { logger } from '../../utils/logger';
import { getSellerKYCStatus } from '../../lib/kycService';

/* ─── types ─── */

interface SellerLayoutProps {
  children: React.ReactNode;
  /** Extra className on <main> wrapper (e.g. "bg-gray-50") */
  mainClassName?: string;
  /** If provided, skip internal KYC fetch and use this value */
  isVerified?: boolean;
}

/* ─── component ─── */

const SellerLayout: React.FC<SellerLayoutProps> = ({ children, mainClassName, isVerified: isVerifiedProp }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user, currentAuthUser } = useAuth();

  const sellerId = user?.id || currentAuthUser?.userId || '';
  const sellerEmail = user?.email || currentAuthUser?.email || currentAuthUser?.attributes?.email || '';
  const sellerFullName = user?.full_name || currentAuthUser?.attributes?.name || 'Seller';

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isVerifiedLocal, setIsVerifiedLocal] = useState(false);

  const isVerified = isVerifiedProp ?? isVerifiedLocal;

  // Fetch verification status once (skip if parent already provided it)
  useEffect(() => {
    if (isVerifiedProp !== undefined || !sellerId) return;
    (async () => {
      try {
        const { kycData } = await getSellerKYCStatus(sellerId);
        if (kycData && kycData.kyc_status === 'approved') setIsVerifiedLocal(true);
      } catch { /* ignore */ }
    })();
  }, [sellerId, isVerifiedProp]);

  // Reset navigation loading on route change
  useEffect(() => { setIsNavigating(false); }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!isNavigating) return;
    const t = setTimeout(() => setIsNavigating(false), 2000);
    return () => clearTimeout(t);
  }, [isNavigating]);

  const handleLogoutConfirm = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      navigate('/seller');
    } catch (err) {
      logger.error(err as Error, { context: 'SellerLayout logout error' });
      setIsLoggingOut(false);
    }
  };

  const go = (path: string) => {
    setShowMobileMenu(false);
    const currentFull = location.pathname + location.hash;
    if (path === currentFull) return;
    // Hash-based navigation (e.g. /seller/dashboard#profile)
    if (path.includes('#')) {
      const [pathname] = path.split('#');
      if (location.pathname === pathname) {
        // Same page, just change hash — no loading overlay needed
        navigate(path, { replace: true });
        return;
      }
    }
    // Navigating to plain /seller/dashboard clears hash
    if (path === '/seller/dashboard' && location.pathname === '/seller/dashboard' && location.hash) {
      navigate('/seller/dashboard', { replace: true });
      return;
    }
    setIsNavigating(true);
    navigate(path);
  };

  const isActive = (path: string) => {
    if (path.includes('#')) {
      const [pathname, hash] = path.split('#');
      return location.pathname === pathname && location.hash === `#${hash}`;
    }
    // Dashboard (no hash) is active only when there's no hash
    if (path === '/seller/dashboard') {
      return location.pathname === path && !location.hash;
    }
    return location.pathname === path;
  };

  /* ── sidebar nav items ── */
  const navItems: { icon: React.ReactNode; label: string; path: string; disabled?: boolean; badge?: string }[] = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/seller/dashboard' },
    { icon: <User size={20} />, label: 'Profile', path: '/seller/dashboard#profile' },
    { icon: <MapPin size={20} />, label: 'Warehouse', path: '/seller/warehouse' },
    { icon: <Package size={20} />, label: 'Products', path: '/seller/products', disabled: !isVerified },
    { icon: <ShoppingBag size={20} />, label: 'Orders', path: '/seller/orders', disabled: !isVerified },
    { icon: <Wallet size={20} />, label: 'Wallet & Payouts', path: '/seller/wallet', disabled: !isVerified },
    { icon: <Bell size={20} />, label: 'Notifications', path: '/seller/notifications' },
    { icon: <Settings size={20} />, label: 'Settings', path: '/seller/dashboard#settings' },
    { icon: <BookOpen size={20} />, label: 'Tutorial', path: '/seller/tutorial' },
    { icon: <HelpCircle size={20} />, label: 'Help', path: '/seller/help' },
  ];

  return (
    <div className="relative flex min-h-screen bg-gray-100 overflow-x-hidden">

      {/* ── Desktop sidebar rail ──
         The actual <aside> is `lg:sticky` with a viewport-bound height so the
         nav stays in view while scrolling. On tall pages that leaves a gap
         between the sidebar and the footer. This decorative stripe paints the
         same dark gradient down the full height of the layout column so the
         sidebar visually extends all the way to the footer. Hidden on mobile
         (the drawer handles its own background). */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute left-0 top-0 bottom-0 w-64 pointer-events-none z-0"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e3a5f 100%)' }}
      />

      {/* ── Mobile overlay ── */}
      {showMobileMenu && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setShowMobileMenu(false)} />
      )}

      {/* ── Sidebar ──
         Tailwind classes match the original web layout exactly. On native,
         `body.native-app aside[data-native-safe-area="sidebar"]` in
         index.css extends `top` + `height` to clear the status-bar inset. */}
      <aside
        data-native-safe-area="sidebar"
        className={`fixed left-0 top-12 sm:top-14 w-64 h-[calc(100vh-3rem)] sm:h-[calc(100vh-3.5rem)] overflow-y-auto transition-transform duration-300 z-40 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
          showMobileMenu ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e3a5f 100%)' }}
      >
        <div className="lg:hidden p-4 border-b border-white/10">
          <button onClick={() => setShowMobileMenu(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.label}>
                <button
                  onClick={() => !item.disabled && go(item.path)}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-left ${
                    item.disabled
                      ? 'text-white/20 cursor-not-allowed'
                      : isActive(item.path)
                        ? 'bg-white/15 text-white font-semibold shadow-lg shadow-black/10'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 font-medium text-sm">{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            ))}
            <li className="border-t border-white/10 pt-2 mt-2">
              <button
                onClick={() => { setShowMobileMenu(false); setShowLogoutDialog(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-all text-left"
              >
                <LogOut size={20} />
                <span className="flex-1 font-medium text-sm">Sign Out</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0 w-full">

        {/* Logout Dialog */}
        {showLogoutDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => !isLoggingOut && setShowLogoutDialog(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Sign Out</h2>
                <button onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={20} /></button>
              </div>
              <p className="text-gray-500 text-sm mb-6">Are you sure you want to end your seller session?</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleLogoutConfirm} disabled={isLoggingOut} data-no-global-confirm="true" className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 min-w-[110px] justify-center">
                  {isLoggingOut ? (<><Loader2 size={14} className="animate-spin" /> Signing out...</>) : (<><LogOut size={14} /> Sign Out</>)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation loading overlay */}
        {isNavigating && (
          <div className="fixed inset-0 z-[90] bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-900" />
          </div>
        )}

        {/* ── Fixed Top Header ──
           Outer <header> stays exactly 0-padded on web. On native,
           `body.native-app header.fixed` in index.css adds
           padding-top: env(safe-area-inset-top) so the status bar gets a
           gradient backdrop and the inner h-12 row stays fully visible. */}
        <header
          className="fixed top-0 left-0 right-0 z-50 shadow-lg"
          style={{ background: 'linear-gradient(90deg, #0f172a 0%, #1e3a5f 100%)' }}
        >
          <div data-native-shrink="header" className="h-12 sm:h-14 flex items-center justify-between px-3 sm:px-6">
            <button
              onClick={() => setShowMobileMenu(true)}
              className="lg:hidden p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
            <div className="flex-1 flex items-center justify-center">
              <img
                src="/images/logo/logo.png"
                alt="BZEAD"
                className="h-7 sm:h-8 w-auto object-contain select-none"
                draggable={false}
              />
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex flex-col text-right text-xs leading-tight">
                <span className="font-semibold text-white">{sellerFullName}</span>
                <span className="text-blue-200">{sellerEmail}</span>
              </div>
              <NotificationBell onNavigate={(view: string) => go(view === 'seller-notifications' ? '/seller/notifications' : '/seller/dashboard')} variant="light" />
              <button
                onClick={() => setShowLogoutDialog(true)}
                disabled={isLoggingOut}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 text-white"
                aria-label="Logout"
                data-no-global-confirm="true"
              >
                {isLoggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              </button>
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        {/* NOTE: do NOT use overflow-y-auto here. The sidebar uses `lg:sticky top-16`
            which only works correctly when the document/body is the scroll container.
            A local scroll on <main> previously caused the sidebar to "end" while
            page content kept scrolling. */}
        <main
          data-native-safe-area="main"
          className={`flex-1 pt-12 sm:pt-14 pb-16 lg:pb-4 min-w-0 overflow-x-hidden ${mainClassName || ''}`}
        >
          <div className="px-2 py-2 sm:px-4 sm:py-4 md:px-6 max-w-7xl mx-auto w-full min-w-0">
            {children}
          </div>
        </main>

        {/* ── Mobile Bottom Nav (fixed) ──
           Outer <nav> stays 0-padded on web. On native, the rule
           `body.native-app nav.fixed.bottom-0` in index.css adds
           padding-bottom: env(safe-area-inset-bottom) so the gesture bar
           never overlaps the tap targets. Inner row keeps the 56-px hit
           target unchanged on web. */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] z-50"
          aria-label="Seller bottom navigation"
        >
          <div data-native-shrink="nav" className="h-14 flex items-stretch justify-around">
          {[
            { icon: <LayoutDashboard size={18} />, label: 'Home', path: '/seller/dashboard' },
            { icon: <ShoppingBag size={18} />, label: 'Orders', path: '/seller/orders', disabled: !isVerified },
            { icon: <Package size={18} />, label: 'Products', path: '/seller/products', disabled: !isVerified },
            { icon: <Wallet size={18} />, label: 'Wallet', path: '/seller/wallet', disabled: !isVerified },
            { icon: <HelpCircle size={18} />, label: 'Help', path: '/seller/help' },
          ].map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.label}
                onClick={() => !item.disabled && go(item.path)}
                disabled={item.disabled}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  item.disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : active
                      ? 'text-blue-700'
                      : 'text-gray-500 hover:text-blue-700'
                }`}
                aria-label={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
          </div>
        </nav>

        {/* ── Footer ── */}
        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4">
            <p className="text-xs text-gray-400 text-center">&copy; {new Date().getFullYear()} Beauzead Ltd. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SellerLayout;
