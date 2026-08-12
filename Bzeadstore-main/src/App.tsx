import { lazy, Suspense, useEffect, useState, useTransition, createContext, useContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageSkeleton } from './components/common/Skeleton';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { WishlistProvider } from './contexts/WishlistContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { useWishlistSync } from './hooks/useWishlistSync';
import { GlobalActionConfirmation } from './components/common/GlobalActionConfirmation';
import ErrorBoundary from './components/ErrorBoundary';
import { OfflineScreen, useOnlineStatus } from './components/OfflineScreen';
import {
  NativePullToRefreshIndicator,
  useNativeBackButton,
  useNativePagePersist,
  useNativePullToRefresh,
} from './mobile/nativeRuntime';
import { openExternalUrl } from './mobile/externalLinks';
import { BzeadHomePage } from './pages/BzeadHomePage';
import { FloatingCartShortcut } from './components/layout/FloatingCartShortcut';

// ── Buyer-app / Seller-app mode guards ──────────────────────────────────
// When built with VITE_APP_MODE=buyer, seller/admin routes and their lazy
// chunks are excluded entirely. When VITE_APP_MODE=seller, the seller +
// admin surfaces are primary and buyer-only heavy chunks (cart, checkout,
// product details, wishlist, home page, etc.) are stubbed out.
// The main web build is unaffected (env var is undefined → both flags false).
const isBuyerApp = import.meta.env.VITE_APP_MODE === 'buyer';
const isSellerApp = import.meta.env.VITE_APP_MODE === 'seller';

// ── Navigation loading context ─────────────────────────────────────────
// Exposes startNavigation (wraps navigate in startTransition) so React 19
// keeps showing the current page while the lazy chunk loads, and isPending
// drives the global progress bar.
interface AppNavigationCtx {
  isPending: boolean;
  startNavigation: (fn: () => void) => void;
}
const AppNavigationContext = createContext<AppNavigationCtx>({
  isPending: false,
  startNavigation: (fn) => fn(),
});
export const useAppNavigation = () => useContext(AppNavigationContext);

const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPending, startTransition] = useTransition();
  const startNavigation = useCallback((fn: () => void) => startTransition(fn), []);
  return (
    <AppNavigationContext.Provider value={{ isPending, startNavigation }}>
      {children}
    </AppNavigationContext.Provider>
  );
};

// ── Retry wrapper for lazy imports (handles chunk-load failures after deploys) ──
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
): React.LazyExoticComponent<T['default']> {
  return lazy(() =>
    factory().catch(() =>
      // First retry after a short delay
      new Promise<T>((resolve) => setTimeout(resolve, 1500)).then(() =>
        factory().catch(() => {
          // Final retry failed — force reload to get fresh chunks
          const reloadKey = 'bzead_chunk_reload';
          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, Date.now().toString());
            window.location.reload();
          }
          // Return a minimal fallback so the promise chain resolves
          return factory();
        })
      )
    )
  );
}

// ── Lazy-loaded page components (code-splitting) ──────────────────────
// Named-only exports use .then() wrapper; default exports load directly.

// Stubs for dead-code elimination across both single-purpose app builds.
// When `isBuyerApp` is `true` (VITE_APP_MODE=buyer), the dynamic `import()`
// branches below become statically unreachable and Rollup drops the chunks.
// `sellerStub` is the symmetric stub for seller-app mode (buyer-only chunks).
const buyerStub = () =>
  Promise.resolve({ default: (() => null) as unknown as React.ComponentType<any> });
const sellerStub = buyerStub;

// Auth
const Login = lazyRetry(isSellerApp ? sellerStub : () => import('./components/auth/Login').then(m => ({ default: m.Login })));
const Signup = lazyRetry(isSellerApp ? sellerStub : () => import('./components/auth/Signup').then(m => ({ default: m.Signup })));

