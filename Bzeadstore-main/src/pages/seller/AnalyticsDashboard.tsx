import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { TrendingUp, BarChart3, PieChart, Calendar, AlertCircle, ChevronLeft } from 'lucide-react';
import { fetchOrdersBySeller } from '../../lib/orderService';
import { roundMoney } from '../../utils/hardening';
import { resolveSellerLineTotal, sumSellerOrderTotal } from '../../lib/orderPricingViews';
import { useSellerDisplayCurrency } from '../../hooks/useSellerDisplayCurrency';
import { Skeleton, StatCardsSkeleton } from '../../components/common/Skeleton';

interface AnalyticsOrderItem {
  product_id: string;
  product_name?: string;
  name?: string;
  quantity?: number;
  price?: number;
  category?: string;
}

interface AnalyticsOrder {
  id: string;
  order_number?: string;
  status: string;
  total_amount?: number;
  currency?: string;
  created_at: string;
  items?: AnalyticsOrderItem[];
  order_items?: AnalyticsOrderItem[];
}

interface ProductStat {
  name: string;
  sales: number;
  revenue: number;
}

interface CategoryStat {
  amount: number;
  count: number;
}

// Module-level cache keyed by `${sellerId}:${dateRange}` — survives unmounts so revisits
// render instantly while a silent background refresh updates the cache.
const analyticsOrdersCache: Record<string, AnalyticsOrder[]> = {};

