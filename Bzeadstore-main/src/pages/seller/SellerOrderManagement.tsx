import React, { useState, useEffect, useMemo, useRef } from 'react';
import { logger } from '../../utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Package, ShoppingBag, DollarSign,
  CheckCircle, XCircle,
  Truck, MapPin, Phone,
  Search, Filter, Download, Eye, AlertCircle, PackageCheck, Loader2, X
  , ChevronLeft, ChevronDown, ChevronUp, Copy, FileText, Navigation
} from 'lucide-react';
import { fetchOrdersBySeller, updateOrderStatus, fetchReturnsBySeller, processReturn, cancelOrder, recordStatusChange } from '../../lib/orderService';
import {
  downloadShippingDocument,
  SHIPPING_LABELS_BUCKET,
  SHIPPING_MANIFESTS_BUCKET,
  triggerPdfDownload,
} from '../../lib/shippingDocumentsService';
import { notifyOrderEvent } from '../../lib/notificationService';
import { trackByAwb as shiprocketTrackByAwb } from '../../lib/shiprocketOpsService';
import { getShippingProvider, trackShipment as shippoTrackShipment, refundLabel as shippoRefundLabel, createReturnLabel as shippoCreateReturnLabel } from '../../lib/shippoOpsService';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../../components/common/ToastContainer';
import { Skeleton, ListSkeleton } from '../../components/common/Skeleton';
import { buildInvoiceNumber, formatFrontend12DigitId } from '../../utils/idFormatter';
import { generateInvoicePdf } from '../../utils/invoicePdf';
import { fetchMultiSellerTat } from '../../lib/tatService';
import { resolveSellerLineTotal, resolveSellerUnitPrice, sumSellerOrderTotal } from '../../lib/orderPricingViews';
import { useSellerDisplayCurrency } from '../../hooks/useSellerDisplayCurrency';
import { resolveProductImageUrl } from '../../lib/productService';
import type { SellerNotificationNavState } from '../../lib/sellerNotificationNavigation';

type OrderStage =
  | 'new'
  | 'accepted'
  | 'packed'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'return_requested';

const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  new: 'New Order',
  accepted: 'Accepted',
  packed: 'Packed',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  return_requested: 'Return Requested',
};

type SellerOrderSegment = 'new' | 'in_transit' | 'delivered' | 'cancelled';

const ORDER_SEGMENT_STAGES: Record<SellerOrderSegment, OrderStage[]> = {
  new: ['new'],
  in_transit: ['accepted', 'packed', 'in_transit', 'out_for_delivery'],
  delivered: ['delivered'],
  cancelled: ['cancelled', 'returned', 'return_requested'],
};

const SELLER_ORDER_ITEM_PREVIEW_COUNT = 2;

const normalizeOrderStage = (status: string): OrderStage => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'pending') return 'new';
  if (normalized === 'processing') return 'new';
  if (normalized === 'shipped') return 'in_transit';
  if (normalized === 'out for delivery') return 'out_for_delivery';
  if (normalized === 'return_requested') return 'return_requested';
  if (normalized in ORDER_STAGE_LABELS) return normalized as OrderStage;
  return 'new';
};

const nextStatusByAction: Record<'accept' | 'pack' | 'transit' | 'outForDelivery' | 'reject', OrderStage> = {
  accept: 'accepted',
  pack: 'packed',
  transit: 'in_transit',
  outForDelivery: 'out_for_delivery',
  reject: 'cancelled',
};

const DEFAULT_ORDER_ITEM_IMAGE = '/images/logo/logo.png';

const resolveOrderItemImage = (item: any): string => {
  if (!item || typeof item !== 'object') return DEFAULT_ORDER_ITEM_IMAGE;

  const variantInfo = item.variant_info && typeof item.variant_info === 'object'
    ? item.variant_info
    : {};

  const rawCandidates = [
    // Prefer the freshly joined products row first, so a stale/broken
    // order_items.product_image cannot mask a working product image.
    item?.products?.image_url,
    Array.isArray(item?.products?.images) ? item.products.images[0] : null,
    item.product_image,
    item.image_url,
    item.image,
    item.thumbnail,
    item?.product?.image_url,
    Array.isArray(item?.product?.images) ? item.product.images[0] : null,
    (variantInfo as any).image_url,
    (variantInfo as any).image,
    Array.isArray((variantInfo as any).images) ? (variantInfo as any).images[0] : null,
  ];

  for (const candidate of rawCandidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const resolved = resolveProductImageUrl(candidate);
    if (resolved) return resolved;
    if (candidate.startsWith('/')) return candidate;
  }

  return DEFAULT_ORDER_ITEM_IMAGE;
};

interface Order {
  id: string;
  order_number: string;
  items: any[];
  user_id: string;
  seller_id: string;
  status: OrderStage;
  raw_status: string;
  total_amount: number;
    seller_total_amount?: number;
  currency?: string;
  payment_method?: string;
  payment_status: 'pending' | 'paid' | 'completed' | 'failed' | 'refunded';
  tracking_number?: string;
  admin_label_path?: string | null;
  admin_manifest_path?: string | null;
  shipping_address: any;
  shipping_charge?: number;
  created_at: string;
  updated_at: string;
}

interface SellerOrderManagementProps {
  sellerEmail: string;
  onNavigate: (view: any) => void;
}

// Module-level cache keyed by seller id. Survives unmounts so revisiting the
// orders tab renders instantly while a silent refresh happens in the background.
const sellerOrdersCache: Record<string, { orders: Order[]; returns: any[] }> = {};