// User pages
const MyOrders = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/MyOrders').then(m => ({ default: m.MyOrders })));
const NotificationsPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/Notifications'));
const WishlistPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/Wishlist').then(m => ({ default: m.WishlistPage })));
const CartPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/Cart').then(m => ({ default: m.CartPage })));
const UserSettings = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/Settings').then(m => ({ default: m.UserSettings })));
const ForgotPassword = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/ForgotPassword'));
const Profile = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/Profile'));
const OrderDetails = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/OrderDetails'));
const WriteReview = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/WriteReview'));
const UserAddressManagement = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/AddressManagement'));
const Checkout = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/Checkout'));
const ShippingAddressPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/ShippingAddress'));
const OrderSummaryPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/OrderSummary'));
const OrderConfirmationPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/user/OrderConfirmation'));

// Seller pages — buyer build drops these via the `isBuyerApp` short-circuit.

const SellerDashboardWrapper = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerDashboardWrapper').then(m => ({ default: m.SellerDashboardWrapper })));
const SellerLanding = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerLanding').then(m => ({ default: m.SellerLanding })));
// Native-only welcome screen for the seller Android app (logo + Get Started).
// Loaded only in the seller-app bundle; web build skips the chunk entirely.
const SellerNativeLanding = lazyRetry(!isSellerApp ? buyerStub : () => import('./pages/seller/SellerNativeLanding').then(m => ({ default: m.SellerNativeLanding })));
const SellerSignup = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerSignup'));
const SellerLogin = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerLogin'));
const SellerForgotPassword = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerForgotPassword'));
const SellerProductListingWrapper = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerProductListingWrapper'));
const SellerOrderManagementWrapper = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerOrderManagementWrapper'));
const SellerWalletWrapper = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerWalletWrapper'));
const SellerVerificationWrapper = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerVerificationWrapper'));
const SellerNotificationsWrapper = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerNotificationsWrapper'));
const SellerTutorial = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerTutorial'));
const SellerHelp = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerHelp'));
const SellerLayout = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/SellerLayout'));
const WarehouseCreation = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/seller/WarehouseCreation'));

// Admin pages — same dead-code-elimination pattern.
const AdminLayout = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/AdminLayout'));
const AdminOverview = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/AdminOverview'));
const SellerManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/SellerManagement'));
const ProductManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/ProductManagement').then(m => ({ default: m.ProductManagement })));
const OrderManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/OrderManagement'));

const ComplaintManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/ComplaintManagement'));
const AccountsManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/AccountsManagement'));
const ReportsManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/ReportsManagement'));
const AdminManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/AdminManagement'));
const ProfilePage = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/ProfilePage'));
const SettingsPage = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/SettingsPage'));
const AdminNotificationsPage = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/NotificationsPage'));
const SellerKYCSubmissionManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/SellerKYCSubmissionManagement').then(m => ({ default: m.SellerKYCSubmissionManagement })));
const ProductVariantManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/ProductVariantManagement'));
const SponsoredProductsManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/SponsoredProductsManagement'));
const BannerManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/BannerManagement'));
const SearchManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/SearchManagement'));
const AuditLogs = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/AuditLogs'));
const SystemHealth = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/SystemHealth'));
const AdminAddressManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/components/AdminAddressManagement'));
const ShippingManagementPage = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/ShippingManagementPage'));
const CategoryManagement = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/CategoryManagement'));
const AdminSellerWarehouses = lazyRetry(isBuyerApp ? buyerStub : () => import('./pages/admin/modules/AdminSellerWarehouses'));


// Public pages
const ProductDetailsPage = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/ProductDetailsPage'));
const CategoryProducts = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/CategoryProducts').then(m => ({ default: m.CategoryProducts })));
const SectionProducts = lazyRetry(isSellerApp ? sellerStub : () => import('./pages/SectionProducts').then(m => ({ default: m.SectionProducts })));
const PrivacyPolicy = lazyRetry(() => import('./pages/PrivacyPolicy'));
const TermsService = lazyRetry(() => import('./pages/TermsService'));
const ShippingPolicy = lazyRetry(() => import('./pages/ShippingPolicy'));
const RefundPolicy = lazyRetry(() => import('./pages/RefundPolicy'));
const TermsAndConditions = lazyRetry(() => import('./pages/TermsAndConditions'));
const About = lazyRetry(() => import('./pages/About'));
const Contact = lazyRetry(() => import('./pages/Contact'));
const OTPVerification = lazyRetry(() => import('./pages/OTPVerification'));
const NewPassword = lazyRetry(() => import('./pages/NewPassword'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));

