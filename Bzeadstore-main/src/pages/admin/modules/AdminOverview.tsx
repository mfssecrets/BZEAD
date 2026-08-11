import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading, ErrorMessage } from '../components/StatusIndicators';
import type { DashboardData } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { fetchCategories, fetchProducts } from '../../../lib/productService';
import * as adminApiService from '../../../lib/adminService';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchExchangeRates, convertAmount } from '../../../utils/currency';
import { isNativePlatform } from '../../../mobile/nativePlatform';


export const AdminOverview: React.FC = () => {
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentOrders, setRecentOrders] = useState<Array<{
    id: string;
    buyer: string;
    seller: string;
    when: string;
    amount: string;
    method: string;
    paid: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metrics = data?.metrics;

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        // Fetch profiles (users + sellers)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, role, created_at');
        const users = profiles || [];

        // Fetch categories
        const { data: categoriesData } = await fetchCategories(false);
        const categories = categoriesData || [];

        // Fetch products
        const { data: productsData, count } = await fetchProducts({ limit: 1 });
        const totalProducts = count || (productsData || []).length;

        // Fetch financial data from account summary
        const accountSummary = await adminApiService.getAccountSummary();

        // Fetch orders for ongoing/returns
        const { data: allOrders } = await supabase
          .from('orders')
          .select('id, status, payment_status, currency, total_amount, created_at, user_id, seller_id, order_number');
        const orders = allOrders || [];
        const ongoingOrders = orders.filter((o: any) => ['processing', 'shipped', 'confirmed'].includes(o.status)).length;
        const returnsCancellations = orders.filter((o: any) => ['cancelled', 'refunded', 'returned'].includes(o.status)).length;
        const totalBookings = orders.length;

        // Total Sales = what buyers actually paid (Stripe truth), normalized to INR.
        // The account-summary RPC sums product_subtotal across mixed currencies as raw
        // numbers (INR+GBP+USD added together) and labels it INR, which is incorrect.
        // We anchor each paid order to its captured payment_intent amount/currency and
        // convert to a single base currency (INR) so the metric is meaningful.
        const orderIds = orders.map((o: any) => o.id);
        const paidByOrderId = new Map<string, { amount: number; currency: string }>();
        if (orderIds.length > 0) {
          const { data: paymentIntents } = await supabase
            .from('payment_intents')
            .select('order_id, amount, currency, status, created_at')
            .in('order_id', orderIds)
            .order('created_at', { ascending: false });
          for (const pi of paymentIntents || []) {
            if (pi.status !== 'succeeded') continue;
            if (!paidByOrderId.has(pi.order_id)) {
              paidByOrderId.set(pi.order_id, {
                amount: Number(pi.amount || 0),
                currency: String(pi.currency || 'inr').toUpperCase(),
              });
            }
          }
        }
        const rates = await fetchExchangeRates();
        const totalSalesInr = orders.reduce((sum: number, o: any) => {
          if (['cancelled', 'refunded', 'returned'].includes(o.status)) return sum;
          if (!['paid', 'completed', 'succeeded'].includes(o.payment_status)) return sum;
          const paid = paidByOrderId.get(o.id);
          const amount = paid ? paid.amount : Number(o.total_amount || 0);
          const currency = paid ? paid.currency : String(o.currency || 'INR').toUpperCase();
          return sum + convertAmount(amount, currency, 'INR', rates);
        }, 0);

        // Recent orders (latest 6) for the dashboard transactions table.
        const recentRaw = [...orders]
          .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 6);
        const recentBuyerIds = Array.from(new Set(recentRaw.map((o: any) => o.user_id).filter(Boolean)));
        const recentSellerIds = Array.from(new Set(recentRaw.map((o: any) => o.seller_id).filter(Boolean)));
        const recentProfileIds = Array.from(new Set([...recentBuyerIds, ...recentSellerIds]));
        const nameById = new Map<string, string>();
        if (recentProfileIds.length > 0) {
          const { data: recentProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', recentProfileIds);
          (recentProfiles || []).forEach((p: any) => {
            nameById.set(String(p.id), p.full_name || p.email || 'Unknown');
          });
        }
        const formatWhen = (iso: string): string => {
          if (!iso) return '';
          const d = new Date(iso);
          const now = new Date();
          const sameDay = d.toDateString() === now.toDateString();
          const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
          if (sameDay) {
            const diffH = Math.max(1, Math.round((now.getTime() - d.getTime()) / 3600000));
            return `Today · ${diffH}h ago`;
          }
          if (d.toDateString() === yesterday.toDateString()) {
            return `Yesterday · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          }
          return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
        };
        const recentOrdersList = recentRaw.map((o: any) => {
          const paid = paidByOrderId.get(o.id);
          const amount = paid ? paid.amount : Number(o.total_amount || 0);
          const currency = paid ? paid.currency : String(o.currency || 'INR').toUpperCase();
          return {
            id: String(o.id),
            buyer: nameById.get(String(o.user_id)) || 'Guest',
            seller: nameById.get(String(o.seller_id)) || o.order_number || '—',
            when: formatWhen(o.created_at),
            amount: formatPrice(amount, currency),
            method: paid ? 'Card' : 'COD',
            paid: ['paid', 'completed', 'succeeded'].includes(o.payment_status),
          };
        });
        setRecentOrders(recentOrdersList);

        // Calculate metrics
        const totalUsers = users.filter((u: any) => u.role !== 'seller' && u.role !== 'admin').length;
        const totalSellers = users.filter((u: any) => u.role === 'seller').length;

        // Count prime/premium members (users with is_verified or approved status)
        const primeMembers = users.filter((u: any) => u.is_verified === true && u.role === 'user').length;

        // Get current month registrations
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const userRegistrationsThisMonth = users.filter((u: any) => {
          if (!u.created_at) return false;
          const date = new Date(u.created_at);
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        }).length;

        const sellerRegistrationsThisMonth = users.filter((u: any) => {
          if (!u.created_at || u.role !== 'seller') return false;
          const date = new Date(u.created_at);
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        }).length;

        // Top sellers by order revenue
        const { data: sellerProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, badge')
          .eq('role', 'seller')
          .limit(10);

        const sellerIds = (sellerProfiles || []).map((s: any) => s.id);
        const { data: sellerKycRows } = sellerIds.length > 0
          ? await supabase.from('seller_kyc').select('seller_id, business_name').in('seller_id', sellerIds)
          : { data: [] };
        const kycMap = new Map((sellerKycRows || []).map((k: any) => [k.seller_id, k.business_name]));

        const topSellers = [];
        for (const seller of (sellerProfiles || []).slice(0, 5)) {
          const { data: sellerOrders } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('seller_id', seller.id)
            .not('status', 'in', '("cancelled","refunded")');
          const totalRevenue = (sellerOrders || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
          const totalSellerOrders = (sellerOrders || []).length;
          if (totalRevenue > 0 || totalSellerOrders > 0) {
            topSellers.push({
              id: seller.id,
              shop_name: kycMap.get(seller.id) || seller.full_name || 'Unknown',
              badge: seller.badge || 'standard',
              total_revenue: totalRevenue,
              total_orders: totalSellerOrders,
            });
          }
        }
        topSellers.sort((a, b) => b.total_revenue - a.total_revenue);

        setData({
          metrics: {
            total_sales: totalSalesInr,
            total_expenses: accountSummary.totalExpenses || 0,
            total_products: totalProducts,
            total_users: totalUsers,
            total_sellers: totalSellers,
            total_bookings: totalBookings,
            ongoing_orders: ongoingOrders,
            returns_cancellations: returnsCancellations,
          },
          user_registrations: userRegistrationsThisMonth,
          prime_members: primeMembers,
          seller_registrations: sellerRegistrationsThisMonth,
          top_categories: categories.slice(0, 5).map((c: any) => ({
            id: c.id,
            name: c.name,
            is_active: true,
            created_at: new Date().toISOString(),
          })),
          top_sellers: topSellers as any[],
        });

        setError(null);
      } catch (err: any) {
        console.error('Error loading dashboard data', err);
        setError('Failed to load dashboard metrics');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) return <Loading message="Loading dashboard metrics..." />;

  // ===== NATIVE ANDROID APP DASHBOARD (compact, colorful) =====
  if (isNativePlatform) {
    const nativeMetrics: Array<{ label: string; value: string | number; icon: string; gradient: string; ring: string }> = [
      { label: 'Total Sales', value: metrics ? formatPrice(metrics.total_sales, 'INR') : formatPrice(0, 'INR'), icon: '\uD83D\uDCB0', gradient: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-200' },
      { label: 'Expenses', value: metrics ? formatPrice(metrics.total_expenses, 'INR') : formatPrice(0, 'INR'), icon: '\uD83D\uDCCA', gradient: 'from-rose-500 to-red-600', ring: 'ring-rose-200' },
      { label: 'Products', value: metrics?.total_products ?? 0, icon: '\uD83D\uDCE6', gradient: 'from-sky-500 to-blue-600', ring: 'ring-sky-200' },
      { label: 'Users', value: metrics?.total_users ?? 0, icon: '\uD83D\uDC65', gradient: 'from-fuchsia-500 to-purple-600', ring: 'ring-fuchsia-200' },
      { label: 'Sellers', value: metrics?.total_sellers ?? 0, icon: '\uD83C\uDFEA', gradient: 'from-amber-500 to-orange-600', ring: 'ring-amber-200' },
      { label: 'Bookings', value: metrics?.total_bookings ?? 0, icon: '\uD83D\uDED2', gradient: 'from-indigo-500 to-violet-600', ring: 'ring-indigo-200' },
      { label: 'Ongoing', value: metrics?.ongoing_orders ?? 0, icon: '\uD83D\uDE9A', gradient: 'from-yellow-500 to-amber-600', ring: 'ring-yellow-200' },
      { label: 'Returns', value: metrics?.returns_cancellations ?? 0, icon: '\u21A9\uFE0F', gradient: 'from-pink-500 to-rose-600', ring: 'ring-pink-200' },
    ];
    const monthCards = [
      { label: 'New Users', value: data?.user_registrations || 0, gradient: 'from-blue-500 to-cyan-500' },
      { label: 'Prime', value: data?.prime_members || 0, gradient: 'from-purple-500 to-fuchsia-500' },
      { label: 'New Sellers', value: data?.seller_registrations || 0, gradient: 'from-orange-500 to-amber-500' },
    ];
    return (
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-600 font-medium">{error}</div>
        )}

        {/* Shipping CTA — compact */}
        <div className="rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 text-white px-3 py-2.5 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <p className="text-[12px] font-bold leading-tight">Shipping Management</p>
            <p className="text-[10px] text-white/70 leading-snug truncate">Origin/destination rates &amp; ETA bands</p>
          </div>
          <button
            type="button"
            data-no-global-confirm="true"
            onClick={() => navigate('/admin/shipping-management')}
            className="shrink-0 px-3 py-1.5 bg-white text-slate-900 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition-colors"
          >
            Open
          </button>
        </div>

        {/* Seller Warehouse CTA — compact */}
        <div className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 text-white px-3 py-2.5 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <p className="text-[12px] font-bold leading-tight">Seller Warehouse</p>
            <p className="text-[10px] text-white/80 leading-snug truncate">Review &amp; sync pickup locations to Shiprocket / Shippo</p>
          </div>
          <button
            type="button"
            data-no-global-confirm="true"
            onClick={() => navigate('/admin/seller-warehouses')}
            className="shrink-0 px-3 py-1.5 bg-white text-amber-700 rounded-lg text-[11px] font-bold hover:bg-amber-50 transition-colors"
          >
            Open
          </button>
        </div>

        {/* Business Metrics — 2-col gradient grid */}
        <div>
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Business Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {nativeMetrics.map((m) => (
              <div
                key={m.label}
                className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${m.gradient} p-2.5 shadow-sm ring-1 ${m.ring} text-white`}
              >
                <div className="absolute -top-4 -right-4 w-14 h-14 bg-white/10 rounded-full" aria-hidden="true" />
                <div className="relative flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/85">{m.label}</span>
                  <span className="text-base leading-none" aria-hidden="true">{m.icon}</span>
                </div>
                <p className="relative mt-1.5 text-[16px] font-extrabold leading-tight break-all">{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* This Month — 3 compact pills */}
        <div>
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">This Month</h3>
          <div className="grid grid-cols-3 gap-2">
            {monthCards.map((m) => (
              <div
                key={m.label}
                className={`rounded-xl bg-gradient-to-br ${m.gradient} text-white px-2 py-2 shadow-sm`}
              >
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/85 leading-tight">{m.label}</p>
                <p className="text-lg font-extrabold leading-tight mt-0.5">{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Top Categories — chip row */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <h3 className="text-[12px] font-bold text-gray-900 mb-2">Top Categories</h3>
          {data?.top_categories && data.top_categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.top_categories.slice(0, 5).map((category) => (
                <span
                  key={category.id}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200"
                >
                  {category.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500">No categories available</p>
          )}
        </div>

        {/* Top Sellers — vertical list */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <h3 className="text-[12px] font-bold text-gray-900 mb-2">Top Sellers</h3>
          {data?.top_sellers && data.top_sellers.length > 0 ? (
            <div className="space-y-1.5">
              {data.top_sellers.slice(0, 5).map((seller, idx) => {
                const badgeStyle =
                  seller.badge === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                  seller.badge === 'platinum' ? 'bg-purple-100 text-purple-800' :
                  'bg-gray-100 text-gray-700';
                return (
                  <div key={seller.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-gray-900 truncate">{seller.shop_name}</p>
                        <p className="text-[9px] text-gray-500">{seller.total_orders || 0} orders</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-[11px] font-bold text-gray-900">{formatPrice(seller.total_revenue || 0, 'INR')}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeStyle}`}>{seller.badge?.toUpperCase() || 'STD'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500">No sellers available</p>
          )}
        </div>
      </div>
    );
  }

  // ===== WEB DASHBOARD (Borcelle-style redesign) =====
  const adminFirstName = (user?.full_name || 'Admin').split(' ')[0];
  const adminInitials = (user?.full_name || 'Admin')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const webMetrics: Array<{ label: string; value: string | number; icon: string; chip: string }> = [
    { label: 'Total Sales', value: metrics ? formatPrice(metrics.total_sales, 'INR') : formatPrice(0, 'INR'), icon: '\uD83D\uDCB0', chip: 'bg-emerald-100 text-emerald-600' },
    { label: 'Total Products', value: metrics?.total_products ?? 0, icon: '\uD83D\uDCE6', chip: 'bg-sky-100 text-sky-600' },
    { label: 'Total Users', value: metrics?.total_users ?? 0, icon: '\uD83D\uDC65', chip: 'bg-violet-100 text-violet-600' },
    { label: 'Total Sellers', value: metrics?.total_sellers ?? 0, icon: '\uD83C\uDFEA', chip: 'bg-amber-100 text-amber-600' },
    { label: 'Total Bookings', value: metrics?.total_bookings ?? 0, icon: '\uD83D\uDED2', chip: 'bg-cyan-100 text-cyan-600' },
    { label: 'Ongoing Orders', value: metrics?.ongoing_orders ?? 0, icon: '\uD83D\uDE9A', chip: 'bg-indigo-100 text-indigo-600' },
    { label: 'Returns & Cancellations', value: metrics?.returns_cancellations ?? 0, icon: '\u21A9\uFE0F', chip: 'bg-rose-100 text-rose-600' },
    { label: 'Prime Members', value: data?.prime_members ?? 0, icon: '\u2B50', chip: 'bg-pink-100 text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}

      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#2bb0f3] to-[#1565d8] text-white px-5 sm:px-7 py-5 sm:py-6 shadow-lg shadow-blue-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-white/20 ring-2 ring-white/40 flex items-center justify-center text-base font-extrabold shrink-0">
              {adminInitials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold leading-tight truncate">Welcome back, {adminFirstName}</h1>
              <p className="text-sm text-white/85 mt-0.5">Here's a detailed look at your marketplace today.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/95 rounded-full px-4 py-2.5 w-full sm:w-72 max-w-full">
            <span aria-hidden="true" className="text-gray-400">&#128269;</span>
            <input
              type="text"
              placeholder="Search orders, products..."
              className="bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400 flex-1 min-w-0"
            />
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {webMetrics.map((m) => (
          <div
            key={m.label}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex items-center justify-between gap-3 hover:shadow-md transition-shadow"
          >
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-gray-500 leading-tight">{m.label}</p>
              <p className="text-lg sm:text-2xl font-extrabold text-gray-900 mt-0.5 break-words">{m.value}</p>
            </div>
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${m.chip}`}>
              <span aria-hidden="true">{m.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: Sales & Revenue + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Sales & Revenue */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
          <h3 className="text-base font-bold text-gray-900 mb-4">Sales &amp; Revenue</h3>

          <div className="rounded-2xl bg-gradient-to-br from-[#2bb0f3] to-[#1565d8] text-white p-5 shadow-md relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full" aria-hidden="true" />
            <div className="relative flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80">Total Sales (This Month)</p>
                <p className="text-3xl font-extrabold mt-1 break-words">
                  {metrics ? formatPrice(metrics.total_sales, 'INR') : formatPrice(0, 'INR')}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg font-extrabold shrink-0">B</div>
            </div>
            <div className="relative flex items-center justify-between mt-5 text-xs text-white/85">
              <span>BZEAD &middot; Marketplace</span>
              <span>{new Date().toLocaleDateString([], { month: 'short', year: 'numeric' })}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform Snapshot</p>
              <span className="text-[11px] font-semibold bg-sky-100 text-[#1565d8] px-2.5 py-1 rounded-full">Live</span>
            </div>
            <p className="text-base font-bold text-[#1565d8] mt-3">BZEAD Marketplace</p>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span><span className="font-bold text-gray-700">{metrics?.total_sellers ?? 0}</span> active sellers</span>
              <span><span className="font-bold text-gray-700">{metrics?.total_products ?? 0}</span> products</span>
            </div>
            <div className="flex items-center justify-between mt-4 text-xs">
              <span className="text-emerald-600 font-semibold">&#9679; Operational</span>
              <span className="text-gray-400">Silver Tier</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-no-global-confirm="true"
              onClick={() => navigate('/admin/shipping-management')}
              className="inline-flex items-center justify-center rounded-xl bg-[#1565d8] hover:bg-[#1257bd] text-white px-3 py-2.5 text-xs font-bold transition-colors"
            >
              Shipping
            </button>
            <button
              type="button"
              data-no-global-confirm="true"
              onClick={() => navigate('/admin/seller-warehouses')}
              className="inline-flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2.5 text-xs font-bold transition-colors"
            >
              Warehouses
            </button>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">Recent Orders</h3>
            <button
              type="button"
              data-no-global-confirm="true"
              onClick={() => navigate('/admin/orders')}
              className="text-xs font-bold text-[#1565d8] hover:underline"
            >
              View all
            </button>
          </div>

          {recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-gradient-to-r from-[#2bb0f3] to-[#1565d8] text-white">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold rounded-l-lg">Buyer</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Reference</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Date</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold">Amount</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{o.buyer}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{o.seller}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{o.when}</td>
                      <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{o.amount}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          o.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${o.paid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {o.paid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-6 text-center">No recent orders.</p>
          )}
        </div>
      </div>

      {/* Registrations + Top Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-bold text-gray-900 mb-4">This Month</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">New Users</span>
              <span className="text-lg font-extrabold text-[#1565d8]">{data?.user_registrations || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Prime Members</span>
              <span className="text-lg font-extrabold text-violet-600">{data?.prime_members || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">New Sellers</span>
              <span className="text-lg font-extrabold text-amber-600">{data?.seller_registrations || 0}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-bold text-gray-900 mb-4">Top Sellers (by Revenue)</h3>
          {data?.top_sellers && data.top_sellers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Shop Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Badge</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Revenue</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_sellers.slice(0, 5).map((seller) => (
                    <tr key={seller.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900">{seller.shop_name}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          seller.badge === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                          seller.badge === 'platinum' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {seller.badge?.toUpperCase() || 'STANDARD'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{formatPrice(seller.total_revenue || 0, 'INR')}</td>
                      <td className="px-3 py-3 text-gray-600">{seller.total_orders || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No sellers available</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