export const AnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const { formatSellerAmount } = useSellerDisplayCurrency(sellerId);

  const [dateRange, setDateRange] = useState('monthly');
  const cacheKeyInitial = `${sellerId}:monthly`;
  const cachedOrdersInitial = sellerId ? analyticsOrdersCache[cacheKeyInitial] : undefined;
  const [loading, setLoading] = useState(() => !cachedOrdersInitial);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<AnalyticsOrder[]>(() => cachedOrdersInitial || []);

  const applyDateRangeFilter = (data: AnalyticsOrder[], range: string) => {
    const now = new Date();
    const start = new Date(now);

    if (range === 'weekly') {
      start.setDate(now.getDate() - 7);
    } else if (range === 'monthly') {
      start.setMonth(now.getMonth() - 1);
    } else if (range === 'quarterly') {
      start.setMonth(now.getMonth() - 3);
    } else if (range === 'yearly') {
      start.setFullYear(now.getFullYear() - 1);
    }

    return (data || []).filter((order) => {
      if (!order?.created_at) return false;
      return new Date(order.created_at) >= start;
    });
  };

  // Fetch and filter orders whenever date range changes
  useEffect(() => {
    if (sellerId) {
      fetchAnalytics(dateRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, dateRange]);

  const fetchAnalytics = async (range: string) => {
    try {
      const cacheKey = `${sellerId}:${range}`;
      const hasCache = !!analyticsOrdersCache[cacheKey];
      if (!hasCache) setLoading(true);
      setError(null);

      const { data, error: fetchError } = await fetchOrdersBySeller(sellerId, { limit: 100 });

      if (fetchError) {
        setError('Failed to load analytics');
      } else {
        const filtered = applyDateRangeFilter(data || [], range);
        setOrders(filtered);
        analyticsOrdersCache[cacheKey] = filtered;
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics from real order data
  const calculateMetrics = () => {
    let totalSales = 0;
    let totalOrderCount = 0;
    const deliveredOrders: AnalyticsOrder[] = [];
    const processingOrders: AnalyticsOrder[] = [];
    const productStats: Record<string, ProductStat> = {};
    const categoryStats: Record<string, CategoryStat> = {};

    orders.forEach(order => {
      if (order.status === 'delivered') {
        deliveredOrders.push(order);
        totalSales += resolveSellerAnalyticsOrderTotal(order);
      } else if (['pending', 'processing', 'shipped', 'new'].includes(order.status)) {
        processingOrders.push(order);
        totalSales += resolveSellerAnalyticsOrderTotal(order);
      }
      totalOrderCount++;

      // Track product statistics
      const orderItems = order.items || order.order_items || [];
      if (Array.isArray(orderItems)) {
        orderItems.forEach((item) => {
          const productName = item.product_name || item.name || 'Unknown';
          const productId = item.product_id;
          if (!productStats[productId]) {
            productStats[productId] = {
              name: productName,
              sales: 0,
              revenue: 0
            };
          }
          const sellerLineTotal = resolveSellerLineTotal(item as unknown as Record<string, any>);
          productStats[productId].sales += item.quantity || 1;
          productStats[productId].revenue += roundMoney(sellerLineTotal);

          // Track category
          const category = item.category || 'Other';
          if (!categoryStats[category]) {
            categoryStats[category] = { amount: 0, count: 0 };
          }
          categoryStats[category].amount += roundMoney(sellerLineTotal);
          categoryStats[category].count += 1;
        });
      }
    });

    const avgOrderValue = totalOrderCount > 0 ? roundMoney(totalSales / totalOrderCount) : 0;
    const conversionRate = totalOrderCount > 0 ? ((deliveredOrders.length / totalOrderCount) * 100).toFixed(1) : '0';

    return {
      totalSales: roundMoney(totalSales),
      totalOrderCount,
      avgOrderValue,
      conversionRate: parseFloat(conversionRate),
      deliveredCount: deliveredOrders.length,
      productStats,
      categoryStats
    };
  };

  const metrics = calculateMetrics();

  // Get top 5 products
  const topProducts = Object.values(metrics.productStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Get sales by category
  const totalCategoryAmount = Object.values(metrics.categoryStats).reduce(
    (sum, cat) => sum + cat.amount, 
    0
  );
  const salesByCategory = Object.entries(metrics.categoryStats)
    .map(([category, stats]) => ({
      category,
      amount: stats.amount,
      percentage: totalCategoryAmount > 0 ? Math.round((stats.amount / totalCategoryAmount) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  // Get recent orders
  const recentOrders = orders
    .filter((order) => order.status === 'delivered')
    .slice(0, 5);

  const metricCards = [
    {
      label: 'Total Sales',
      value: metrics.totalSales,
      icon: <TrendingUp className="w-6 h-6" />
    },
    {
      label: 'Orders',
      value: metrics.totalOrderCount,
      icon: <BarChart3 className="w-6 h-6" />
    },
    {
      label: 'Avg Order Value',
      value: metrics.avgOrderValue,
      icon: <PieChart className="w-6 h-6" />
    },
    {
      label: 'Conversion Rate',
      value: metrics.conversionRate,
      icon: <TrendingUp className="w-6 h-6" />
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-8">
      <div className="max-w-7xl mx-auto px-2 sm:px-4">
        {/* Header */}
        <div className="mb-4 sm:mb-8 flex items-center gap-2">
          <button
            onClick={() => navigate('/seller/dashboard')}
            className="lg:hidden p-1.5 sm:p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
            aria-label="Back to dashboard"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <h1 className="text-base sm:text-2xl font-bold text-gray-900">Sales Analytics</h1>
            <p className="text-xs sm:text-base text-gray-600 mt-0.5 sm:mt-2">Track your sales performance and metrics</p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-6">
            <StatCardsSkeleton count={4} />
            <Skeleton rounded="lg" className="h-72 w-full" />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-red-500">
            <div className="flex items-center gap-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">{error}</h3>
                <button
                  onClick={() => fetchAnalytics(dateRange)}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Date Range Filter */}
            <div className="bg-white rounded-lg shadow-md p-2.5 sm:p-4 mb-3 sm:mb-6 flex items-center gap-2 sm:gap-4 flex-wrap">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="weekly">This Week</option>
                <option value="monthly">This Month</option>
                <option value="quarterly">This Quarter</option>
                <option value="yearly">This Year</option>
              </select>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-6 mb-4 sm:mb-8">
              {metricCards.map((metric, index) => (
                <div key={index} className="bg-white rounded-lg shadow-md p-2.5 sm:p-6">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <span className="text-gray-600 text-[11px] sm:text-sm font-medium">{metric.label}</span>
                    <div className="text-blue-600 hidden sm:block">{metric.icon}</div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-base sm:text-2xl font-bold text-gray-900">
                        {metric.label === 'Total Sales'
                          ? formatSellerAmount(metric.value || 0, 'INR')
                          : metric.label === 'Conversion Rate'
                          ? `${(metric.value || 0).toFixed(1)}%`
                          : (metric.value || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Top Products & Sales by Category */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
              {/* Top Products */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-3 sm:p-6">
                <h2 className="text-sm sm:text-lg font-bold text-gray-900 mb-3 sm:mb-6">Top Products</h2>
                {topProducts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Product Name</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Sales</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((product, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50 transition">
                            <td className="py-4 px-4 text-sm text-gray-900">{product.name}</td>
                            <td className="text-right py-4 px-4 text-sm text-gray-600">{product.sales.toLocaleString()}</td>
                            <td className="text-right py-4 px-4 text-sm font-semibold text-gray-900">
                              {formatSellerAmount(product.revenue, 'INR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">No product sales data available</p>
                )}
              </div>

              {/* Sales by Category */}
              <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
                <h2 className="text-sm sm:text-lg font-bold text-gray-900 mb-3 sm:mb-6">Sales by Category</h2>
                {salesByCategory.length > 0 ? (
                  <div className="space-y-4">
                    {salesByCategory.map((item, index) => (
                      <div key={index}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-700">{item.category}</span>
                          <span className="text-sm font-semibold text-gray-900">{item.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${item.percentage}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{formatSellerAmount(item.amount, 'INR')}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">No category data available</p>
                )}
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-lg shadow-md p-3 sm:p-6 mt-3 sm:mt-6">
              <h2 className="text-sm sm:text-lg font-bold text-gray-900 mb-3 sm:mb-6">Recent Deliveries</h2>
              {recentOrders.length > 0 ? (
                <div className="space-y-4">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition flex-wrap gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">Order #{order.order_number}</p>
                        <p className="text-sm text-gray-600">
                          {order.items?.length || 0} items • {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatSellerAmount(resolveSellerAnalyticsOrderTotal(order), 'INR')}</p>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          {order.status === 'delivered' ? 'Delivered' : order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">No recent deliveries</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;

const resolveSellerAnalyticsOrderTotal = (order: AnalyticsOrder): number => {
  const withSnapshot = order as AnalyticsOrder & { seller_total_amount?: number };
  if (withSnapshot.seller_total_amount != null) {
    return Number(withSnapshot.seller_total_amount || 0);
  }
  return sumSellerOrderTotal(((order.order_items || order.items || []) as Array<Record<string, any>>));
};