// ── Page loading fallback ─────────────────────────────────────────────
const PageLoader = () => <PageSkeleton variant="plain" />;

// ── Global navigation progress bar ────────────────────────────────────
// Shows during both lazy-chunk loading (via isPending from useTransition)
// and regular route changes (fallback timer keeps it visible long enough).
const NavigationProgress: React.FC = () => {
  const { isPending } = useAppNavigation();
  const location = useLocation();
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setTimerActive(true);
    const t = window.setTimeout(() => setTimerActive(false), 2000);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search, location.hash]);

  const visible = isPending || timerActive;
  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[1200] pointer-events-none">
      <div className="h-[3px] nav-progress-bar" />
    </div>
  );
};

const LegacySectionRedirect: React.FC<{ to: '/products/section/featured' | '/products/section/hot-deals' }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

/** Share link fallback — if the Amplify proxy doesn't intercept, redirect to product page */
const ShareRedirect: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/products/${slug}`} replace />;
};

/**
 * Buyer-app seller redirect — intercepts /seller/* routes in the buyer-only
 * Android app and opens the full web app in the system browser (Chrome
 * Custom Tab) instead of rendering seller pages inline.
 */
const ExternalSellerRedirect: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    void openExternalUrl('https://www.bzead.com/seller');
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
};

const NativeRuntimeGuard: React.FC<{ children: (refreshEpoch: number) => React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useNativeBackButton(location.pathname);
  useNativePagePersist(location.pathname);

  const handleRefresh = useCallback(async () => {
    setRefreshEpoch((prev) => prev + 1);
  }, []);

  const {
    enabled: pullEnabled,
    pullDistance,
    isRefreshing,
  } = useNativePullToRefresh({ onRefresh: handleRefresh });

  return (
    <>
      <NativePullToRefreshIndicator
        enabled={pullEnabled}
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />
      {children(refreshEpoch)}
    </>
  );
};

/** Root deep-link entrypoint used by share redirects (/?product=<slug>) */
const RootEntry: React.FC = () => {
  const location = useLocation();
  const { authRole } = useAuth();
  const productRef = new URLSearchParams(location.search).get('product')?.trim();

  if (productRef) {
    return <Navigate to={`/products/${encodeURIComponent(productRef)}`} replace />;
  }

  // Seller-app shell: there is no public storefront. Route by role.
  if (isSellerApp) {
    if (authRole === 'admin') return <Navigate to="/admin" replace />;
    if (authRole === 'seller') return <Navigate to="/seller/dashboard" replace />;
    // Unauthenticated guests land on the native welcome screen first;
    // tapping "Get Started" there navigates to /seller/login.
    return <Navigate to="/seller/welcome" replace />;
  }

  return <BzeadHomePage />;
};

// ═══════════════════════════════════════════════════════════════════════
// RouteGuard — strict role-based access control
//
// Guest:  Public pages only. Cart/wishlist/checkout → redirect to /login.
// User:   Public + user pages. Cannot access seller/admin dashboards.
// Seller: ONLY /seller/* protected pages. Everything else → /seller/dashboard.
// Admin:  ONLY /admin/* pages. Everything else → /admin.
// ═══════════════════════════════════════════════════════════════════════
const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authRole, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const [guardTimeoutReached, setGuardTimeoutReached] = useState(false);

  useEffect(() => {
    if (!loading) {
      setGuardTimeoutReached(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setGuardTimeoutReached(true);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const effectiveLoading = loading && !guardTimeoutReached;

  useEffect(() => {
    if (effectiveLoading) return;

    // ── Auth flow pages — ALWAYS accessible regardless of role ──
    // Password reset creates a session mid-flow (via verifyOtp), so these
    // must remain accessible even when the user briefly has a role.
    const authFlowPages = [
      '/otp-verification', '/seller/otp-verification',
      '/new-password', '/seller/new-password',
      '/forgot-password', '/seller/forgot-password',
    ];
    if (authFlowPages.includes(path)) return;

    // ── Route categories ──
    const publicPages = [
      '/', '/seller',
      '/privacy-policy', '/terms-of-service', '/shipping-policy',
      '/refund-policy', '/terms-and-conditions', '/about', '/contact',
    ];
    const publicPrefixes = ['/products', '/category'];
    const isPublicPage =
      publicPages.includes(path) ||
      publicPrefixes.some((p) => path === p || path.startsWith(`${p}/`));

    const userAuthPages = ['/login', '/signup'];
    const sellerAuthPages = ['/seller/login', '/seller/signup'];
    const isUserAuthPage = userAuthPages.includes(path);
    const isSellerAuthPage = sellerAuthPages.includes(path);

    const sellerProtectedPrefixes = [
      '/seller/dashboard', '/seller/products', '/seller/orders',
      '/seller/wallet', '/seller/verify', '/seller/notifications',
      '/seller/warehouse', '/seller/tutorial', '/seller/help',
    ];
    const isSellerProtectedPage = sellerProtectedPrefixes.some(
      (p) => path === p || path.startsWith(`${p}/`)
    );
    const isAdminPage = path.startsWith('/admin');
    const userProtectedPrefixes = [
      '/orders', '/profile', '/wishlist', '/cart', '/checkout',
      '/settings', '/notifications', '/user',
    ];
    const isUserProtectedPage = userProtectedPrefixes.some(
      (p) => path === p || path.startsWith(`${p}/`)
    );

    // ═══ ADMIN — locked to /admin/* only ═══
    if (authRole === 'admin') {
      if (!isAdminPage) {
        navigate('/admin', { replace: true });
      }
      return;
    }

    // ═══ SELLER — locked to seller protected pages only ═══
    if (authRole === 'seller') {
      if (!isSellerProtectedPage) {
        navigate('/seller/dashboard', { replace: true });
      }
      return;
    }

    // ═══ USER — public + user pages, blocked from seller/admin ═══
    if (authRole === 'user') {
      if (isSellerProtectedPage || isAdminPage) {
        navigate('/', { replace: true });
        return;
      }
      // Seller auth pages — let SellerAuthRouteGuard show the "switch account" modal
      if (isSellerAuthPage) return;
      // Already logged in — redirect away from user login/signup
      if (isUserAuthPage) {
        navigate('/', { replace: true });
        return;
      }
      // Everything else (public + user protected) — allowed
      return;
    }

    // ═══ GUEST — public + auth pages only ═══
    if (isPublicPage || isUserAuthPage || isSellerAuthPage) return;

    // Guest trying to access protected pages → redirect to appropriate login
    if (isUserProtectedPage) {
      navigate('/login', { replace: true, state: { from: path } });
      return;
    }
    if (isSellerProtectedPage || isAdminPage) {
      navigate('/seller/login', { replace: true });
      return;
    }
    // Unknown path — let NotFound component handle it
  }, [authRole, path, effectiveLoading, navigate]);

  if (effectiveLoading) return <PageLoader />;
  return <>{children}</>;
};

// Auto-sync wishlist when user logs in
const WishlistAutoSync: React.FC = () => {
  useWishlistSync();
  return null;
};

// Auto-sync cart when user logs in
const CartAutoSync: React.FC = () => {
  const { user, currentAuthUser, authRole } = useAuth();
  const { syncCartWithBackend } = useCart();

  useEffect(() => {
    if (authRole && authRole !== 'user') return;
    const userId = user?.id || currentAuthUser?.userId;
    if (userId) {
      syncCartWithBackend(userId);
    }
  }, [authRole, user?.id, currentAuthUser?.userId, syncCartWithBackend]);

  return null;
};

// SellerAuthRouteGuard — blocks "user" role from seller auth pages.
// Guest / seller / admin → render children normally.
// User → show "Account Switch Required" modal.
const SellerAuthRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authRole, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      navigate('/seller/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCancel = () => {
    navigate('/', { replace: true });
  };

  if (loading) return <PageLoader />;

  // Guest, seller, or admin — allow through
  if (!authRole || authRole === 'seller' || authRole === 'admin') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-gray-200">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Account Switch Required</h2>
        <p className="mt-2 text-sm sm:text-base text-gray-600">
          Please log out of your customer account before continuing to seller authentication.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full rounded-lg bg-red-600 text-white py-2.5 font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoggingOut}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const isOnline = useOnlineStatus();

  if (!isOnline) {
    return <OfflineScreen />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <CurrencyProvider>
          <CartProvider>
            <WishlistProvider>
              <Router>
                <NavigationProvider>
                  <WishlistAutoSync />
                  <CartAutoSync />
                  <NavigationProgress />
                  <GlobalActionConfirmation />
                  {!isSellerApp && <FloatingCartShortcut />}
                  <NativeRuntimeGuard>
                    {(refreshEpoch) => (
                      <RouteGuard key={refreshEpoch}>
                        <ErrorBoundary>
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                  <Route path="/" element={<RootEntry />} />
                  <Route path="/all-categories" element={<Navigate to="/" replace />} />
                  <Route path="/products/featured" element={<LegacySectionRedirect to="/products/section/featured" />} />
                  <Route path="/products/hot-deals" element={<LegacySectionRedirect to="/products/section/hot-deals" />} />
                  <Route path="/products/section/:section" element={<SectionProducts />} />
                  <Route path="/products/:productId" element={<ProductDetailsPage />} />
                  {/* Share link fallback — redirect to product page (OG handled by edge function) */}
                  <Route path="/share/:slug" element={<ShareRedirect />} />
                  <Route path="/category/:categoryId" element={<CategoryProducts />} />
                  
                  {/* Legal Pages */}
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsService />} />
                  <Route path="/shipping-policy" element={<ShippingPolicy />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  
                  {/* User Routes */}
                  <Route path="/login" element={<Login role="user" />} />
                  <Route path="/signup" element={<Signup role="user" />} />
                  <Route path="/otp-verification" element={<OTPVerification />} />
                  <Route path="/new-password" element={<NewPassword />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/orders" element={<MyOrders />} />
                  <Route path="/orders/:orderId" element={<OrderDetails />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/wishlist" element={<WishlistPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/settings" element={<UserSettings />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/products/:productId/review" element={<WriteReview />} />
                  <Route path="/user/addresses" element={<UserAddressManagement />} />
                  
                  {/* Checkout Flow Routes */}
                  <Route path="/checkout/shipping" element={<ShippingAddressPage />} />
                  <Route path="/checkout/review" element={<OrderSummaryPage />} />
                  <Route path="/checkout/payment" element={<Checkout />} />
                  <Route path="/checkout/confirmation" element={<OrderConfirmationPage />} />
                  
                  {/* Seller Routes */}
                  {isBuyerApp ? (
                    // In the buyer app, all /seller/* paths open the full web app externally
                    <>
                      <Route path="/seller" element={<ExternalSellerRedirect />} />
                      <Route path="/seller/*" element={<ExternalSellerRedirect />} />
                    </>
                  ) : (
                    // Full web / full Android app — all seller routes available
                    <>
                  <Route path="/seller" element={<SellerLanding />} />
                  {isSellerApp && (
                    <Route path="/seller/welcome" element={<SellerNativeLanding />} />
                  )}
                  <Route
                    path="/seller/login"
                    element={
                      <SellerAuthRouteGuard>
                        <SellerLogin />
                      </SellerAuthRouteGuard>
                    }
                  />
                  <Route
                    path="/seller/signup"
                    element={
                      <SellerAuthRouteGuard>
                        <SellerSignup />
                      </SellerAuthRouteGuard>
                    }
                  />
                  <Route path="/seller/otp-verification" element={<OTPVerification />} />
                  <Route path="/seller/new-password" element={<NewPassword />} />
                  <Route
                    path="/seller/forgot-password"
                    element={
                      <SellerAuthRouteGuard>
                        <SellerForgotPassword />
                      </SellerAuthRouteGuard>
                    }
                  />
                  <Route path="/seller/analytics" element={<Navigate to="/seller/dashboard" replace />} />
                  <Route path="/seller/profile" element={<Navigate to="/seller/dashboard" replace />} />
                  <Route path="/seller/dashboard" element={<SellerDashboardWrapper />} />
                  <Route path="/seller/products" element={<SellerProductListingWrapper />} />
                  <Route path="/seller/products/new/:step" element={<SellerProductListingWrapper />} />
                  <Route path="/seller/warehouse" element={<SellerLayout><WarehouseCreation /></SellerLayout>} />
                  <Route path="/seller/products/pickup-location" element={<Navigate to="/seller/warehouse" replace />} />
                  <Route path="/seller/orders" element={<SellerOrderManagementWrapper />} />
                  <Route path="/seller/wallet" element={<SellerWalletWrapper />} />
                  <Route path="/seller/verify" element={<SellerLayout><SellerVerificationWrapper /></SellerLayout>} />
                  <Route path="/seller/promotions" element={<Navigate to="/seller/dashboard" replace />} />
                  <Route path="/seller/notifications" element={<SellerNotificationsWrapper />} />
                  <Route path="/seller/tutorial" element={<SellerLayout><SellerTutorial /></SellerLayout>} />
                  <Route path="/seller/help" element={<SellerLayout><SellerHelp /></SellerLayout>} />
                    </>
                  )}
                  
                  {/* Admin Routes — excluded from buyer app */}
                  {!isBuyerApp && (
                    <>
                  {/* Admin Routes — admin login only via seller login page */}
                  <Route path="/admin/login" element={<Navigate to="/seller/login" replace />} />
                  <Route path="/admin/signup" element={<Navigate to="/seller/login" replace />} />
                  <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />
                  
                  {/* Admin Layout Routes */}
                  <Route element={<AdminLayout />}>
                    <Route path="/admin" element={<AdminOverview />} />
                    <Route path="/admin/sellers" element={<SellerManagement />} />
                    <Route path="/admin/products" element={<ProductManagement />} />
                    <Route path="/admin/sponsored-products" element={<SponsoredProductsManagement />} />
                    <Route path="/admin/variants" element={<ProductVariantManagement />} />
                    <Route path="/admin/orders" element={<OrderManagement />} />

                    <Route path="/admin/complaints" element={<ComplaintManagement />} />
                    <Route path="/admin/accounts" element={<AccountsManagement />} />
                    <Route path="/admin/reports" element={<ReportsManagement />} />
                    <Route path="/admin/admins" element={<AdminManagement />} />
                    <Route path="/admin/profile" element={<ProfilePage />} />
                    <Route path="/admin/settings" element={<SettingsPage />} />
                    <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
                    <Route path="/admin/search" element={<SearchManagement />} />
                    <Route path="/admin/audit-logs" element={<AuditLogs />} />
                    <Route path="/admin/health" element={<SystemHealth />} />
                    <Route path="/admin/addresses" element={<AdminAddressManagement />} />
                    <Route path="/admin/seller-kyc" element={<SellerKYCSubmissionManagement />} />
                    <Route path="/admin/shipping-management" element={<ShippingManagementPage />} />
                    <Route path="/admin/intl-rates" element={<ShippingManagementPage />} />
                    <Route path="/admin/banners" element={<BannerManagement />} />
                    <Route path="/admin/categories" element={<CategoryManagement />} />
                    <Route path="/admin/seller-warehouses" element={<AdminSellerWarehouses />} />

                  </Route>
                    </>
                  )}
                  
                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                          </Suspense>
                        </ErrorBoundary>
                      </RouteGuard>
                    )}
                  </NativeRuntimeGuard>
                </NavigationProvider>
              </Router>
            </WishlistProvider>
          </CartProvider>
        </CurrencyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
