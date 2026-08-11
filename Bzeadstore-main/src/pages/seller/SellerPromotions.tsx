import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  Shield,
  Package,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Megaphone,
  Headset,
  BookOpen,
  Settings,
  LogOut,
  Loader2,
  Plus,
  X,
  Bell,
  ChevronLeft,
} from 'lucide-react';
import NotificationBell from '../../components/common/NotificationBell';
import { ListSkeleton } from '../../components/common/Skeleton';
import type { Promotion } from '../../types';
import {
  createSellerPromotion,
  fetchSellerPromotions,
  updateSellerPromotionStatus,
} from '../../lib/sellerPromotionsService';
import { useSellerDisplayCurrency } from '../../hooks/useSellerDisplayCurrency';

interface SellerPromotionsProps {
  onLogout: () => void | Promise<void>;
  onNavigate: (view: string) => void;
}

// Module-level cache keyed by sellerId — survives unmounts so revisits render instantly
// while a silent background refresh updates the cache.
const sellerPromotionsCache: Record<string, Promotion[]> = {};

const SellerPromotions: React.FC<SellerPromotionsProps> = ({ onLogout, onNavigate }) => {
  const { user, currentAuthUser } = useAuth();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const { sellerCurrency, formatSellerAmount } = useSellerDisplayCurrency(sellerId);
  const cachedPromotions = sellerId ? sellerPromotionsCache[sellerId] : undefined;

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [loading, setLoading] = useState(() => !cachedPromotions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>(() => cachedPromotions || []);
  const [form, setForm] = useState({
    title: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '',
    start_date: '',
    end_date: '',
  });

  const loadPromotions = async () => {
    if (!sellerId) return;
    const hasCache = !!sellerPromotionsCache[sellerId];
    if (!hasCache) setLoading(true);
    setError(null);
    const { data, error: fetchError } = await fetchSellerPromotions(sellerId);
    if (fetchError) setError(fetchError);
    else {
      setPromotions(data);
      sellerPromotionsCache[sellerId] = data;
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPromotions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const handleLogoutConfirm = async () => {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } catch {
      setIsLoggingOut(false);
    }
  };

  const handleCreate = async () => {
    if (!sellerId) return;
    if (!form.title.trim() || !form.discount_value || !form.start_date || !form.end_date) {
      setError('Please fill all required fields.');
      return;
    }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      setError('End date must be after start date.');
      return;
    }
    if (form.discount_type === 'percentage' && (Number(form.discount_value) < 1 || Number(form.discount_value) > 100)) {
      setError('Percentage discount must be between 1 and 100.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error: createError } = await createSellerPromotion(sellerId, {
      title: form.title.trim(),
      description: form.description.trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      start_date: form.start_date,
      end_date: form.end_date,
    });

    if (createError) {
      setError(createError);
      setSaving(false);
      return;
    }

    setForm({
      title: '',
      description: '',
      discount_type: 'percentage',
      discount_value: '',
      start_date: '',
      end_date: '',
    });
    await loadPromotions();
    setSaving(false);
  };

  const activeCount = useMemo(() => promotions.filter((p) => p.is_active).length, [promotions]);

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 font-sans flex flex-col">
      <header className="bg-blue-950 text-white border-b border-blue-900">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="min-h-[4rem] flex items-center justify-between py-2">
            <div>
              <h2 className="text-sm font-semibold truncate">Seller</h2>
              <p className="text-blue-100 text-xs">Seller Dashboard</p>
            </div>
            <div className="flex items-center gap-2.5">
              <NotificationBell onNavigate={onNavigate} variant="dark" />
              <button
                onClick={() => setShowLogoutDialog(true)}
                disabled={isLoggingOut}
                className="h-9 w-9 rounded-lg bg-white text-blue-900 hover:bg-blue-100 transition-colors flex items-center justify-center disabled:opacity-60"
                aria-label="Logout"
              >
                {isLoggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              </button>
            </div>
          </div>

          <nav className="h-12 flex items-center gap-1.5 overflow-x-auto">
            <HeaderNavItem icon={<LayoutDashboard size={14} />} label="Overview" onClick={() => onNavigate('seller-dashboard')} />
            <HeaderNavItem icon={<Shield size={14} />} label="Profile" onClick={() => onNavigate('seller-dashboard')} />
            <HeaderNavItem icon={<Package size={14} />} label="My Products" onClick={() => onNavigate('seller-products')} />
            <HeaderNavItem icon={<ShoppingBag size={14} />} label="Orders & Tracking" onClick={() => onNavigate('seller-orders')} />
            <HeaderNavItem icon={<TrendingUp size={14} />} label="Sales Report" onClick={() => onNavigate('seller-sales-report')} />
            <HeaderNavItem icon={<DollarSign size={14} />} label="Wallet & Payout" onClick={() => onNavigate('seller-wallet')} />
            <HeaderNavItem icon={<Megaphone size={14} />} label="Promotions" active />
            <HeaderNavItem icon={<Bell size={14} />} label="Notifications" onClick={() => onNavigate('seller-notifications')} />
            <HeaderNavItem icon={<Settings size={14} />} label="Store Settings" onClick={() => onNavigate('seller-dashboard')} />
            <HeaderNavItem icon={<LogOut size={14} />} label="End Session" onClick={() => setShowLogoutDialog(true)} />
          </nav>
        </div>
      </header>

      <aside className="hidden">
        <div className="mb-10 cursor-pointer" onClick={() => onNavigate('seller-dashboard')}>
          <h1 className="text-2xl font-semibold text-gray-900">Seller Hub</h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Merchant Portal</p>
        </div>

        <nav className="space-y-2 flex-1">
          <NavItem icon={<LayoutDashboard />} label="Overview" onClick={() => onNavigate('seller-dashboard')} />
          <NavItem icon={<Shield />} label="Verification" onClick={() => onNavigate('seller-verify')} />
          <NavItem icon={<Package />} label="My Products" onClick={() => onNavigate('seller-products')} />
          <NavItem icon={<ShoppingBag />} label="Orders & Tracking" onClick={() => onNavigate('seller-orders')} />
          <NavItem icon={<TrendingUp />} label="Sales Report" onClick={() => onNavigate('seller-sales-report')} />
          <NavItem icon={<DollarSign />} label="Wallet & Payout" onClick={() => onNavigate('seller-wallet')} />
          <NavItem icon={<Megaphone />} label="Promotions" active />
          <NavItem icon={<Bell />} label="Notifications" onClick={() => onNavigate('seller-notifications')} />
          <NavItem icon={<Headset />} label="Support" disabled />
          <NavItem icon={<BookOpen />} label="Guidance" disabled />
          <NavItem icon={<Settings />} label="Store Settings" />
        </nav>

        <div className="pt-6 border-t border-blue-200">
          <button onClick={() => setShowLogoutDialog(true)} className="flex items-center gap-3 w-full p-3 text-red-600 hover:bg-red-50 rounded-xl font-semibold text-sm transition-all">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {showLogoutDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => !isLoggingOut && setShowLogoutDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Confirm Sign Out</h2>
              <button onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"><X size={20} /></button>
            </div>
            <p className="text-gray-500 text-sm mb-6">Are you sure you want to end your seller session?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowLogoutDialog(false)} disabled={isLoggingOut} className="px-5 py-2.5 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold text-sm transition-all disabled:opacity-50">Cancel</button>
              <button onClick={handleLogoutConfirm} disabled={isLoggingOut} className="px-5 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center">
                {isLoggingOut ? (<><Loader2 size={16} className="animate-spin" /> Signing out...</>) : (<><LogOut size={16} /> Sign Out</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto w-full p-2.5 sm:p-6 md:p-10 flex-1">
        <div className="flex items-center justify-between mb-3 sm:mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('seller-dashboard')}
              className="lg:hidden p-1.5 sm:p-2 bg-blue-100 border border-blue-200 text-blue-900 rounded-lg hover:bg-blue-200 transition-colors"
              aria-label="Back to dashboard"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-base sm:text-2xl font-bold text-gray-900">Promotions</h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell onNavigate={onNavigate} variant="light" />
            <span className="text-xs sm:text-sm text-gray-600">Active: {activeCount}</span>
          </div>
        </div>

        {error && <div className="mb-3 sm:mb-4 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-lg px-3 sm:px-4 py-2 sm:py-3">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-5 mb-3 sm:mb-6">
          <h3 className="text-sm sm:text-base font-semibold mb-3 sm:mb-4">Create Promotion</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Title"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={form.discount_type}
              onChange={(e) => setForm((prev) => ({ ...prev, discount_type: e.target.value as 'percentage' | 'fixed' }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option>
            </select>
            <input
              value={form.discount_value}
              onChange={(e) => setForm((prev) => ({ ...prev, discount_value: e.target.value }))}
              placeholder="Discount Value"
              type="number"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={form.start_date}
              onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
              type="datetime-local"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={form.end_date}
              onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
              type="datetime-local"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={saving}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? 'Creating...' : 'Create Promotion'}
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">My Promotions</div>
          {loading ? (
            <ListSkeleton rows={4} withAvatar={false} className="p-4" />
          ) : promotions.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No promotions created yet.</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Discount</th>
                  <th className="px-4 py-2 text-left hidden sm:table-cell">Start</th>
                  <th className="px-4 py-2 text-left hidden sm:table-cell">End</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion) => (
                  <tr key={promotion.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 max-w-[160px] truncate">{promotion.title}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{promotion.discount_type === 'percentage' ? `${promotion.discount_value}%` : formatSellerAmount(promotion.discount_value, sellerCurrency)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">{new Date(promotion.start_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">{new Date(promotion.end_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={async () => {
                          await updateSellerPromotionStatus(promotion.id, !promotion.is_active, sellerId);
                          await loadPromotions();
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${promotion.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {promotion.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto bg-blue-900 text-white">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-4 sm:py-5">
          <p className="text-xs sm:text-sm text-center font-semibold tracking-wide">@ BZEAD - ALL RIGHTS RESERVED BY BEAUZEAD LTD</p>
        </div>
      </footer>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick, disabled = false }: any) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
      disabled
        ? 'opacity-50 cursor-not-allowed bg-white text-black'
        : active
          ? 'bg-white text-black shadow-md'
          : 'bg-white text-black hover:bg-blue-50'
    }`}
  >
    {React.cloneElement(icon, { size: 18 })} {label}
  </button>
);

const HeaderNavItem = ({ icon, label, active = false, onClick, disabled = false }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`h-8 px-3 rounded-md text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors ${
      disabled
        ? 'text-blue-300/60 cursor-not-allowed'
        : active
          ? 'bg-blue-900 text-white border border-blue-700'
          : 'text-blue-100 hover:text-white hover:bg-blue-900/80'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default SellerPromotions;
