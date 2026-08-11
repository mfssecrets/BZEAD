/**
 * SellerNotifications — Amazon / Flipkart-style inbox with deep links.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import NotificationInbox from '../../components/common/NotificationInbox';
import type { ReadFilterKey } from '../../components/common/NotificationInbox';
import {
  fetchNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '../../lib/notificationService';
import type { Notification } from '../../lib/notificationService';
import { resolveSellerNotificationTarget } from '../../lib/sellerNotificationNavigation';
import { deleteNotification } from '../../lib/adminService';

interface SellerNotificationsProps {
  onNavigate: (view: string) => void;
}

type CategoryFilter = 'all' | 'orders' | 'products' | 'payouts' | 'account';

const PAGE_SIZE = 50;

const ORDER_TYPES = new Set([
  'order_new', 'order_placed', 'order_accepted', 'order_rejected', 'order_packed',
  'order_shipped', 'order_in_transit', 'order_out_for_delivery', 'order_delivered',
  'order_failed_delivery', 'order_cancelled', 'order_picked_up', 'order_update',
  'label_ready', 'in_transit', 'return_requested', 'return_approved', 'return_rejected',
  'refund', 'refund_processed',
]);
const PRODUCT_TYPES = new Set(['product_approved', 'product_rejected', 'product_pending']);
const PAYOUT_TYPES = new Set(['payout_completed', 'payout_failed']);
const ACCOUNT_TYPES = new Set([
  'identity_approved', 'identity_rejected', 'identity_pending',
  'warehouse_approved', 'warehouse_rejected', 'warehouse_pending', 'system', 'info',
]);

function matchesCategory(type: string, category: CategoryFilter): boolean {
  if (category === 'all') return true;
  if (category === 'orders') return ORDER_TYPES.has(type);
  if (category === 'products') return PRODUCT_TYPES.has(type);
  if (category === 'payouts') return PAYOUT_TYPES.has(type);
  if (category === 'account') return ACCOUNT_TYPES.has(type);
  return true;
}

function notificationExtra(n: Notification): string | undefined {
  const meta = n.metadata || {};
  if (meta.awb_number) return `AWB: ${meta.awb_number}`;
  if (meta.tracking_number) return `Tracking: ${meta.tracking_number}`;
  if (meta.order_number) return `Order #${meta.order_number}`;
  return undefined;
}

interface NotificationsCacheEntry {
  notifications: Notification[];
  unreadCount: number;
}

const sellerNotificationsCache: Record<string, NotificationsCacheEntry> = {};

const SellerNotifications: React.FC<SellerNotificationsProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const cachedEntry = sellerId ? sellerNotificationsCache[sellerId] : undefined;

  const [notifications, setNotifications] = useState<Notification[]>(() => cachedEntry?.notifications || []);
  const [unreadCount, setUnreadCount] = useState(() => cachedEntry?.unreadCount || 0);
  const [loading, setLoading] = useState(() => !cachedEntry);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [serverOffset, setServerOffset] = useState(() => cachedEntry?.notifications.length || 0);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilterKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const syncCache = useCallback((next: Notification[], count: number) => {
    if (!sellerId) return;
    sellerNotificationsCache[sellerId] = { notifications: next, unreadCount: count };
  }, [sellerId]);

  const loadNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    if (!sellerId) return;
    const hasCache = !!sellerNotificationsCache[sellerId];
    if (!hasCache && !opts?.silent) setLoading(true);
    if (opts?.silent) setRefreshing(true);
    setError(null);
    try {
      const [notifRes, countRes] = await Promise.all([
        fetchNotifications(sellerId, PAGE_SIZE, 0),
        getUnreadCount(sellerId),
      ]);
      if (notifRes.error) throw new Error(notifRes.error);
      if (countRes.error) throw new Error(countRes.error);
      setNotifications(notifRes.data);
      setUnreadCount(countRes.count);
      setServerOffset(notifRes.data.length);
      setHasMore(notifRes.data.length >= PAGE_SIZE);
      syncCache(notifRes.data, countRes.count);
    } catch {
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sellerId, syncCache]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    if (!sellerId) return;
    let channel: ReturnType<typeof subscribeToNotifications> | null = null;
    try {
      channel = subscribeToNotifications(
        sellerId,
        (newNotif) => {
          setNotifications((prev) => {
            const next = [newNotif, ...prev.filter((n) => n.id !== newNotif.id)];
            setUnreadCount((c) => {
              const updated = c + (newNotif.is_read ? 0 : 1);
              syncCache(next, updated);
              return updated;
            });
            return next;
          });
        },
        (updatedNotif) => {
          setNotifications((prev) => {
            const next = prev.map((n) => (n.id === updatedNotif.id ? { ...n, ...updatedNotif } : n));
            const count = next.filter((n) => !n.is_read).length;
            setUnreadCount(count);
            syncCache(next, count);
            return next;
          });
        },
      );
    } catch { /* ignore */ }
    return () => {
      try { if (channel) unsubscribeFromNotifications(channel); } catch { /* ignore */ }
    };
  }, [sellerId, syncCache]);

  const loadMore = useCallback(async () => {
    if (!sellerId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error: fetchErr } = await fetchNotifications(sellerId, PAGE_SIZE, serverOffset);
      if (fetchErr) throw new Error(fetchErr);
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        const merged = [...prev, ...(data || []).filter((n) => !seen.has(n.id))];
        syncCache(merged, unreadCount);
        return merged;
      });
      setServerOffset((prev) => prev + (data || []).length);
      setHasMore((data || []).length >= PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [sellerId, loadingMore, hasMore, serverOffset, syncCache, unreadCount]);

  const handleMarkRead = useCallback(async (id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || target.is_read) return prev;
      const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      syncCache(next, Math.max(0, unreadCount - 1));
      return next;
    });
    setUnreadCount((c) => Math.max(0, c - 1));
    const { success } = await markAsRead(id, sellerId);
    if (!success) await loadNotifications({ silent: true });
  }, [sellerId, syncCache, unreadCount, loadNotifications]);

  const handleMarkAllRead = async () => {
    const { success } = await markAllAsRead(sellerId);
    if (!success) return;
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: true }));
      syncCache(next, 0);
      return next;
    });
    setUnreadCount(0);
  };

  const handleDelete = async (id: string) => {
    const wasUnread = notifications.find((n) => n.id === id)?.is_read === false;
    const { success } = await deleteNotification(id, sellerId);
    if (!success) return;
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      syncCache(next, wasUnread ? Math.max(0, unreadCount - 1) : unreadCount);
      return next;
    });
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleItemClick = (id: string) => {
    const n = notifications.find((item) => item.id === id);
    if (!n) return;
    if (!n.is_read) void handleMarkRead(id);
    const { path, state } = resolveSellerNotificationTarget(n);
    navigate(path, { state });
  };

  const filtered = useMemo(() => notifications.filter((n) => {
    if (readFilter === 'unread' && n.is_read) return false;
    if (readFilter === 'read' && !n.is_read) return false;
    if (!matchesCategory(n.type, categoryFilter)) return false;
    return true;
  }), [notifications, readFilter, categoryFilter]);

  const categoryCounts = useMemo(() => ({
    orders: notifications.filter((n) => ORDER_TYPES.has(n.type)).length,
    products: notifications.filter((n) => PRODUCT_TYPES.has(n.type)).length,
    payouts: notifications.filter((n) => PAYOUT_TYPES.has(n.type)).length,
    account: notifications.filter((n) => ACCOUNT_TYPES.has(n.type)).length,
  }), [notifications]);

  const inboxItems = filtered.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    createdAt: n.created_at,
    isRead: n.is_read,
    extra: notificationExtra(n),
  }));

  return (
    <NotificationInbox
      unreadCount={unreadCount}
      readFilter={readFilter}
      onReadFilterChange={setReadFilter}
      categoryFilters={[
        { key: 'all', label: 'All updates' },
        { key: 'orders', label: 'Orders', count: categoryCounts.orders },
        { key: 'products', label: 'Products', count: categoryCounts.products },
        { key: 'payouts', label: 'Payouts', count: categoryCounts.payouts },
        { key: 'account', label: 'Account', count: categoryCounts.account },
      ]}
      categoryFilter={categoryFilter}
      onCategoryFilterChange={(key) => setCategoryFilter(key as CategoryFilter)}
      items={inboxItems}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRetry={() => loadNotifications()}
      onRefresh={() => loadNotifications({ silent: true })}
      onMarkAllRead={handleMarkAllRead}
      onItemClick={handleItemClick}
      onItemDelete={handleDelete}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      hasMore={hasMore && readFilter === 'all' && categoryFilter === 'all'}
      emptyTitle={
        readFilter === 'unread' ? 'No unread notifications'
          : readFilter === 'read' ? 'No read notifications'
            : 'No notifications'
      }
      emptyMessage={
        categoryFilter !== 'all'
          ? 'Try another category filter.'
          : 'Order, product, and payout updates will appear here.'
      }
      showClearFilters={readFilter !== 'all' || categoryFilter !== 'all'}
      onClearFilters={() => { setReadFilter('all'); setCategoryFilter('all'); }}
      onBack={() => onNavigate('seller-dashboard')}
    />
  );
};

export default SellerNotifications;