const SellerOrderManagement: React.FC<SellerOrderManagementProps> = ({ sellerEmail, onNavigate }) => {
  const { user, currentAuthUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const { sellerCurrency, convertToSellerCurrency, formatSellerAmount } = useSellerDisplayCurrency(sellerId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingId, setTrackingId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showActionModal, setShowActionModal] = useState<'accept' | 'pack' | 'transit' | 'outForDelivery' | 'reject' | null>(null);
  const [orders, setOrders] = useState<Order[]>(() => sellerOrdersCache[sellerId]?.orders || []);
  const [loading, setLoading] = useState(() => !sellerOrdersCache[sellerId]);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid' | 'completed' | 'failed' | 'refunded'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [returnRequests, setReturnRequests] = useState<any[]>(() => sellerOrdersCache[sellerId]?.returns || []);
  const [showReturnModal, setShowReturnModal] = useState<{ returnReq: any; action: 'approve' | 'reject' } | null>(null);
  const [returnResponse, setReturnResponse] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);
  const [labelDownloadingId, setLabelDownloadingId] = useState<string | null>(null);
  const [manifestDownloadingId, setManifestDownloadingId] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [sellerBusinessCountry, setSellerBusinessCountry] = useState<string>('');
  const [refundingLabelId, setRefundingLabelId] = useState<string | null>(null);
  const [creatingReturnLabelId, setCreatingReturnLabelId] = useState<string | null>(null);
  const [downloadedLabelOrderIds, setDownloadedLabelOrderIds] = useState<Set<string>>(new Set());
  const [segmentFilter, setSegmentFilter] = useState<SellerOrderSegment>('new');
  const [expandedItemOrders, setExpandedItemOrders] = useState<Set<string>>(new Set());
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const lastHandledNotificationId = useRef<string | null>(null);

  const isUkOriginSeller = sellerBusinessCountry ? getShippingProvider(sellerBusinessCountry, 'GB') === 'shippo' : false;

  const getSellerOrderTotal = (order: Order): number => {
    if (order.seller_total_amount != null) {
      return Number(order.seller_total_amount || 0);
    }
    return sumSellerOrderTotal((order.items || []) as Array<Record<string, any>>);
  };

  // Helper: detect international orders
  const isInternationalOrder = (order: Order): boolean => {
    const addr = order.shipping_address || {};
    const country = (addr.country || addr.countryCode || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!country) return false;
    return !['INDIA', 'IN', 'IND'].includes(country);
  };

  // Fetch orders from Supabase
  useEffect(() => {
    const fetchOrders = async () => {
      const hasCache = !!sellerOrdersCache[sellerId];
      try {
        if (!hasCache) setLoading(true);
        setError(null);

        if (!sellerId) {
          setError('Failed to load orders. Please sign in again.');
          return;
        }

        const { data, error: fetchError } = await fetchOrdersBySeller(sellerId, { limit: 100 });

        if (fetchError) {
          console.error('[SellerOrders] Fetch error:', fetchError, 'sellerId:', sellerId);
          setError('Failed to load orders. Please try again.');
        } else {
          // Map order_items from joined data to items field; normalize pending -> new
          const mapped = (data || []).map((o: any) => ({
            ...o,
            raw_status: o?.status || 'new',
            status: normalizeOrderStage(o?.status),
            items: o.order_items || o.items || [],
          }));
          setOrders(mapped);
          // Write to module cache so revisits skip the loading state.
          if (sellerId) {
            sellerOrdersCache[sellerId] = {
              orders: mapped,
              returns: sellerOrdersCache[sellerId]?.returns || [],
            };
          }
        }
      } catch (err) {
        logger.error('Failed to fetch orders:', err as Record<string, any>);
        setError('Failed to load orders. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (user?.id || currentAuthUser?.userId) {
      fetchOrders();
      // Fetch return requests for this seller
      if (sellerId) {
        fetchReturnsBySeller(sellerId).then(({ data }) => {
          const list = data || [];
          setReturnRequests(list);
          sellerOrdersCache[sellerId] = {
            orders: sellerOrdersCache[sellerId]?.orders || [],
            returns: list,
          };
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentAuthUser?.userId]);

  useEffect(() => {
    const nav = location.state as SellerNotificationNavState | null;
    if (!nav?.fromNotification) return;
    if (nav.notificationId === lastHandledNotificationId.current) return;
    if (loading) return;

    if (nav.orderSegment) setSegmentFilter(nav.orderSegment);
    if (nav.orderNumber) setSearchQuery(nav.orderNumber);

    const order = orders.find(
      (o) => (nav.orderId && o.id === nav.orderId)
        || (nav.orderNumber && o.order_number === nav.orderNumber),
    );

    if (!order) {
      if (orders.length === 0) return;
      lastHandledNotificationId.current = nav.notificationId;
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    lastHandledNotificationId.current = nav.notificationId;
    setHighlightOrderId(order.id);
    setDetailsOrder(order);
    window.setTimeout(() => {
      document.getElementById(`seller-order-${order.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    window.setTimeout(() => setHighlightOrderId(null), 4000);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, loading, orders, navigate, location.pathname]);

  // Realtime: when an order changes (e.g. buyer cancels), update the local
  // list in place so the seller view immediately reflects the new status
  // (order moves from New → Cancelled tile without a manual refresh).
  useEffect(() => {
    if (!sellerId) return;
    const channel = supabase
      .channel(`seller-orders-${sellerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `seller_id=eq.${sellerId}` },
        (payload: any) => {
          const updated = payload.new;
          if (!updated?.id) return;
          setOrders((prev) => {
            const next = prev.map((o: any) =>
              o.id === updated.id
                ? {
                    ...o,
                    ...updated,
                    raw_status: updated.status,
                    status: normalizeOrderStage(updated.status),
                    items: o.items,
                    order_items: o.order_items,
                  }
                : o
            );
            sellerOrdersCache[sellerId] = {
              orders: next,
              returns: sellerOrdersCache[sellerId]?.returns || [],
            };
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId]);

  // Fetch seller's business country for shipping provider routing
  useEffect(() => {
    if (!sellerId) return;
    supabase
      .from('seller_kyc')
      .select('business_country')
      .eq('seller_id', sellerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.business_country) setSellerBusinessCountry(data.business_country);
      });
  }, [sellerId]);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const isWithinRange = (createdAt: string) => {
      if (dateFilter === 'all') return true;
      const created = new Date(createdAt);
      if (dateFilter === 'today') {
        return created.toDateString() === now.toDateString();
      }
      if (dateFilter === '7d') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return created >= sevenDaysAgo;
      }
      if (dateFilter === '30d') {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return created >= thirtyDaysAgo;
      }
      return true;
    };

    const matchesSearchAndFilters = (order: Order) => {
      const matchesSearch =
        order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.items && order.items.some((item: any) =>
          item.product_name?.toLowerCase().includes(searchQuery.toLowerCase())
        ));
      if (!matchesSearch) return false;
      if (paymentFilter !== 'all') {
        const ps = order.payment_status;
        if (paymentFilter === 'paid') {
          if (!(ps === 'paid' || ps === 'completed')) return false;
        } else if (ps !== paymentFilter) {
          return false;
        }
      }
      return isWithinRange(order.created_at);
    };

    return orders
      .filter(matchesSearchAndFilters)
      .filter((order) => ORDER_SEGMENT_STAGES[segmentFilter].includes(normalizeOrderStage(order.status)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, searchQuery, paymentFilter, dateFilter, segmentFilter]);

  const exportableOrders = useMemo(() => {
    const now = new Date();
    const isWithinRange = (createdAt: string) => {
      if (dateFilter === 'all') return true;
      const created = new Date(createdAt);
      if (dateFilter === 'today') return created.toDateString() === now.toDateString();
      if (dateFilter === '7d') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return created >= sevenDaysAgo;
      }
      if (dateFilter === '30d') {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return created >= thirtyDaysAgo;
      }
      return true;
    };

    return orders
      .filter(order =>
        order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.items && order.items.some((item: any) =>
          item.product_name?.toLowerCase().includes(searchQuery.toLowerCase())
        ))
      )
      .filter((order) => {
        if (paymentFilter === 'all') return true;
        const ps = order.payment_status;
        if (paymentFilter === 'paid') return ps === 'paid' || ps === 'completed';
        return ps === paymentFilter;
      })
      .filter((order) => isWithinRange(order.created_at))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, searchQuery, paymentFilter, dateFilter]);

  const ORDERS_PER_PAGE = 15;
  const [orderPage, setOrderPage] = useState(1);
  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const clampedPage = Math.min(orderPage, orderTotalPages);
  const paginatedOrders = filteredOrders.slice((clampedPage - 1) * ORDERS_PER_PAGE, clampedPage * ORDERS_PER_PAGE);

  // Reset to page 1 when filters change
  useEffect(() => { setOrderPage(1); }, [searchQuery, paymentFilter, dateFilter, segmentFilter]);

  const handleExportOrders = async () => {
    try {
      setIsExporting(true);
      const headers = ['Order Number', 'Date', 'Status', 'Payment Status', 'Amount', 'Tracking Number', 'Items Count'];
      const rows = exportableOrders.map((order) => [
        order.order_number,
        new Date(order.created_at).toISOString(),
        order.status,
        order.payment_status,
        String(getSellerOrderTotal(order)),
        order.tracking_number || '',
        String(order.items?.length || 0),
      ]);

      const escapeCsv = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `seller-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const segmentCounts = {
    new: orders.filter(o => normalizeOrderStage(o.status) === 'new').length,
    in_transit: orders.filter(o => ORDER_SEGMENT_STAGES.in_transit.includes(normalizeOrderStage(o.status))).length,
    delivered: orders.filter(o => normalizeOrderStage(o.status) === 'delivered').length,
    cancelled: orders.filter(o => ORDER_SEGMENT_STAGES.cancelled.includes(normalizeOrderStage(o.status))).length,
  };

  const segmentTabs: Array<{
    key: SellerOrderSegment;
    label: string;
    shortLabel: string;
    count: number;
  }> = [
    { key: 'new', label: 'New', shortLabel: 'New', count: segmentCounts.new },
    { key: 'in_transit', label: 'In Transit', shortLabel: 'Transit', count: segmentCounts.in_transit },
    { key: 'delivered', label: 'Delivered', shortLabel: 'Delivered', count: segmentCounts.delivered },
    { key: 'cancelled', label: 'Cancelled', shortLabel: 'Cancelled', count: segmentCounts.cancelled },
  ];

  const getStatusAccentBorder = (stage: OrderStage) => {
    switch (stage) {
      case 'delivered': return 'bg-green-500';
      case 'cancelled':
      case 'returned':
      case 'return_requested': return 'bg-red-500';
      case 'in_transit':
      case 'out_for_delivery': return 'bg-purple-500';
      case 'accepted':
      case 'packed': return 'bg-cyan-500';
      default: return 'bg-blue-500';
    }
  };

  const getPartyInitial = (name: string) => {
    const trimmed = String(name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  };

  const toggleOrderItemsExpanded = (orderId: string) => {
    setExpandedItemOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const copyTrackingNumber = async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      toast.success('Tracking number copied');
    } catch {
      toast.error('Could not copy tracking number');
    }
  };

  const handleAcceptOrder = (order: Order) => {
    setSelectedOrder(order);
    setShowActionModal('accept');
  };

  const handleRejectOrder = (order: Order) => {
    setSelectedOrder(order);
    setShowActionModal('reject');
  };

  const handleMarkPacked = (order: Order) => {
    setSelectedOrder(order);
    setShowActionModal('pack');
  };

  // International: track via Shiprocket
  const handleTrackIntlOrder = async (order: Order) => {
    if (!order.tracking_number || !sellerId) return;
    try {
      setTrackingOrderId(order.id);
      setTrackingLoading(true);
      setTrackingEvents([]);

      const result = await shiprocketTrackByAwb({
        sellerId,
        orderId: order.id,
        requestData: { awb: order.tracking_number },
      });

      if (result.error) {
        toast.error(`Tracking failed: ${result.error}`);
        setTrackingOrderId(null);
        return;
      }

      // Extract Shiprocket tracking activities
      const payload = result.data as any;
      const trackingData = payload?.tracking_data || payload;
      const activities = trackingData?.shipment_track_activities
        || trackingData?.scans
        || [];

      const events = (Array.isArray(activities) ? activities : []).map((act: any) => ({
        status: act.activity || act.status || act.sr_status_label || 'Update',
        location: act.location || act.city || '',
        date: act.date || act.event_at || '',
        type: act['sr-status'] || act.sr_status || '',
      }));

      setTrackingEvents(events);
    } catch (err: any) {
      toast.error(`Tracking error: ${err.message || 'Unknown error'}`);
      setTrackingOrderId(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  // UK-origin: track via Shippo
  const handleTrackShippoOrder = async (order: Order) => {
    if (!order.tracking_number || !sellerId) return;
    try {
      setTrackingOrderId(order.id);
      setTrackingLoading(true);
      setTrackingEvents([]);

      // Look up the carrier from shippo_shipments
      const { data: shippoShipment } = await supabase
        .from('shippo_shipments')
        .select('courier_name')
        .eq('order_id', order.id)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const carrier = shippoShipment?.courier_name || '';
      if (!carrier) {
        toast.error('Carrier info not found for this Shippo shipment. Tracking unavailable.');
        setTrackingOrderId(null);
        return;
      }

      const result = await shippoTrackShipment({
        sellerId,
        orderId: order.id,
        requestData: {
          tracking_number: order.tracking_number,
          carrier,
        },
      });

      if (result.error) {
        toast.error(`Tracking failed: ${result.error}`);
        setTrackingOrderId(null);
        return;
      }

      const payload = result.data as any;
      const history = payload?.tracking_history || [];
      const events = (Array.isArray(history) ? history : []).map((ev: any) => ({
        status: ev.status || ev.details || 'Update',
        location: ev.location || '',
        date: ev.date || '',
        type: '',
      }));

      setTrackingEvents(events);
    } catch (err: any) {
      toast.error(`Tracking error: ${err.message || 'Unknown error'}`);
      setTrackingOrderId(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleDownloadAdminLabel = async (order: Order) => {
    if (!order.admin_label_path || !sellerId) return;
    try {
      setLabelDownloadingId(order.id);
      const { data, error } = await downloadShippingDocument(SHIPPING_LABELS_BUCKET, order.admin_label_path);
      if (error || !data) {
        toast.error('Shipping label not available yet. Please contact admin.');
        return;
      }
      triggerPdfDownload(data, `shipping-label-${order.order_number || order.id}.pdf`);
      setDownloadedLabelOrderIds((prev) => new Set(prev).add(order.id));
    } catch (err: any) {
      toast.error(`Label download error: ${err.message || 'Unknown error'}`);
    } finally {
      setLabelDownloadingId(null);
    }
  };

  const handleDownloadAdminManifest = async (order: Order) => {
    if (!order.admin_manifest_path || !sellerId) return;
    try {
      setManifestDownloadingId(order.id);
      const { data, error } = await downloadShippingDocument(SHIPPING_MANIFESTS_BUCKET, order.admin_manifest_path);
      if (error || !data) {
        toast.error('Shipping manifest not available yet. Please contact admin.');
        return;
      }
      triggerPdfDownload(data, `shipping-manifest-${order.order_number || order.id}.pdf`);
    } catch (err: any) {
      toast.error(`Manifest download error: ${err.message || 'Unknown error'}`);
    } finally {
      setManifestDownloadingId(null);
    }
  };

  // UK-origin: refund unused Shippo label
  const handleRefundShippoLabel = async (order: Order) => {
    if (!sellerId) return;
    if (!confirm('Are you sure you want to refund the shipping label for this order? This cannot be undone.')) return;
    try {
      setRefundingLabelId(order.id);

      const { data: shippoShipment } = await supabase
        .from('shippo_shipments')
        .select('shippo_transaction_id')
        .eq('order_id', order.id)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!shippoShipment?.shippo_transaction_id) {
        toast.error('No Shippo transaction found for this order.');
        return;
      }

      const result = await shippoRefundLabel({
        sellerId,
        orderId: order.id,
        requestData: { transaction_id: shippoShipment.shippo_transaction_id },
      });

      if (result.error) {
        toast.error(`Refund failed: ${result.error}`);
        return;
      }

      const d = result.data as any;
      toast.success(`Label refund ${d?.status === 'QUEUED' ? 'queued' : 'processed'}. Refund ID: ${d?.refund_id || 'N/A'}`);
    } catch (err: any) {
      toast.error(`Refund error: ${err.message || 'Unknown error'}`);
    } finally {
      setRefundingLabelId(null);
    }
  };

  // UK-origin: create return shipping label
  const handleCreateReturnLabel = async (order: Order) => {
    if (!sellerId) return;
    if (!confirm('Create a return shipping label for this order? The return label cost will apply.')) return;
    try {
      setCreatingReturnLabelId(order.id);

      const result = await shippoCreateReturnLabel({
        sellerId,
        orderId: order.id,
        requestData: {},
      });

      if (result.error) {
        toast.error(`Return label failed: ${result.error}`);
        return;
      }

      const d = result.data as any;
      let msg = `Return label created. Tracking: ${d?.tracking_number || 'N/A'}`;
      if (d?.label_url) {
        msg += ' Opening label for download...';
        window.open(d.label_url, '_blank');
      }
      toast.success(msg);
    } catch (err: any) {
      toast.error(`Return label error: ${err.message || 'Unknown error'}`);
    } finally {
      setCreatingReturnLabelId(null);
    }
  };

  const handleMarkOutForDelivery = (order: Order) => {
    setSelectedOrder(order);
    setShowActionModal('outForDelivery');
  };

  const renderAdminLabelDownloadButton = (order: Order) => {
    if (!order.admin_label_path) return null;
    return (
      <button
        type="button"
        onClick={() => void handleDownloadAdminLabel(order)}
        disabled={labelDownloadingId === order.id}
        className="flex-1 sm:flex-initial bg-teal-600 hover:bg-teal-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {labelDownloadingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        {labelDownloadingId === order.id ? 'Downloading...' : 'Download Shipping Label'}
      </button>
    );
  };

  const renderAdminManifestDownloadButton = (order: Order) => {
    if (!order.admin_manifest_path) return null;
    return (
      <button
        type="button"
        onClick={() => void handleDownloadAdminManifest(order)}
        disabled={manifestDownloadingId === order.id}
        className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {manifestDownloadingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        {manifestDownloadingId === order.id ? 'Downloading...' : 'Download Manifest'}
      </button>
    );
  };

  const renderAwaitingAdminUploadMessage = (order: Order) => {
    if (!order.tracking_number) return null;
    const missingLabel = !order.admin_label_path;
    const missingManifest = !order.admin_manifest_path;
    if (!missingLabel && !missingManifest) return null;
    const parts = [
      missingLabel ? 'label' : null,
      missingManifest ? 'manifest' : null,
    ].filter(Boolean);
    return (
      <div className="flex-1 sm:flex-initial bg-amber-50 border border-amber-200 text-amber-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] flex items-center justify-center gap-1.5">
        <AlertCircle size={16} />
        Waiting for admin to upload {parts.join(' and ')}.
      </div>
    );
  };

  const handleTrackOrder = async (order: Order) => {
    if (!order.tracking_number || !sellerId) return;
    try {
      setTrackingOrderId(order.id);
      setTrackingLoading(true);
      setTrackingEvents([]);

      const result = await shippoTrackShipment({
        sellerId,
        orderId: order.id,
        requestData: {
          waybill: order.tracking_number,
        },
      });

      if (result.error) {
        toast.error(`Tracking failed: ${result.error}`);
        setTrackingOrderId(null);
        return;
      }

      // Extract tracking scans from response
      const payload = (result.data as Record<string, unknown>)?.payload as any;
      const scans = payload?.ShipmentData?.[0]?.Shipment?.Scans ||
                    payload?.shipment_data?.[0]?.shipment?.scans ||
                    payload?.Scans || payload?.scans || [];

      const events = (Array.isArray(scans) ? scans : []).map((scan: any) => {
        const s = scan?.ScanDetail || scan?.scan_detail || scan || {};
        return {
          status: s.Instructions || s.instructions || s.Status || s.status || '',
          location: s.ScannedLocation || s.scanned_location || s.Scan || s.location || '',
          date: s.ScanDateTime || s.scan_date_time || s.StatusDateTime || s.event_at || '',
          type: s.ScanType || s.scan_type || '',
        };
      });

      setTrackingEvents(events);
    } catch (err: any) {
      toast.error(`Tracking error: ${err.message || 'Unknown error'}`);
      setTrackingOrderId(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleApproveReturn = (returnReq: any) => {
    setShowReturnModal({ returnReq, action: 'approve' });
    setReturnResponse('');
  };

  const handleRejectReturn = (returnReq: any) => {
    setShowReturnModal({ returnReq, action: 'reject' });
    setReturnResponse('');
  };

  const confirmReturnAction = async () => {
    if (!showReturnModal) return;
    const { returnReq, action } = showReturnModal;
    try {
      setProcessingReturn(true);
      const { success, error: retError } = await processReturn({
        returnId: returnReq.id,
        action,
        processedBy: sellerId,
        role: 'seller',
        response: returnResponse || undefined,
        refundAmount: action === 'approve'
          ? sumSellerOrderTotal((returnReq.orders?.order_items || []) as Array<Record<string, any>>)
          : undefined,
      });

      if (!success) {
        toast.error(`Failed to ${action} return: ${retError}`);
        return;
      }

      // Update local orders list
      const orderId = returnReq.order_id;
      const newStatus = action === 'approve' ? 'returned' : 'delivered';
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as OrderStage } : o));

      // Remove processed return from list
      setReturnRequests(prev => prev.filter(r => r.id !== returnReq.id));

      // Send notifications
      const buyerId = returnReq.orders?.user_id || returnReq.user_id;
      const orderNumber = returnReq.orders?.order_number || returnReq.order_id;
      if (buyerId) {
        const returnNotifType = action === 'approve' ? 'return_approved' : 'return_rejected';
        await notifyOrderEvent({
          type: returnNotifType as import('../../lib/notificationService').NotificationType,
          orderId,
          orderNumber: String(orderNumber),
          buyerId,
          sellerIds: [sellerId],
          adminNotify: returnNotifType === 'return_rejected',
          title: `Return ${action === 'approve' ? 'Approved' : 'Rejected'}`,
          message: `Your return request for order ${orderNumber} has been ${action === 'approve' ? 'approved' : 'rejected'}.${returnResponse ? ' Reason: ' + returnResponse : ''}`,
          metadata: { status: newStatus },
          emailData: {
            order_id: String(orderNumber),
            reason: returnResponse || undefined,
          },
        });
      }

      setShowReturnModal(null);
      setReturnResponse('');
    } catch (err: any) {
      toast.error(`Failed to process return: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingReturn(false);
    }
  };

  const getMonthlyOrderSequence = async (createdAt: string): Promise<number> => {
    const bookingDate = new Date(createdAt);
    if (Number.isNaN(bookingDate.getTime())) return 1;

    const monthStart = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), 1).toISOString();
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart)
      .lte('created_at', createdAt);

    return count && count > 0 ? count : 1;
  };

  const handleDownloadInvoice = async (order: Order) => {
    try {
    const invoiceSequence = await getMonthlyOrderSequence(order.created_at);
    const invoiceNumber = buildInvoiceNumber(order.created_at, invoiceSequence, order.id);

    const { data: kyc } = await supabase
      .from('seller_kyc')
      .select('business_name, full_name, email, phone, business_street_address_1, business_street_address_2, business_city, business_state, business_postal_code, business_country')
      .eq('seller_id', sellerId)
      .maybeSingle();

    const shipping = order.shipping_address || {};
    const destinationPin = shipping.postalCode || shipping.postal_code || '';
    const productIds = (order.items || []).map((item: any) => String(item.product_id));
    let resolvedDeliveryIso = shipping.expected_delivery_date || shipping.expectedDeliveryDate || '';
    if (!resolvedDeliveryIso && destinationPin) {
      try {
        const tatResult = await fetchMultiSellerTat(productIds, destinationPin, sellerId);
        resolvedDeliveryIso = tatResult.maxExpectedDate || '';
      } catch {
        resolvedDeliveryIso = '';
      }
    }
    const orderItems = order.items || [];

    // Fetch product-level SKU/HSN for items missing them in variant_info
    const productIdsNeedingMeta = orderItems
      .filter((item: any) => {
        const vi = item.variant_info || {};
        return !vi.sku || !vi.hsn_code;
      })
      .map((item: any) => item.product_id)
      .filter(Boolean);

    let productMetaMap = new Map<string, { sku: string | null; hsn_code: string | null }>();
    if (productIdsNeedingMeta.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, sku, hsn_code')
        .in('id', productIdsNeedingMeta);
      if (products) {
        productMetaMap = new Map(products.map((p: any) => [String(p.id), { sku: p.sku || null, hsn_code: p.hsn_code || null }]));
      }
    }

    const items = orderItems.map((item: any) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = convertToSellerCurrency(resolveSellerUnitPrice(item), 'INR');
      const vi = item.variant_info || {};
      const meta = productMetaMap.get(String(item.product_id));
      return {
        name: item.product_name || 'Product',
        sku: vi.sku || meta?.sku || undefined,
        hsn_code: vi.hsn_code || meta?.hsn_code || undefined,
        qty,
        unitPrice,
        total: convertToSellerCurrency(resolveSellerLineTotal(item), 'INR'),
      };
    });

    await generateInvoicePdf(
      {
        invoiceNumber,
        orderId: formatFrontend12DigitId(order.id),
        orderDate: new Date(order.created_at).toLocaleDateString(),
        deliveryDate: resolvedDeliveryIso ? new Date(resolvedDeliveryIso).toLocaleDateString() : 'Not available',
        paymentMethod: (order.payment_method || 'card').toUpperCase(),
        sellerName: kyc?.business_name || kyc?.full_name || user?.full_name || sellerEmail,
        sellerAddress: [
          kyc?.business_street_address_1,
          kyc?.business_street_address_2,
          kyc?.business_city,
          kyc?.business_state,
          kyc?.business_postal_code,
          kyc?.business_country,
        ].filter(Boolean).join(', '),
        sellerContact: kyc?.phone || kyc?.email || sellerEmail,
        buyerName: shipping.name || shipping.full_name || shipping.fullName || 'Buyer',
        buyerAddress: [
          shipping.street,
          shipping.address,
          shipping.address_line_1,
          shipping.address_line1,
          shipping.line1,
          shipping.city,
          shipping.state,
          shipping.postalCode,
          shipping.postal_code,
          shipping.country,
        ].filter(Boolean).join(', '),
        buyerPhone: shipping.phone || shipping.phone_number || shipping.mobile || 'Not available',
        items,
        currency: sellerCurrency,
        totalPaid: convertToSellerCurrency(getSellerOrderTotal(order), 'INR'),
        shippingCharge: 0,
        summaryMode: 'seller',
      },
      (amount: number, fromCurrency?: string) => formatSellerAmount(amount, fromCurrency || sellerCurrency),
    );
    } catch (err) {
      logger.error('Invoice generation failed:', err as Record<string, any>);
      toast.error('Failed to generate invoice. Please try again.');
    }
  };

  const confirmAction = async () => {
    if (!selectedOrder) return;

    try {
      setUpdating(true);
      const newStatus = showActionModal
        ? nextStatusByAction[showActionModal]
        : selectedOrder.status;
      const fromStatus = selectedOrder.raw_status || selectedOrder.status;

      // --- Reject: use cancelOrder for proper audit trail ---
      if (showActionModal === 'reject') {
        const { success, error: cancelErr } = await cancelOrder({
          orderId: selectedOrder.id,
          cancelledBy: sellerId,
          role: 'seller',
          reason: rejectionReason,
        });

        if (!success) {
          toast.error(cancelErr || 'Failed to reject order. Please try again.');
        } else {
          setOrders(orders.map(o =>
            o.id === selectedOrder.id
              ? { ...o, status: 'cancelled' as OrderStage, raw_status: 'cancelled' }
              : o
          ));

          const orderNumber = selectedOrder.order_number;
          await notifyOrderEvent({
            type: 'order_rejected',
            orderId: selectedOrder.id,
            orderNumber,
            buyerId: selectedOrder.user_id,
            sellerIds: [sellerId],
            adminNotify: true,
            title: `Order ${orderNumber} rejected`,
            message: `Your order has been rejected by the seller. Reason: ${rejectionReason}`,
            metadata: { status: 'cancelled' },
            emailData: {
              order_id: orderNumber,
              customer_name: selectedOrder.shipping_address?.name || 'Customer',
              reason: rejectionReason,
            },
          });

          setShowActionModal(null);
          setSelectedOrder(null);
          setTrackingId('');
          setRejectionReason('');
          logger.log('Order rejected successfully', { orderId: selectedOrder.order_number });
        }
        return;
      }

      // --- All other actions: update status + record history ---
      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (trackingId) updatePayload.tracking_number = trackingId;
      if (newStatus === 'delivered') updatePayload.completed_at = new Date().toISOString();

      const { data: updatedOrder, error: updateError } = await updateOrderStatus(
        selectedOrder.id,
        updatePayload as any
      );

      if (updateError || !updatedOrder) {
        toast.error('Failed to update order. Please try again.');
      } else {
        const mapped = {
          ...updatedOrder,
          raw_status: (updatedOrder as any).status || newStatus,
          status: normalizeOrderStage((updatedOrder as any).status),
          items: (updatedOrder as any).order_items || [],
        };
        setOrders(orders.map(o => o.id === selectedOrder.id ? mapped : o));

        // Record status change in audit history
        const { error: historyErr } = await recordStatusChange({
          orderId: selectedOrder.id,
          fromStatus: String(fromStatus),
          toStatus: String(newStatus),
          changedBy: sellerId,
          role: 'seller',
          note: `Seller moved order to ${ORDER_STAGE_LABELS[newStatus]}`,
        });
        if (historyErr) {
          logger.error('Failed to record status history:', { error: historyErr });
        }

        const orderNumber = selectedOrder.order_number;
        const statusLabel = ORDER_STAGE_LABELS[newStatus];
        const metadata = {
          status: newStatus,
        };

        // Map status to proper notification type
        const notifTypeMap: Record<string, string> = {
          accepted: 'order_accepted',
          packed: 'order_shipped',
          in_transit: 'order_shipped',
          out_for_delivery: 'order_shipped',
          delivered: 'order_delivered',
        };
        const notifType = (notifTypeMap[newStatus] || 'order_placed') as import('../../lib/notificationService').NotificationType;

        // Admin notify for: accepted, shipped, delivered
        const shouldAdminNotify = ['accepted', 'packed', 'in_transit', 'delivered'].includes(newStatus);

        await notifyOrderEvent({
          type: notifType,
          orderId: selectedOrder.id,
          orderNumber,
          buyerId: selectedOrder.user_id,
          sellerIds: [sellerId],
          adminNotify: shouldAdminNotify,
          title: `Order ${orderNumber} updated`,
          message: `Your order is now ${statusLabel}.`,
          metadata,
          emailData: {
            order_id: orderNumber,
            customer_name: selectedOrder.shipping_address?.name || 'Customer',
            tracking_number: selectedOrder.tracking_number || undefined,
          },
        });

        setShowActionModal(null);
        setSelectedOrder(null);
        setTrackingId('');
        setRejectionReason('');
        logger.log('Order updated successfully', { orderId: selectedOrder.order_number, newStatus });
      }
    } catch (err) {
      logger.error('Failed to update order:', err as Record<string, any>);
      toast.error('Failed to update order. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: Order['status']) => {
    const badges = {
      new: { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/30', label: 'New Order', dot: 'bg-blue-500' },
      accepted: { bg: 'bg-yellow-500/10', text: 'text-yellow-700', border: 'border-yellow-500/30', label: 'Accepted', dot: 'bg-yellow-500' },
      packed: { bg: 'bg-cyan-500/10', text: 'text-cyan-700', border: 'border-cyan-500/30', label: 'Packed', dot: 'bg-cyan-500' },
      in_transit: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-500/30', label: 'In Transit', dot: 'bg-purple-500' },
      out_for_delivery: { bg: 'bg-indigo-500/10', text: 'text-indigo-600', border: 'border-indigo-500/30', label: 'Out for Delivery', dot: 'bg-indigo-500' },
      delivered: { bg: 'bg-green-500/10', text: 'text-green-600', border: 'border-green-500/30', label: 'Delivered', dot: 'bg-green-500' },
      cancelled: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30', label: 'Cancelled', dot: 'bg-red-500' },
      returned: { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/30', label: 'Returned', dot: 'bg-orange-500' },
      return_requested: { bg: 'bg-amber-500/10', text: 'text-amber-700', border: 'border-amber-500/30', label: 'Return Requested', dot: 'bg-amber-500' }
    };
    const badge = badges[normalizeOrderStage(status)];
    return (
      <span className={`${badge.bg} ${badge.text} ${badge.border} border text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider inline-flex items-center gap-1.5`}>
        <span className={`w-2 h-2 rounded-full ${badge.dot} shrink-0`} />
        {badge.label}
      </span>
    );
  };

  const getPaymentBadge = (status: Order['payment_status']) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      paid: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Paid' },
      pending: { bg: 'bg-orange-500/10', text: 'text-orange-500', label: 'Pending' },
      failed: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Failed' },
      refunded: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Refunded' }
    };
    const badge = badges[status] || { bg: 'bg-gray-500/10', text: 'text-gray-500', label: status || 'Unknown' };
    return (
      <span className={`${badge.bg} ${badge.text} text-[11px] font-bold px-2 py-0.5 rounded uppercase`}>
        {badge.label}
      </span>
    );
  };

  return (
    <>
          <ToastContainer toasts={toast.toasts} dismiss={toast.dismiss} />
          {/* Header */}
          <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-8">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  onClick={() => onNavigate('seller-dashboard')}
                  className="lg:hidden shrink-0 p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                  aria-label="Back to dashboard"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-2xl md:text-3xl font-bold text-gray-900 truncate">Order Management</h2>
                  <p className="text-gray-600 text-[11px] sm:text-sm font-medium mt-0.5 truncate">Track and manage all your customer orders</p>
                </div>
              </div>
              <div className="flex gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={handleExportOrders}
                  disabled={isExporting || exportableOrders.length === 0}
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold p-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all text-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={() => setShowFilterDialog(true)}
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold p-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all text-xs flex items-center gap-2"
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">Filter</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search + segment filters */}
          <div className="bg-white border border-gray-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 mb-4 sm:mb-6 flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="Search orders, products, buyers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl pl-9 sm:pl-12 pr-3 py-2 sm:py-3 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="flex justify-center">
              <div
                role="tablist"
                aria-label="Order status"
                className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full p-1 shadow-sm w-full max-w-md sm:max-w-2xl"
              >
                {segmentTabs.map((tab) => {
                  const isActive = segmentFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSegmentFilter(tab.key)}
                      className={`flex-1 min-w-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-sm font-semibold uppercase tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md scale-[1.02]'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white/70'
                      }`}
                    >
                      <span className="inline-flex items-center justify-center gap-1 sm:gap-1.5">
                        <span className="sm:hidden">{tab.shortLabel}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span
                          className={`inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-[16px] sm:h-[18px] px-1 sm:px-1.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
                            isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Orders List */}
          {loading ? (
            <ListSkeleton rows={5} withThumb />
          ) : error ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-16 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <AlertCircle size={24} className="text-red-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Error Loading Orders</h3>
              <p className="text-gray-600 text-sm">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-gray-900 font-semibold px-6 py-2 rounded-lg transition-all"
              >
                Retry
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-16 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <ShoppingBag size={24} className="text-gray-500" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No Orders Found</h3>
              <p className="text-gray-600 text-sm">No orders at the moment</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {paginatedOrders.map((order) => {
                const firstItem = order.items?.[0];
                const orderItems = Array.isArray(order.items) ? order.items : [];
                const orderStage = normalizeOrderStage(order.status);
                const isItemsExpanded = expandedItemOrders.has(order.id);
                const visibleItems = isItemsExpanded ? orderItems : orderItems.slice(0, SELLER_ORDER_ITEM_PREVIEW_COUNT);
                const hasMoreItems = orderItems.length > SELLER_ORDER_ITEM_PREVIEW_COUNT;
                const orderDateLabel = new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
                const buyerName = order.shipping_address?.name || 'Buyer';
                const buyerCity = order.shipping_address?.city || order.shipping_address?.state || 'City';
                const buyerPhone = order.shipping_address?.phone || 'N/A';

                return (
                  <div
                    key={order.id}
                    id={`seller-order-${order.id}`}
                    className={`flex bg-white border rounded-xl sm:rounded-2xl overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all ${
                      highlightOrderId === order.id
                        ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className={`w-1 flex-shrink-0 ${getStatusAccentBorder(orderStage)}`} aria-hidden="true" />

                    <div className="flex-1 min-w-0 p-2.5 sm:p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <p className="text-xs sm:text-sm font-bold text-gray-900 font-mono truncate">{order.order_number}</p>
                            <span className="text-[11px] text-gray-400">{orderDateLabel}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
                          {getStatusBadge(order.status)}
                          {getPaymentBadge(order.payment_status)}
                        </div>
                      </div>

                      {/* Product + total row */}
                      <div className="flex gap-2.5 sm:gap-3 mb-3">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={resolveOrderItemImage(firstItem)}
                            alt={firstItem?.product_name || 'Product image'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (target.src !== `${window.location.origin}${DEFAULT_ORDER_ITEM_IMAGE}`) {
                                target.src = DEFAULT_ORDER_ITEM_IMAGE;
                              }
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                          <div className="min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold text-gray-900 line-clamp-2">{firstItem?.product_name || 'Product'}</h4>
                            <p className="text-[11px] sm:text-xs text-gray-600 font-semibold mt-0.5">
                              Qty: <span className="text-gray-900">{firstItem?.quantity || 1}</span>
                              {orderItems.length > 1 && (
                                <span className="text-blue-600 font-medium"> · {orderItems.length} items</span>
                              )}
                            </p>
                          </div>
                          <div className="sm:text-right flex-shrink-0">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total</p>
                            <p className="text-base sm:text-lg font-bold text-gray-900">{formatSellerAmount(getSellerOrderTotal(order), 'INR')}</p>
                          </div>
                        </div>
                      </div>

                      {/* Expandable items list */}
                      {orderItems.length > 0 && (
                        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 mb-3">
                          <div className="space-y-1.5">
                            {visibleItems.map((item: any, itemIndex: number) => (
                              <div key={`${order.id}-item-${item?.id || itemIndex}`} className="flex items-center gap-2 bg-white rounded-md px-2 py-1.5 border border-gray-100">
                                <img
                                  src={resolveOrderItemImage(item)}
                                  alt={item?.product_name || `Order item ${itemIndex + 1}`}
                                  className="w-7 h-7 rounded object-cover border border-gray-200 bg-white flex-shrink-0"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (target.src !== `${window.location.origin}${DEFAULT_ORDER_ITEM_IMAGE}`) {
                                      target.src = DEFAULT_ORDER_ITEM_IMAGE;
                                    }
                                  }}
                                />
                                <p className="text-[11px] sm:text-xs font-medium text-gray-900 truncate flex-1">{item?.product_name || 'Item'}</p>
                                <span className="text-[10px] text-gray-500 flex-shrink-0">×{item?.quantity || 1}</span>
                              </div>
                            ))}
                          </div>
                          {hasMoreItems && (
                            <button
                              type="button"
                              onClick={() => toggleOrderItemsExpanded(order.id)}
                              className="mt-2 w-full text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 py-1"
                            >
                              {isItemsExpanded ? (
                                <>Show less <ChevronUp size={14} /></>
                              ) : (
                                <>Show all {orderItems.length} items <ChevronDown size={14} /></>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Buyer mini card */}
                      <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-2.5 sm:p-3 mb-3">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {getPartyInitial(buyerName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Buyer</p>
                            <p className="text-sm font-semibold text-gray-900 truncate">{buyerName}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                              <span className="text-xs text-gray-600 flex items-center gap-1 truncate">
                                <MapPin size={12} className="text-gray-400 shrink-0" /> {buyerCity}
                              </span>
                              <span className="text-xs text-gray-600 flex items-center gap-1">
                                <Phone size={12} className="text-gray-400 shrink-0" /> {buyerPhone}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tracking strip */}
                      {order.tracking_number && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 mb-3">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="min-w-0">
                              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-0.5">Tracking ID</p>
                              <p className="text-xs sm:text-sm font-bold text-blue-900 font-mono truncate flex items-center gap-1.5">
                                <Truck size={14} className="flex-shrink-0" />
                                <span className="truncate">{order.tracking_number}</span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyTrackingNumber(order.tracking_number!)}
                              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 transition"
                            >
                              <Copy size={12} /> Copy
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Return Request Info */}
                      {orderStage === 'return_requested' && (() => {
                      const returnReq = returnRequests.find(r => r.order_id === order.id);
                      return returnReq ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 mb-3">
                          <div className="flex items-start gap-3">
                            <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-amber-600 font-bold uppercase tracking-widest mb-1">Return Request</p>
                              <p className="text-sm font-semibold text-amber-900">Reason: {returnReq.reason}</p>
                              {returnReq.description && (
                                <p className="text-xs text-amber-700 mt-1 break-words">{returnReq.description}</p>
                              )}
                              <p className="text-[11px] text-amber-500 mt-2">
                                Requested on {new Date(returnReq.created_at).toLocaleDateString()}
                                {returnReq.items_returned && ` • Items: ${JSON.stringify(returnReq.items_returned)}`}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Actions */}
                    <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
                      {/* ── NEW: Accept / Reject (same for domestic & international) ── */}
                      {normalizeOrderStage(order.status) === 'new' && (
                        <>
                          <button 
                            onClick={() => handleAcceptOrder(order)}
                            disabled={updating}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircle size={16} /> Accept Order
                          </button>
                          <button 
                            onClick={() => handleRejectOrder(order)}
                            disabled={updating}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle size={16} /> Reject Order
                          </button>
                        </>
                      )}

                      {/* ── ACCEPTED ── */}
                      {normalizeOrderStage(order.status) === 'accepted' && (
                        <>
                          {order.tracking_number ? (
                            <>
                              {renderAdminLabelDownloadButton(order)}
                              {renderAdminManifestDownloadButton(order)}
                              {renderAwaitingAdminUploadMessage(order)}
                              {(isInternationalOrder(order) || isUkOriginSeller || order.tracking_number) && order.admin_label_path && (
                                <button
                                  onClick={() => handleMarkPacked(order)}
                                  disabled={!downloadedLabelOrderIds.has(order.id)}
                                  className="flex-1 sm:flex-initial bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <PackageCheck size={16} /> Order Packed
                                </button>
                              )}
                              {!order.tracking_number && !isInternationalOrder(order) && !isUkOriginSeller && (
                                <button
                                  onClick={() => handleMarkPacked(order)}
                                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5"
                                >
                                  <PackageCheck size={16} /> Mark as Packed
                                </button>
                              )}
                            </>
                          ) : isUkOriginSeller ? (
                            <div className="flex-1 sm:flex-initial bg-amber-50 border border-amber-200 text-amber-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] flex items-center justify-center gap-1.5">
                              <AlertCircle size={16} /> Shipment will be created by admin.
                            </div>
                          ) : isInternationalOrder(order) ? (
                            <div className="flex-1 sm:flex-initial bg-amber-50 border border-amber-200 text-amber-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] flex items-center justify-center gap-1.5">
                              <AlertCircle size={16} /> Shipment will be created by admin.
                            </div>
                          ) : (
                            <button
                              onClick={() => handleMarkPacked(order)}
                              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5"
                            >
                              <PackageCheck size={16} /> Mark as Packed
                            </button>
                          )}
                        </>
                      )}

                      {/* ── PACKED: admin-managed shipping docs + tracking ── */}
                      {normalizeOrderStage(order.status) === 'packed' && order.tracking_number && (
                        <>
                          {renderAdminLabelDownloadButton(order)}
                          {renderAdminManifestDownloadButton(order)}
                          {renderAwaitingAdminUploadMessage(order)}
                          {isInternationalOrder(order) && !isUkOriginSeller && (
                            <button
                              onClick={() => void handleTrackIntlOrder(order)}
                              disabled={trackingLoading && trackingOrderId === order.id}
                              className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                              Track My Order
                            </button>
                          )}
                          {isUkOriginSeller && (
                            <button
                              onClick={() => void handleTrackShippoOrder(order)}
                              disabled={trackingLoading && trackingOrderId === order.id}
                              className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                              Track My Order
                            </button>
                          )}
                          {!isInternationalOrder(order) && !isUkOriginSeller && (
                            <button
                              onClick={() => void handleTrackOrder(order)}
                              disabled={trackingLoading && trackingOrderId === order.id}
                              className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                              Track My Order
                            </button>
                          )}
                          <div className="w-full mt-1">
                            <p className="text-[11px] text-gray-500 italic">Tracking: {order.tracking_number}</p>
                          </div>
                        </>
                      )}
                      {normalizeOrderStage(order.status) === 'packed' && !order.tracking_number && (
                        <div className="flex-1 sm:flex-initial bg-amber-50 border border-amber-200 text-amber-700 font-medium px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] flex items-center justify-center gap-1.5">
                          <AlertCircle size={16} /> Shipment will be created by admin.
                        </div>
                      )}

                      {/* ── IN TRANSIT / OUT FOR DELIVERY: International = tracking only, Domestic = manual buttons if no tracking ── */}
                      {normalizeOrderStage(order.status) === 'in_transit' && !isInternationalOrder(order) && !order.tracking_number && (
                        <button 
                          onClick={() => handleMarkOutForDelivery(order)}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5"
                        >
                          <Truck size={16} /> Out for Delivery
                        </button>
                      )}

                      {/* ── International Shiprocket-shipped: tracking (India-origin sellers only) ── */}
                      {!isUkOriginSeller && isInternationalOrder(order) && order.tracking_number && ['in_transit', 'out_for_delivery', 'delivered'].includes(normalizeOrderStage(order.status)) && (
                        <>
                          {renderAdminLabelDownloadButton(order)}
                          {renderAdminManifestDownloadButton(order)}
                          <button
                            onClick={() => void handleTrackIntlOrder(order)}
                            disabled={trackingLoading && trackingOrderId === order.id}
                            className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                            Track My Order
                          </button>
                          {normalizeOrderStage(order.status) !== 'delivered' && (
                            <div className="w-full mt-1">
                              <p className="text-[11px] text-gray-500 italic">Tracking via Shiprocket (AWB: {order.tracking_number})</p>
                            </div>
                          )}
                        </>
                      )}

                      {!isInternationalOrder(order) && order.tracking_number && ['packed', 'in_transit', 'out_for_delivery', 'delivered'].includes(normalizeOrderStage(order.status)) && (
                        <>
                          {renderAdminLabelDownloadButton(order)}
                          {renderAdminManifestDownloadButton(order)}
                          {isUkOriginSeller ? (
                            <button
                              onClick={() => void handleTrackShippoOrder(order)}
                              disabled={trackingLoading && trackingOrderId === order.id}
                              className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                              Track My Order
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleTrackOrder(order)}
                              disabled={trackingLoading && trackingOrderId === order.id}
                              className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                              Track My Order
                            </button>
                          )}
                        </>
                      )}

                      {isUkOriginSeller && isInternationalOrder(order) && order.tracking_number && ['in_transit', 'out_for_delivery', 'delivered'].includes(normalizeOrderStage(order.status)) && (
                        <>
                          {renderAdminLabelDownloadButton(order)}
                          {renderAdminManifestDownloadButton(order)}
                          <button
                            onClick={() => void handleTrackShippoOrder(order)}
                            disabled={trackingLoading && trackingOrderId === order.id}
                            className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {trackingLoading && trackingOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                            Track My Order
                          </button>
                          <div className="w-full mt-1">
                            <p className="text-[11px] text-gray-500 italic">Tracking via Shippo ({order.tracking_number})</p>
                          </div>
                        </>
                      )}

                      {/* ── Cancelled Shippo orders: refund label ── */}
                      {isUkOriginSeller && order.tracking_number && normalizeOrderStage(order.status) === 'cancelled' && (
                        <button
                          onClick={() => void handleRefundShippoLabel(order)}
                          disabled={refundingLabelId === order.id}
                          className="flex-1 sm:flex-initial bg-amber-600 hover:bg-amber-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {refundingLabelId === order.id ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                          {refundingLabelId === order.id ? 'Refunding...' : 'Refund Shipping Label'}
                        </button>
                      )}

                      {/* ── Return requests ── */}
                      {normalizeOrderStage(order.status) === 'return_requested' && (() => {
                        const returnReq = returnRequests.find(r => r.order_id === order.id && r.status === 'requested');
                        return returnReq ? (
                          <>
                            <button
                              onClick={() => handleApproveReturn(returnReq)}
                              className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle size={16} /> Approve Return
                            </button>
                            <button
                              onClick={() => handleRejectReturn(returnReq)}
                              className="flex-1 sm:flex-initial bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5"
                            >
                              <XCircle size={16} /> Reject Return
                            </button>
                            {isUkOriginSeller && (
                              <button
                                onClick={() => void handleCreateReturnLabel(order)}
                                disabled={creatingReturnLabelId === order.id}
                                className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {creatingReturnLabelId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                                {creatingReturnLabelId === order.id ? 'Creating...' : 'Create Return Label (Shippo)'}
                              </button>
                            )}
                            {!isUkOriginSeller && (
                              <button
                                onClick={() => toast.info('Return pickup will be scheduled via your shipping provider (Shiprocket) once the return is approved.')}
                                className="flex-1 sm:flex-initial bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all text-[11px] flex items-center justify-center gap-1.5"
                              >
                                <Package size={16} /> Return Info
                              </button>
                            )}
                          </>
                        ) : null;
                      })()}

                      <button
                        onClick={() => setDetailsOrder(order)}
                        className="w-full sm:w-auto sm:flex-initial border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg transition-all text-[11px] sm:text-xs flex items-center justify-center gap-1.5"
                      >
                        <Eye size={16} /> View Details
                      </button>
                      <button
                        onClick={() => void handleDownloadInvoice(order)}
                        className="w-full sm:w-auto sm:flex-initial border border-amber-300 hover:bg-amber-50 text-amber-700 font-semibold px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg transition-all text-[11px] sm:text-xs flex items-center justify-center gap-1.5"
                      >
                        <Download size={16} /> Invoice PDF
                      </button>
                    </div>

                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {orderTotalPages > 1 && (
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl p-3 sm:p-4">
                  <p className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-900">{Math.min((clampedPage - 1) * ORDERS_PER_PAGE + 1, filteredOrders.length)}–{Math.min(clampedPage * ORDERS_PER_PAGE, filteredOrders.length)}</span> of <span className="font-semibold text-gray-900">{filteredOrders.length}</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setOrderPage(p => Math.max(1, p - 1))}
                      disabled={clampedPage === 1}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs font-semibold text-gray-700 px-2">
                      {clampedPage} / {orderTotalPages}
                    </span>
                    <button
                      onClick={() => setOrderPage(p => Math.min(orderTotalPages, p + 1))}
                      disabled={clampedPage === orderTotalPages}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} className="rotate-180" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

      {showFilterDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => setShowFilterDialog(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Filter Orders</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Payment Status</label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                >
                  <option value="all">All</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Date Range</label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => {
                  setPaymentFilter('all');
                  setDateFilter('all');
                  setOrderPage(1);
                }}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                onClick={() => { setShowFilterDialog(false); setOrderPage(1); }}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => setDetailsOrder(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Order Details</h3>
                <p className="text-sm text-gray-600">{detailsOrder.order_number}</p>
              </div>
              <button onClick={() => setDetailsOrder(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-5">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">Status</p>
                <p className="text-sm font-semibold text-gray-900">{detailsOrder.status}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">Payment</p>
                <p className="text-sm font-semibold text-gray-900">{detailsOrder.payment_status}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">Seller Total</p>
                <p className="text-sm font-semibold text-gray-900">{formatSellerAmount(getSellerOrderTotal(detailsOrder), 'INR')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">Tracking Number</p>
                <p className="text-sm font-semibold text-gray-900">{detailsOrder.tracking_number || 'Not assigned'}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Items</p>
              <div className="space-y-2">
                {(detailsOrder.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={resolveOrderItemImage(item)}
                        alt={item.product_name || 'Product image'}
                        className="w-12 h-12 rounded-lg object-cover border border-gray-200 bg-white shrink-0"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src !== `${window.location.origin}${DEFAULT_ORDER_ITEM_IMAGE}`) {
                            target.src = DEFAULT_ORDER_ITEM_IMAGE;
                          }
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.product_name || 'Product'}</p>
                        <p className="text-xs text-gray-600">Qty: {item.quantity || 1}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{formatSellerAmount(resolveSellerLineTotal(item), 'INR')}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => void handleDownloadInvoice(detailsOrder)}
                className="border border-amber-300 hover:bg-amber-50 text-amber-700 font-semibold px-5 py-2.5 rounded-xl transition-all text-xs flex items-center gap-2"
              >
                <Download size={16} /> Download Invoice PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => !updating && setShowActionModal(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              {showActionModal === 'accept' && 'Accept Order'}
              {showActionModal === 'pack' && 'Mark as Packed'}
              {showActionModal === 'transit' && 'Mark In Transit'}
              {showActionModal === 'outForDelivery' && 'Out for Delivery'}
              {showActionModal === 'reject' && 'Reject Order'}
            </h3>
            
            <div className="bg-gray-50 rounded-2xl p-4 mb-6">
              <p className="text-xs font-bold text-gray-500 mb-1">Order ID</p>
              <p className="text-base font-bold text-gray-900 truncate">{selectedOrder.order_number}</p>
            </div>

            {showActionModal === 'reject' && (
              <div className="mb-6">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Rejection Reason *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  rows={4}
                  placeholder="Enter reason for rejection..."
                  disabled={updating}
                />
              </div>
            )}

            {showActionModal === 'transit' && (
              <div className="mb-6">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Tracking ID *</label>
                <input
                  type="text"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter tracking number..."
                  disabled={updating}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowActionModal(null);
                  setSelectedOrder(null);
                  setTrackingId('');
                  setRejectionReason('');
                }}
                disabled={updating}
                className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={confirmAction}
                disabled={
                  updating ||
                  (showActionModal === 'reject' && !rejectionReason) ||
                  (showActionModal === 'transit' && !trackingId)
                }
                className={`flex-1 font-semibold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
                  showActionModal === 'reject' 
                    ? 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                    : showActionModal === 'transit'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50'
                    : 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50'
                }`}
              >
                {updating && <Loader2 size={16} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Action Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => !processingReturn && setShowReturnModal(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              {showReturnModal.action === 'approve' ? 'Approve Return' : 'Reject Return'}
            </h3>

            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <p className="text-xs font-bold text-gray-500 mb-1">Order</p>
              <p className="text-base font-bold text-gray-900">{showReturnModal.returnReq.orders?.order_number || showReturnModal.returnReq.order_id}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-1">Buyer's Reason</p>
              <p className="text-sm font-semibold text-amber-900 break-words">{showReturnModal.returnReq.reason}</p>
              {showReturnModal.returnReq.description && (
                <p className="text-xs text-amber-700 mt-1 break-words">{showReturnModal.returnReq.description}</p>
              )}
            </div>

            {showReturnModal.action === 'approve' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                <p className="text-xs font-bold text-green-600 mb-1">Refund Amount</p>
                <p className="text-lg font-bold text-green-900">{formatSellerAmount(sumSellerOrderTotal((showReturnModal.returnReq.orders?.order_items || []) as Array<Record<string, any>>), 'INR')}</p>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
                Your Response {showReturnModal.action === 'reject' ? '*' : '(Optional)'}
              </label>
              <textarea
                value={returnResponse}
                onChange={(e) => setReturnResponse(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                placeholder={showReturnModal.action === 'approve' ? 'Optional message to buyer...' : 'Reason for rejecting this return...'}
                disabled={processingReturn}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowReturnModal(null); setReturnResponse(''); }}
                disabled={processingReturn}
                className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReturnAction}
                disabled={processingReturn || (showReturnModal.action === 'reject' && !returnResponse)}
                className={`flex-1 font-semibold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
                  showReturnModal.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50'
                    : 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                }`}
              >
                {processingReturn && <Loader2 size={16} className="animate-spin" />}
                {showReturnModal.action === 'approve' ? 'Approve & Refund' : 'Reject Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {trackingOrderId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={() => { setTrackingOrderId(null); setTrackingEvents([]); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Shipment Tracking</h3>
              <button onClick={() => { setTrackingOrderId(null); setTrackingEvents([]); }} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            {trackingLoading ? (
              <div className="space-y-4 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton rounded="full" className="w-3 h-3 mt-1 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton rounded="sm" className="h-3.5 w-1/2" />
                      <Skeleton rounded="sm" className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : trackingEvents.length === 0 ? (
              <div className="text-center py-12">
                <Truck size={32} className="text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No tracking events available yet</p>
                <p className="text-xs text-gray-400 mt-1">Events will appear once the shipment is picked up</p>
              </div>
            ) : (
              <div className="space-y-0">
                {trackingEvents.map((event: any, idx: number) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                      {idx < trackingEvents.length - 1 && <div className="w-0.5 flex-1 bg-gray-200" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{event.status || 'Update'}</p>
                      <p className="text-xs text-gray-600">{event.location || ''}</p>
                      {event.date && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(event.date).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SellerOrderManagement;
