import React, { useEffect, useState } from 'react';
import { Loading } from '../components/StatusIndicators';
import { Eye, DollarSign, Download, Search, Truck, RotateCcw, CheckCircle, XCircle, Clock, Upload, Globe, Loader2, Package, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Copy, ArrowRight, X, AlertTriangle, RefreshCw, MapPin } from 'lucide-react';
import { logger } from '../../../utils/logger';
import * as adminApiService from '../../../lib/adminService';
import { fetchOrderReturns, processReturn, fetchOrderStatusHistory, recordStatusChange } from '../../../lib/orderService';
import { useAuth } from '../../../contexts/AuthContext';
import { notifyOrderEvent } from '../../../lib/notificationService';

import { createDomesticShipmentFromOrder as createShiprocketDomesticShipmentFromOrder, createIntlShipmentFromOrder as createShiprocketShipmentFromOrder, cancelOrder as cancelShiprocketOrder, cancelShipment as cancelShiprocketShipment, checkInternationalServiceability, resolveCountryToISO2, ndrReattempt, ndrReturnToOrigin, trackByAwb, syncAllActiveShipments, syncOrderToShiprocket } from '../../../lib/shiprocketOpsService';
import { createShippoShipmentFromOrder, getShippingProvider, trackShipment as shippoTrackShipment, refundLabel as shippoRefundLabel, createReturnLabel as shippoCreateReturnLabel } from '../../../lib/shippoOpsService';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { supabase } from '../../../lib/supabase';
import { buildInvoiceNumber, formatFrontend12DigitId } from '../../../utils/idFormatter';
import { generateInvoicePdf } from '../../../utils/invoicePdf';
import { resolveCustomerLineTotal, resolveCustomerUnitPrice, sumCustomerOrderTotal } from '../../../lib/orderPricingViews';
import {
  downloadShippingDocument,
  SHIPPING_LABELS_BUCKET,
  SHIPPING_MANIFESTS_BUCKET,
  triggerPdfDownload,
  uploadOrderShippingLabel,
  uploadOrderShippingManifest,
} from '../../../lib/shippingDocumentsService';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

// Reconcile a stored buyer-side amount to the actually-paid total. The order's
// buyer-side line items / subtotal can be inflated by an FX miscalculation at
// order-creation time; multiplying by buyerDisplayScale (paidTotal / storedTotal)
// renders the true paid breakdown. Defaults to a no-op (scale = 1) for orders
// that have no payment_intent (e.g. COD) or that were stored correctly.
const scaleBuyerAmount = (value: number, scale: number | undefined): number => {
  const v = Number(value) || 0;
  const s = Number(scale);
  if (!Number.isFinite(s) || s <= 0) return v;
  return Math.round(v * s * 100) / 100;
};

export const OrderManagement: React.FC = () => {
  const { formatPrice } = useCurrency();
  const { user: adminUser } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  type OrderSegment = 'new' | 'in_transit' | 'delivered' | 'cancelled';
  const [segmentFilter, setSegmentFilter] = useState<OrderSegment>('new');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderReturns, setOrderReturns] = useState<any[]>([]);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [showReturnModal, setShowReturnModal] = useState<{ returnReq: any; action: 'approve' | 'reject' } | null>(null);
  const [returnResponse, setReturnResponse] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);
  const [labelUploadingId, setLabelUploadingId] = useState<string | null>(null);
  const labelFileInputRef = React.useRef<HTMLInputElement>(null);
  const manifestFileInputRef = React.useRef<HTMLInputElement>(null);
  const [labelUploadOrderId, setLabelUploadOrderId] = useState<string | null>(null);
  const [manifestUploadOrderId, setManifestUploadOrderId] = useState<string | null>(null);
  const [manifestUploadingId, setManifestUploadingId] = useState<string | null>(null);
  const [creatingDomesticShipmentId, setCreatingDomesticShipmentId] = useState<string | null>(null);
  const [creatingShiprocketShipmentId, setCreatingShiprocketShipmentId] = useState<string | null>(null);
  const [recreatingShiprocketShipmentId, setRecreatingShiprocketShipmentId] = useState<string | null>(null);
  const [creatingShippoShipmentId, setCreatingShippoShipmentId] = useState<string | null>(null);
  const [checkingServiceabilityId, setCheckingServiceabilityId] = useState<string | null>(null);
  const [serviceabilityResults, setServiceabilityResults] = useState<Record<string, { available: boolean; couriers: Array<{ courier_company_id: number; courier_name: string; rate: number; etd: string }> }>>({});
  const [selectedCourier, setSelectedCourier] = useState<Record<string, number>>({});
  const [expandedCourierOrderId, setExpandedCourierOrderId] = useState<string | null>(null);
  const [labelUrls, setLabelUrls] = useState<Record<string, string>>({});
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [shipmentDetails, setShipmentDetails] = useState<Record<string, any>>({});
  const [trackingEvents, setTrackingEvents] = useState<Record<string, any[]>>({});
  const [ndrActionLoading, setNdrActionLoading] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
  const [confirmStatusChange, setConfirmStatusChange] = useState<{ orderId: string; newStatus: string; displayOrderId: string } | null>(null);
  const [syncingShipments, setSyncingShipments] = useState(false);
  const [refundingLabelId, setRefundingLabelId] = useState<string | null>(null);
  const [creatingReturnLabelId, setCreatingReturnLabelId] = useState<string | null>(null);
  const [expandedItemOrders, setExpandedItemOrders] = useState<Set<string>>(new Set());
  const serviceabilityCache = React.useRef<Record<string, { available: boolean; couriers: Array<{ courier_company_id: number; courier_name: string; rate: number; etd: string }> }>>({});
  const ORDER_ITEM_PREVIEW_COUNT = 2;
  /** Admin may create a shipment only after the seller has accepted the order. */
  const ADMIN_SHIPMENT_CREATE_STATUSES = ['accepted', 'processing'] as const;
  const ADMIN_SHIPMENT_MANAGE_STATUSES = ['accepted', 'processing', 'packed'] as const;
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 50,
    total: 0,
  });

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  // Realtime: refresh on any orders change (admin sees all)
  useEffect(() => {
    const channel = supabase
      .channel('admin-orders-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { fetchOrders(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInternationalOrder = (order: any): boolean => {
    const addr = order.shipping_address || {};
    const country = (addr.country || addr.countryCode || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!country) return false;
    return !['INDIA', 'IN', 'IND'].includes(country);
  };

  const isUkOriginOrder = (order: any): boolean => {
    const country = (order.sellerBusinessCountry || '').trim();
    return getShippingProvider(country, 'GB') === 'shippo';
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

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const offset = (pagination.page - 1) * pagination.limit;
      const result = await adminApiService.getAllOrders({
        limit: pagination.limit,
        offset,
      });
      if (result) {
        const rawOrders = result.orders || [];
        const profileIds = new Set<string>();
        const productIds = new Set<string>();
        const shippingAddressIds = new Set<string>();

        rawOrders.forEach((order: any) => {
          if (order.user_id) profileIds.add(String(order.user_id));
          if (order.seller_id) profileIds.add(String(order.seller_id));
          const shippingAddress = order.shipping_address || {};
          const selectedAddressId =
            shippingAddress.selectedAddressId
            || shippingAddress.selected_address_id
            || shippingAddress.address_id
            || shippingAddress.addressId;
          if (selectedAddressId) shippingAddressIds.add(String(selectedAddressId));
          (order.order_items || []).forEach((item: any) => {
            if (item?.seller_id) profileIds.add(String(item.seller_id));
            if (item?.product_id) productIds.add(String(item.product_id));
          });
        });

        // Source of truth for what the buyer actually paid (and in which currency):
        // payment_intents is written by the Stripe webhook with the captured amount
        // (already converted to major units) and the exact currency the buyer was
        // charged. We display this instead of the server-recomputed orders.total_amount,
        // which can be wrong when the order-creation FX step misfires.
        const paidByOrderId = new Map<string, { amount: number; currency: string }>();
        const orderIds = rawOrders.map((o: any) => String(o.id)).filter(Boolean);
        if (orderIds.length > 0) {
          const { data: paymentRows } = await supabase
            .from('payment_intents')
            .select('order_id, amount, currency, created_at')
            .in('order_id', orderIds)
            .order('created_at', { ascending: false });

          (paymentRows || []).forEach((row: any) => {
            const oid = String(row.order_id || '');
            if (!oid || paidByOrderId.has(oid)) return; // keep latest (rows are desc by created_at)
            const amount = Number(row.amount);
            if (!Number.isFinite(amount) || amount <= 0) return;
            paidByOrderId.set(oid, {
              amount,
              currency: String(row.currency || '').toUpperCase(),
            });
          });
        }

        const profileById = new Map<string, any>();
        const kycBySellerId = new Map<string, any>();
        const addressById = new Map<string, any>();
        const defaultAddressByUserId = new Map<string, any>();
        if (profileIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', Array.from(profileIds));

          (profiles || []).forEach((profile: any) => {
            profileById.set(String(profile.id), profile);
          });

          const { data: kycRows } = await supabase
            .from('seller_kyc')
            .select('seller_id, business_name, full_name, email, phone, business_street_address_1, business_street_address_2, business_city, business_state, business_postal_code, business_country')
            .in('seller_id', Array.from(profileIds));

          (kycRows || []).forEach((row: any) => {
            kycBySellerId.set(String(row.seller_id), row);
          });

          const { data: addressRows } = await supabase
            .from('user_addresses')
            .select('id, user_id, full_name, phone_number, street_address_1, street_address_2, city, state, postal_code, country, is_default, created_at')
            .in('user_id', Array.from(profileIds));

          const sortedAddressRows = [...(addressRows || [])].sort((a: any, b: any) => {
            const at = new Date(a?.created_at || 0).getTime();
            const bt = new Date(b?.created_at || 0).getTime();
            return bt - at;
          });

          sortedAddressRows.forEach((row: any) => {
            if (row?.id) addressById.set(String(row.id), row);
            const userId = String(row?.user_id || '');
            if (!userId) return;
            const existing = defaultAddressByUserId.get(userId);
            if (!existing) {
              defaultAddressByUserId.set(userId, row);
              return;
            }
            if (row?.is_default && !existing?.is_default) {
              defaultAddressByUserId.set(userId, row);
            }
          });
        }

        if (shippingAddressIds.size > 0) {
          const { data: selectedAddressRows } = await supabase
            .from('user_addresses')
            .select('id, user_id, full_name, phone_number, street_address_1, street_address_2, city, state, postal_code, country, is_default, created_at')
            .in('id', Array.from(shippingAddressIds));

          (selectedAddressRows || []).forEach((row: any) => {
            if (row?.id) addressById.set(String(row.id), row);
          });
        }

        const orderSequences = await Promise.all(
          rawOrders.map((order: any) => getMonthlyOrderSequence(order.created_at)),
        );
        const enrichedOrders = rawOrders.map((order: any, index: number) => {
          const invoiceSequence = orderSequences[index] || 1;
          const sellerIds = new Set<string>();

          if (order.seller_id) {
            sellerIds.add(String(order.seller_id));
          }

          (order.order_items || []).forEach((item: any) => {
            if (item?.seller_id) {
              sellerIds.add(String(item.seller_id));
            }
          });

          const buyerProfile = profileById.get(String(order.user_id));
          const sellerProfiles = Array.from(sellerIds)
            .map((sellerId) => profileById.get(sellerId))
            .filter(Boolean);

          const sellerKycNames = Array.from(sellerIds)
            .map((sellerId) => kycBySellerId.get(sellerId))
            .filter(Boolean)
            .map((row: any) => row.business_name || row.full_name || row.email)
            .filter((name: string) => Boolean(String(name || '').trim()));

          const sellerProfileNames = sellerProfiles
            .map((profile: any) => profile.full_name || profile.email)
            .filter((name: string) => Boolean(String(name || '').trim()));

          const sellerDisplayNames = Array.from(new Set([...sellerKycNames, ...sellerProfileNames]));
          const primarySellerId = Array.from(sellerIds)[0] || '';
          const sellerKyc = primarySellerId ? kycBySellerId.get(primarySellerId) : null;
          const sellerAddress = [
            sellerKyc?.business_street_address_1,
            sellerKyc?.business_street_address_2,
            sellerKyc?.business_city,
            sellerKyc?.business_state,
            sellerKyc?.business_postal_code,
            sellerKyc?.business_country,
          ].filter(Boolean).join(', ');

          const shippingAddress = order.shipping_address || {};
          const selectedAddressId =
            shippingAddress.selectedAddressId
            || shippingAddress.selected_address_id
            || shippingAddress.address_id
            || shippingAddress.addressId;
          const resolvedAddress = selectedAddressId
            ? addressById.get(String(selectedAddressId))
            : defaultAddressByUserId.get(String(order.user_id));
          const sellerName = sellerDisplayNames.length > 0
            ? sellerDisplayNames.join(', ')
            : 'Seller name unavailable';

          const shippingFirstName = String(
            shippingAddress.first_name
            || shippingAddress.firstName
            || '',
          ).trim();
          const shippingLastName = String(
            shippingAddress.last_name
            || shippingAddress.lastName
            || '',
          ).trim();
          const composedShippingName = [shippingFirstName, shippingLastName].filter(Boolean).join(' ').trim();

          const buyerNameCandidates = [
            buyerProfile?.full_name,
            resolvedAddress?.full_name,
            shippingAddress.full_name,
            shippingAddress.fullName,
            shippingAddress.name,
            shippingAddress.customer_name,
            shippingAddress.customerName,
            composedShippingName,
            order.customer_name,
            order.customerName,
            buyerProfile?.email,
            order.phone,
            shippingAddress.phone,
            shippingAddress.phone_number,
            resolvedAddress?.phone_number,
          ];

          const buyerName = buyerNameCandidates
            .map((value) => String(value || '').trim())
            .find((value) => Boolean(value))
            || 'Buyer';

          const buyerAddress = [
            resolvedAddress?.street_address_1,
            resolvedAddress?.street_address_2,
            shippingAddress.street,
            shippingAddress.address,
            shippingAddress.address_line_1,
            shippingAddress.address_line1,
            shippingAddress.street_address_1,
            shippingAddress.line1,
            shippingAddress.street_address_2,
            shippingAddress.line2,
            shippingAddress.city,
            shippingAddress.state,
            shippingAddress.district,
            resolvedAddress?.city,
            resolvedAddress?.state,
            shippingAddress.postalCode,
            shippingAddress.postal_code,
            resolvedAddress?.postal_code,
            shippingAddress.country,
            resolvedAddress?.country,
          ].filter(Boolean).join(', ');

          const expectedDelivery =
            order.delivery_date
            || order.estimated_delivery
            || order.expected_delivery
            || shippingAddress.expected_delivery_date
            || shippingAddress.expectedDeliveryDate
            || '';

          // What the buyer actually paid (Stripe truth) overrides the recomputed
          // orders.total_amount. The buyer-side line items / subtotal stored on the
          // order are uniformly reconciled to this paid total via buyerDisplayScale,
          // so the admin breakdown always sums to the real captured amount. Seller-side
          // figures are untouched (they read seller_* columns, not these).
          const paidInfo = paidByOrderId.get(String(order.id));
          const storedTotal = Number(order.total ?? order.total_amount ?? 0);
          const paidTotal = paidInfo ? paidInfo.amount : storedTotal;
          const displayCurrency = (paidInfo?.currency || order.currency || 'INR').toUpperCase();
          const buyerDisplayScale = paidInfo && storedTotal > 0 ? paidTotal / storedTotal : 1;

          return {
            ...order,
            orderTotal: paidTotal,
            displayCurrency,
            buyerDisplayScale,
            buyerName,
            sellerName,
            sellerAddress,
            sellerContact: sellerKyc?.phone || sellerKyc?.email || '',
            sellerBusinessCountry: sellerKyc?.business_country || '',
            buyerAddress,
            buyerPhone: order.phone || shippingAddress.phone || shippingAddress.phone_number || shippingAddress.mobile || resolvedAddress?.phone_number || '',
            expectedDelivery,
            displayOrderId: formatFrontend12DigitId(String(order.id || '')),
            displayBuyerId: formatFrontend12DigitId(String(order.user_id || '')),
            invoiceNumber: buildInvoiceNumber(order.created_at, invoiceSequence, String(order.id || '')),
          };
        });

        setOrders(enrichedOrders);
        setPagination((prev) => ({ ...prev, total: result.total }));
        setError(null);

        // Restore cached serviceability results for orders on this page
        const restored: Record<string, any> = {};
        for (const order of enrichedOrders) {
          if (serviceabilityCache.current[order.id]) {
            restored[order.id] = serviceabilityCache.current[order.id];
          }
        }
        if (Object.keys(restored).length > 0) {
          setServiceabilityResults((prev) => ({ ...prev, ...restored }));
        }

        // Fetch Shiprocket shipment records for all orders on this page
        // (includes cancelled rows so the Recreate button stays visible after a failed recreate)
        const allOrderIds = enrichedOrders.map((o: any) => o.id);
        if (allOrderIds.length > 0) {
          const { data: shipments } = await supabase
            .from('shiprocket_shipments')
            .select('order_id, label_url, manifest_url, status, ndr_reason, ndr_action_required, awb_number, courier_name, sr_order_id, sr_shipment_id')
            .in('order_id', allOrderIds)
            .order('created_at', { ascending: false });
          if (shipments && shipments.length > 0) {
            const urls: Record<string, string> = {};
            const details: Record<string, any> = {};
            // Take the most-recent row per order
            shipments.forEach((s: any) => {
              if (s.order_id && s.label_url) urls[s.order_id] = s.label_url;
              if (s.order_id && !details[s.order_id]) details[s.order_id] = s;
            });
            setLabelUrls(urls);
            setShipmentDetails(details);
          }
        }
      }
    } catch (err) {
      setError('Failed to load orders');
      logger.error(err as Error, { context: 'Order management error' });
    } finally {
      setLoading(false);
    }
  };

  const DESTRUCTIVE_STATUSES = ['cancelled', 'delivered', 'returned'];

  const requestStatusChange = (orderId: string, newStatus: string) => {
    if (DESTRUCTIVE_STATUSES.includes(newStatus)) {
      const order = orders.find(o => o.id === orderId);
      setConfirmStatusChange({ orderId, newStatus, displayOrderId: order?.displayOrderId || orderId });
      return;
    }
    handleUpdateStatus(orderId, newStatus);
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      setActionLoading(orderId);
      const order = orders.find(o => o.id === orderId);
      const previousStatus = order?.status || null;
      const result = await adminApiService.updateOrderStatus(orderId, newStatus);
      if (result) {
        setSuccess(`Order status updated to ${newStatus}`);
        // Write a status-history entry so the buyer's tracking page reflects the change.
        // Note is intentionally role-neutral — we never expose "by admin" to buyers.
        try {
          await recordStatusChange({
            orderId,
            fromStatus: String(previousStatus || ''),
            toStatus: String(newStatus),
            changedBy: adminUser?.id || orderId,
            role: 'admin',
            note: `Order moved to ${newStatus.replace(/_/g, ' ')}`,
          });
        } catch (histErr) {
          logger.error('Failed to record admin status history', { error: String(histErr) });
        }
        // Send notifications to buyer and seller
        if (order) {
          const statusNotifMap: Record<string, string> = {
            accepted: 'order_accepted', packed: 'order_shipped', in_transit: 'order_shipped',
            out_for_delivery: 'order_shipped', delivered: 'order_delivered', cancelled: 'order_rejected',
          };
          const notifType = (statusNotifMap[newStatus] || 'info') as import('../../../lib/notificationService').NotificationType;
          await notifyOrderEvent({
            type: notifType,
            orderId,
            orderNumber: order.displayOrderId || orderId,
            buyerId: order.user_id || undefined,
            sellerIds: order.seller_id ? [order.seller_id] : [],
            title: `Order ${order.displayOrderId} Updated`,
            message: `Your order status has been updated to ${newStatus.toUpperCase()}.`,
            emailData: {
              order_id: order.displayOrderId || orderId,
              customer_name: order.customer_name || 'Customer',
              tracking_number: order.tracking_number || undefined,
            },
          });
        }
        fetchOrders();
        setShowDetails(false);
      }
    } catch (_err) {
      setError('Failed to update order status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = async (order: any) => {
    setSelectedOrder(order);
    setShowDetails(true);
    // Fetch returns and status history for this order
    const [returnsRes, historyRes] = await Promise.all([
      fetchOrderReturns(order.id),
      fetchOrderStatusHistory(order.id),
    ]);
    setOrderReturns(returnsRes.data || []);
    setOrderHistory(historyRes.data || []);
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
    if (!showReturnModal || !selectedOrder) return;
    const { returnReq, action } = showReturnModal;
    try {
      setProcessingReturn(true);
      const { success: ok, error: retErr } = await processReturn({
        returnId: returnReq.id,
        action,
        processedBy: 'admin',
        role: 'admin',
        response: returnResponse || undefined,
        refundAmount: action === 'approve' ? selectedOrder.orderTotal : undefined,
      });
      if (!ok) {
        setError(`Failed to ${action} return: ${retErr}`);
        return;
      }
      setSuccess(`Return ${action}d successfully`);
      // Send notification to buyer + seller
      if (selectedOrder.user_id) {
        await notifyOrderEvent({
          type: action === 'approve' ? 'return_approved' as const : 'return_rejected' as const,
          orderId: selectedOrder.id,
          orderNumber: selectedOrder.displayOrderId || selectedOrder.id,
          buyerId: selectedOrder.user_id,
          sellerIds: selectedOrder.seller_id ? [selectedOrder.seller_id] : [],
          adminNotify: action === 'reject',
          title: `Return ${action === 'approve' ? 'Approved' : 'Rejected'}`,
          message: `Your return request for order ${selectedOrder.displayOrderId} has been ${action}d.${returnResponse ? ' Note: ' + returnResponse : ''}`,
          emailData: {
            order_id: selectedOrder.displayOrderId || selectedOrder.id,
            customer_name: selectedOrder.customer_name || 'Customer',
            reason: returnResponse || undefined,
          },
        });
      }
      setShowReturnModal(null);
      setReturnResponse('');
      fetchOrders();
      // Refresh returns for current order
      const returnsRes = await fetchOrderReturns(selectedOrder.id);
      setOrderReturns(returnsRes.data || []);
    } catch (err: any) {
      setError(`Failed to process return: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingReturn(false);
    }
  };

  const handleProcessRefund = async (orderId: string, amount: number) => {
    try {
      setActionLoading(orderId);
      const result = await adminApiService.processRefund(
        orderId, 
        amount,
        'Admin-initiated refund: requested_by_customer'
      );
      if (result?.success) {
        setSuccess(`Refund processed successfully. Refund ID: ${result.refundId}`);
        fetchOrders();
        setShowRefundDialog(false);
      } else {
        setError(result?.error || 'Failed to process refund');
      }
    } catch (_err) {
      setError('Failed to process refund');
    } finally {
      setActionLoading(null);
    }
  };

  const resolvePaymentMethod = (order: any): string => {
    if (order.payment_method) return String(order.payment_method);
    if (order.payment_intent_id) return 'stripe';
    if (order.payment_status === 'completed') return 'card';
    return 'Not available';
  };

  const handleUploadShippingLabel = async (file: File) => {
    if (!labelUploadOrderId) return;
    const order = orders.find((o) => o.id === labelUploadOrderId);
    try {
      setLabelUploadingId(labelUploadOrderId);
      const result = await uploadOrderShippingLabel(labelUploadOrderId, file);
      if (!result.success) {
        setError(`Label upload failed: ${result.error}`);
        return;
      }
      setSuccess(`Shipping label uploaded for order ${order?.displayOrderId || labelUploadOrderId}`);
      if (order) {
        await notifyOrderEvent({
          type: 'label_ready',
          orderId: order.id,
          orderNumber: order.displayOrderId || order.id,
          buyerId: order.user_id || undefined,
          sellerIds: order.seller_id ? [order.seller_id] : [],
          title: `Shipping Label Ready — ${order.displayOrderId}`,
          message: 'Admin uploaded the shipping label. Download it from your orders page, then pack the order.',
          metadata: { awb: order.tracking_number, carrier: 'admin_upload' },
          emailData: {
            order_id: order.displayOrderId || order.id,
            customer_name: order.customer_name || 'Customer',
            carrier: 'Bzead',
            tracking_number: order.tracking_number || '',
          },
        });
      }
      fetchOrders();
    } catch (err: any) {
      setError(`Label upload error: ${err.message || 'Unknown error'}`);
    } finally {
      setLabelUploadingId(null);
      setLabelUploadOrderId(null);
    }
  };

  const handleUploadShippingManifest = async (file: File) => {
    if (!manifestUploadOrderId) return;
    const order = orders.find((o) => o.id === manifestUploadOrderId);
    try {
      setManifestUploadingId(manifestUploadOrderId);
      const result = await uploadOrderShippingManifest(manifestUploadOrderId, file);
      if (!result.success) {
        setError(`Manifest upload failed: ${result.error}`);
        return;
      }
      setSuccess(`Shipping manifest uploaded for order ${order?.displayOrderId || manifestUploadOrderId}`);
      if (order?.seller_id) {
        await notifyOrderEvent({
          type: 'label_ready',
          orderId: order.id,
          orderNumber: order.displayOrderId || order.id,
          buyerId: order.user_id || undefined,
          sellerIds: [order.seller_id],
          title: `Shipping Manifest Ready — ${order.displayOrderId}`,
          message: 'Admin uploaded the shipping manifest. Download it from your orders page.',
          metadata: { awb: order.tracking_number, carrier: 'admin_upload', document: 'manifest' },
          emailData: {
            order_id: order.displayOrderId || order.id,
            customer_name: order.customer_name || 'Customer',
            carrier: 'Bzead',
            tracking_number: order.tracking_number || '',
          },
        });
      }
      fetchOrders();
    } catch (err: any) {
      setError(`Manifest upload error: ${err.message || 'Unknown error'}`);
    } finally {
      setManifestUploadingId(null);
      setManifestUploadOrderId(null);
    }
  };

  const handleAdminDownloadShippingDoc = async (
    order: any,
    kind: 'label' | 'manifest',
  ) => {
    const path = kind === 'label' ? order.admin_label_path : order.admin_manifest_path;
    if (!path) return;
    const bucket = kind === 'label' ? SHIPPING_LABELS_BUCKET : SHIPPING_MANIFESTS_BUCKET;
    try {
      const { data, error } = await downloadShippingDocument(bucket, path);
      if (error || !data) {
        setError(`${kind === 'label' ? 'Label' : 'Manifest'} download failed: ${error?.message || 'File not found'}`);
        return;
      }
      triggerPdfDownload(data, `${kind}-${order.displayOrderId || order.id}.pdf`);
    } catch (err: any) {
      setError(`Download error: ${err.message || 'Unknown error'}`);
    }
  };

  const handleCreateDomesticShipment = async (order: any) => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot create shipment: no seller found for this order.');
      return;
    }
    try {
      setCreatingDomesticShipmentId(order.id);
      const result = await createShiprocketDomesticShipmentFromOrder(orderSellerId, order.id);
      if (result.error || !result.awbNumber) {
        setError(`Shiprocket domestic shipment failed: ${result.error || 'No AWB received'}`);
        return;
      }

      // Update order tracking_number with AWB
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ tracking_number: result.awbNumber })
        .eq('id', order.id);
      if (updateErr) {
        setError(`Shipment created (AWB: ${result.awbNumber}) but tracking update failed: ${updateErr.message}`);
        return;
      }

      let msg = `Shiprocket domestic shipment created. AWB: ${result.awbNumber}`;
      if (result.pickupScheduled) msg += ' | Pickup scheduled.';
      if (result.pickupError) msg += ` | Pickup failed: ${result.pickupError}`;
      if (result.labelUrl) msg += ' | Label generated.';
      setSuccess(msg);

      // Notify seller and buyer
      await notifyOrderEvent({
        type: 'label_ready',
        orderId: order.id,
        orderNumber: order.displayOrderId || order.id,
        buyerId: order.user_id || undefined,
        sellerIds: orderSellerId ? [orderSellerId] : [],
        title: `Shipment Created for Order ${order.displayOrderId}`,
        message: `Shiprocket shipment created. AWB: ${result.awbNumber}. Please pack the order for pickup.`,
        metadata: { awb: result.awbNumber, carrier: 'shiprocket' },
        emailData: {
          order_id: order.displayOrderId || order.id,
          customer_name: order.customer_name || 'Customer',
          carrier: 'Shiprocket',
          tracking_number: result.awbNumber,
        },
      });

      fetchOrders();
    } catch (err: any) {
      setError(`Domestic shipment error: ${err.message || 'Unknown error'}`);
    } finally {
      setCreatingDomesticShipmentId(null);
    }
  };

  const handleCheckServiceability = async (order: any) => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot check serviceability: no seller found for this order.');
      return;
    }
    try {
      setCheckingServiceabilityId(order.id);
      setError(null);

      // Get seller pickup pin code
      const { data: pickupLoc } = await supabase
        .from('seller_pickup_locations')
        .select('pin_code')
        .eq('seller_id', orderSellerId)
        .limit(1)
        .maybeSingle();

      const pickupPin = pickupLoc?.pin_code;
      if (!pickupPin) {
        setError('Seller has no pickup location configured. Ask seller to register their warehouse first.');
        return;
      }

      // Resolve destination country to ISO-2 (Shiprocket requires 2-letter codes)
      const addr = order.shipping_address || {};
      const rawCountry = (addr.country || '').trim();
      const rawCode = (addr.country_code || addr.countryCode || '').trim();
      const destCountry = resolveCountryToISO2(rawCountry, rawCode);
      if (!destCountry) {
        setError(`Cannot resolve destination country to ISO-2 code: "${rawCountry || rawCode}"`);
        return;
      }

      // Fetch actual product weight and dimensions from products table
      const orderItems = (order.order_items || []) as any[];
      const itemProductIds = [...new Set(orderItems.map((i: any) => i.product_id).filter(Boolean))];
      if (itemProductIds.length === 0) {
        setError('Order has no items with product IDs — cannot determine weight.');
        return;
      }

      const [productsResult, unitsResult] = await Promise.all([
        supabase
          .from('products')
          .select('id, package_weight, package_weight_unit_id, package_length, package_length_unit_id, package_width, package_width_unit_id, package_height, package_height_unit_id')
          .in('id', itemProductIds),
        supabase
          .from('measurement_units')
          .select('id, code')
          .eq('is_active', true),
      ]);

      const productMap = new Map((productsResult.data || []).map((p: any) => [p.id, p]));
      const unitCodeById = new Map(
        (unitsResult.data || []).map((u: any) => [String(u.id), String(u.code || '').toUpperCase()]),
      );

      let totalWeightKg = 0;
      let maxLengthCm = 0;
      let maxWidthCm = 0;
      let maxHeightCm = 0;

      for (const item of orderItems) {
        const product = productMap.get(item.product_id);
        if (!product) continue;
        const qty = Number(item.quantity || 1);

        const weightUnitCode = unitCodeById.get(String(product.package_weight_unit_id || '')) || 'KG';
        const rawWeight = Number(product.package_weight || 0);
        const weightKg = weightUnitCode === 'G' ? rawWeight / 1000 : rawWeight;
        totalWeightKg += weightKg * qty;

        const lUnit = unitCodeById.get(String(product.package_length_unit_id || '')) || 'CM';
        const wUnit = unitCodeById.get(String(product.package_width_unit_id || '')) || 'CM';
        const hUnit = unitCodeById.get(String(product.package_height_unit_id || '')) || 'CM';
        const toCm = (v: number, u: string) => { const c = u.toUpperCase(); if (c === 'MM') return v / 10; if (c === 'M') return v * 100; if (c === 'IN') return v * 2.54; return v; };
        maxLengthCm = Math.max(maxLengthCm, toCm(Number(product.package_length || 0), lUnit));
        maxWidthCm = Math.max(maxWidthCm, toCm(Number(product.package_width || 0), wUnit));
        maxHeightCm = Math.max(maxHeightCm, toCm(Number(product.package_height || 0), hUnit));
      }

      if (totalWeightKg <= 0) {
        setError('Products in this order have no weight configured. Update product weight before checking serviceability.');
        return;
      }

      const weight = Math.round(totalWeightKg * 100) / 100;

      const result = await checkInternationalServiceability({
        sellerId: orderSellerId,
        requestData: {
          pickup_postcode: pickupPin,
          delivery_country: destCountry,
          weight,
          length: Math.max(Math.round(maxLengthCm), 1),
          breadth: Math.max(Math.round(maxWidthCm), 1),
          height: Math.max(Math.round(maxHeightCm), 1),
        },
      });

      if (result.error) {
        serviceabilityCache.current[order.id] = { available: false, couriers: [] };
        setError(`Serviceability check failed: ${result.error}`);
        setServiceabilityResults((prev) => ({ ...prev, [order.id]: { available: false, couriers: [] } }));
        return;
      }

      const extractCourierRate = (_rawRate: unknown, company: Record<string, unknown>): number => {
        // PRIMARY: use company.rate if it's a valid number
        const rateValue = company.rate;
        if (typeof rateValue === 'number' && Number.isFinite(rateValue) && rateValue > 0) {
          return rateValue;
        }
        if (typeof rateValue === 'string') {
          const parsed = parseFloat(rateValue);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        
        // FALLBACK: if rate is 0 or missing, check nested rate object
        if (_rawRate && typeof _rawRate === 'object') {
          const rateObj = _rawRate as Record<string, unknown>;
          const rate = rateObj.rate;
          if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) return rate;
          if (typeof rate === 'string') {
            const parsed = parseFloat(rate);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
          }
        }
        
        // FINAL FALLBACK: check secondary rate fields only if primary is 0
        if (Number(rateValue || 0) === 0) {
          const secondaryFields = [company.freight_charge, company.total_charges, company.shipment_charge];
          for (const f of secondaryFields) {
            if (typeof f === 'number' && Number.isFinite(f) && f > 0) return f;
            if (typeof f === 'string') {
              const parsed = parseFloat(f);
              if (Number.isFinite(parsed) && parsed > 0) return parsed;
            }
          }
        }
        
        return 0;
      };

      const rawData = result.data as Record<string, unknown>;
      const innerData = (rawData?.data || rawData) as Record<string, unknown>;
      const companies = (innerData?.available_courier_companies || []) as Array<Record<string, unknown>>;
      const couriers = companies
        .filter((c) => !c.blocked)
        .map((c) => ({
          courier_company_id: Number(c.courier_company_id || 0),
          courier_name: String(c.courier_name || ''),
          rate: extractCourierRate(c.rate, c),
          etd: String(c.etd || c.estimated_delivery_days || ''),
        }))
        .filter((c) => c.rate > 0)
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 5);

      serviceabilityCache.current[order.id] = { available: couriers.length > 0, couriers };
      setServiceabilityResults((prev) => ({ ...prev, [order.id]: { available: couriers.length > 0, couriers } }));

      // Auto-select cheapest courier
      if (couriers.length > 0) {
        const cheapest = couriers.reduce((a, b) => (a.rate <= b.rate ? a : b));
        setSelectedCourier((prev) => ({ ...prev, [order.id]: cheapest.courier_company_id }));
        setExpandedCourierOrderId(order.id);
        // Keep admin dashboard status view fresh right after serviceability check.
        // This sync updates local tracking/status mirrors; Shiprocket dashboard changes
        // only when a shipment is created (Select & Ship).
        try {
          const syncResult = await syncAllActiveShipments({ sellerId: orderSellerId });
          if (!syncResult.error) {
            const syncData = syncResult.data as Record<string, unknown>;
            const synced = Number(syncData?.synced || 0);
            const total = Number(syncData?.total || 0);
            setSuccess(
              `${couriers.length} courier(s) available. Serviceability check fetches rates only; click Select & Ship to create/update shipment in Shiprocket. Synced ${synced} of ${total} active shipment(s).`,
            );
            fetchOrders();
          } else {
            setSuccess(
              `${couriers.length} courier(s) available. Serviceability check fetches rates only; click Select & Ship to create/update shipment in Shiprocket.`,
            );
          }
        } catch {
          setSuccess(
            `${couriers.length} courier(s) available. Serviceability check fetches rates only; click Select & Ship to create/update shipment in Shiprocket.`,
          );
        }
      } else {
        setError('No couriers available for this international route.');
      }
    } catch (err: any) {
      setError(`Serviceability check error: ${err.message || 'Unknown error'}`);
    } finally {
      setCheckingServiceabilityId(null);
    }
  };

  // Push order to Shiprocket's "New Orders" without assigning AWB. Currency is
  // always converted to INR by the service layer regardless of order's display currency.
  const handleSyncToShiprocket = async (order: any) => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot sync: no seller found for this order.');
      return;
    }
    try {
      setSyncingOrderId(order.id);
      setError(null);
      const result = await syncOrderToShiprocket(orderSellerId, order.id);
      if (result.error) {
        setError(`Sync to Shiprocket failed: ${result.error}`);
        return;
      }
      // Refresh shipment record for this order so subsequent UI reflects new state.
      const { data: refreshed } = await supabase
        .from('shiprocket_shipments')
        .select('order_id, label_url, manifest_url, status, ndr_reason, ndr_action_required, awb_number, courier_name, sr_order_id, sr_shipment_id')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (refreshed) {
        setShipmentDetails((prev) => ({ ...prev, [order.id]: refreshed }));
      }
      if (result.alreadySynced) {
        setSuccess(`Order is already synced to Shiprocket (SR Order #${result.srOrderId}). No duplicate created.`);
      } else {
        setSuccess(`Order synced to Shiprocket (SR Order #${result.srOrderId}). It now appears in Shiprocket's New Orders. Use "Select & Ship" to assign a courier and AWB.`);
      }
    } catch (err: any) {
      setError(`Sync to Shiprocket error: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncingOrderId(null);
    }
  };

  const handleCreateShiprocketShipment = async (order: any) => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot create shipment: no seller found for this order.');
      return;
    }
    try {
      setCreatingShiprocketShipmentId(order.id);
      const chosenCourierId = selectedCourier[order.id] || undefined;
      if (isInternationalOrder(order) && !chosenCourierId) {
        setError('Select a courier from serviceability results before creating an international shipment.');
        return;
      }
      const result = await createShiprocketShipmentFromOrder(orderSellerId, order.id, chosenCourierId);
      if (result.error || !result.awbNumber) {
        setError(`Shiprocket shipment failed: ${result.error || 'No AWB received'}`);
        return;
      }

      // Update order tracking_number with AWB
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ tracking_number: result.awbNumber })
        .eq('id', order.id);
      if (updateErr) {
        setError(`Shipment created (AWB: ${result.awbNumber}) but tracking update failed: ${updateErr.message}`);
        return;
      }

      let msg = `Shiprocket shipment created. AWB: ${result.awbNumber}`;
      if (result.pickupScheduled) msg += ' | Pickup scheduled.';
      if (result.pickupError) msg += ` | Pickup failed: ${result.pickupError}`;
      if (result.labelUrl) msg += ' | Label generated.';
      setSuccess(msg);

      // Notify seller and buyer
      await notifyOrderEvent({
        type: 'label_ready',
        orderId: order.id,
        orderNumber: order.displayOrderId || order.id,
        buyerId: order.user_id || undefined,
        sellerIds: orderSellerId ? [orderSellerId] : [],
        title: `International Shipment Created for Order ${order.displayOrderId}`,
        message: `Shiprocket shipment created. AWB: ${result.awbNumber}. Please download the label, pack the order and mark as packed.`,
        metadata: { awb: result.awbNumber, carrier: 'shiprocket' },
        emailData: {
          order_id: order.displayOrderId || order.id,
          customer_name: order.customer_name || 'Customer',
          carrier: 'Shiprocket',
          tracking_number: result.awbNumber,
        },
      });

      fetchOrders();
    } catch (err: any) {
      setError(`Shiprocket shipment error: ${err.message || 'Unknown error'}`);
    } finally {
      setCreatingShiprocketShipmentId(null);
    }
  };

  const handleRecreateShiprocketShipment = async (order: any) => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot recreate shipment: no seller found for this order.');
      return;
    }

    const isIntl = isInternationalOrder(order);
    if (isUkOriginOrder(order)) {
      setError('This order uses Shippo. Recreate Shipment is available only for Shiprocket orders.');
      return;
    }

    const confirmed = confirm('This will cancel the current Shiprocket shipment and create a new one with updated values. Continue?');
    if (!confirmed) return;

    try {
      setRecreatingShiprocketShipmentId(order.id);
      setError(null);

      const { data: existingShipment, error: existingShipmentErr } = await supabase
        .from('shiprocket_shipments')
        .select('id, sr_order_id, awb_number, status')
        .eq('order_id', order.id)
        .eq('seller_id', orderSellerId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingShipmentErr) {
        setError(`Failed to load existing shipment: ${existingShipmentErr.message}`);
        return;
      }

      if (existingShipment?.sr_order_id) {
        // Do NOT pass orderId — the edge function sets orders.status='cancelled' when orderId is given
        const cancelOrderResult = await cancelShiprocketOrder({
          sellerId: orderSellerId,
          requestData: { sr_order_ids: [Number(existingShipment.sr_order_id)] },
        });

        if (cancelOrderResult.error) {
          setError(`Could not cancel existing Shiprocket order: ${cancelOrderResult.error}`);
          return;
        }
      }

      if (existingShipment?.awb_number) {
        const cancelShipmentResult = await cancelShiprocketShipment({
          sellerId: orderSellerId,
          requestData: { awbs: [String(existingShipment.awb_number)] },
        });

        if (cancelShipmentResult.error) {
          setError(`Could not cancel existing AWB: ${cancelShipmentResult.error}`);
          return;
        }
      }

      const { error: markCancelledErr } = await supabase
        .from('shiprocket_shipments')
        .update({ status: 'cancelled' })
        .eq('order_id', order.id)
        .eq('seller_id', orderSellerId)
        .neq('status', 'cancelled');

      if (markCancelledErr) {
        setError(`Shipment cancelled on Shiprocket but local status update failed: ${markCancelledErr.message}`);
        return;
      }

      // Reset tracking and ensure order stays in a shippable status (not cancelled)
      const prevStatus = ['new', 'accepted', 'processing', 'packed'].includes(order.status) ? order.status : 'processing';
      const { error: resetTrackingErr } = await supabase
        .from('orders')
        .update({ tracking_number: null, status: prevStatus })
        .eq('id', order.id);

      if (resetTrackingErr) {
        setError(`Shipment cancelled but failed to reset order: ${resetTrackingErr.message}`);
        return;
      }

      if (isIntl && !selectedCourier[order.id]) {
        setError('Select a courier from serviceability results before recreating an international shipment.');
        return;
      }

      const createResult = isIntl
        ? await createShiprocketShipmentFromOrder(orderSellerId, order.id, selectedCourier[order.id] || undefined)
        : await createShiprocketDomesticShipmentFromOrder(orderSellerId, order.id);

      if (createResult.error || !createResult.awbNumber) {
        setError(`Recreate shipment failed: ${createResult.error || 'No AWB received'}`);
        return;
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update({ tracking_number: createResult.awbNumber })
        .eq('id', order.id);

      if (updateErr) {
        setError(`Shipment recreated (AWB: ${createResult.awbNumber}) but tracking update failed: ${updateErr.message}`);
        return;
      }

      let msg = `Shipment recreated. New AWB: ${createResult.awbNumber}`;
      if (createResult.pickupScheduled) msg += ' | Pickup scheduled.';
      if (createResult.pickupError) msg += ` | Pickup failed: ${createResult.pickupError}`;
      if (createResult.labelUrl) msg += ' | Label generated.';
      setSuccess(msg);

      fetchOrders();
    } catch (err: any) {
      setError(`Recreate shipment error: ${err.message || 'Unknown error'}`);
    } finally {
      setRecreatingShiprocketShipmentId(null);
    }
  };

  const handleCreateShippoShipment = async (order: any) => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot create shipment: no seller found for this order.');
      return;
    }
    try {
      setCreatingShippoShipmentId(order.id);
      const result = await createShippoShipmentFromOrder(orderSellerId, order.id, 'cheapest', order.shipping_rate_id || undefined);
      if (result.error || !result.trackingNumber) {
        setError(`Shippo shipment failed: ${result.error || 'No tracking number received'}`);
        return;
      }

      // Update order tracking_number
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ tracking_number: result.trackingNumber })
        .eq('id', order.id);
      if (updateErr) {
        setError(`Shipment created (Tracking: ${result.trackingNumber}) but order update failed: ${updateErr.message}`);
        return;
      }

      // Store label URL if available
      if (result.labelUrl) {
        setLabelUrls((prev) => ({ ...prev, [order.id]: result.labelUrl! }));
      }

      let msg = `Shippo shipment created. Tracking: ${result.trackingNumber}`;
      if (result.courierName) msg += ` | Courier: ${result.courierName}`;
      if (result.labelUrl) msg += ' | Label generated.';
      setSuccess(msg);

      // Notify seller and buyer
      await notifyOrderEvent({
        type: 'label_ready',
        orderId: order.id,
        orderNumber: order.displayOrderId || order.id,
        buyerId: order.user_id || undefined,
        sellerIds: orderSellerId ? [orderSellerId] : [],
        title: `Shipping Label Ready for Order ${order.displayOrderId}`,
        message: `Shipping label has been created. Tracking: ${result.trackingNumber}. Please download the label and pack the order.`,
        metadata: { tracking: result.trackingNumber, carrier: 'shippo', courier: result.courierName },
        emailData: {
          order_id: order.displayOrderId || order.id,
          customer_name: order.customer_name || 'Customer',
          carrier: result.courierName || 'Shippo',
          tracking_number: result.trackingNumber,
        },
      });

      fetchOrders();
    } catch (err: any) {
      setError(`Shippo shipment error: ${err.message || 'Unknown error'}`);
    } finally {
      setCreatingShippoShipmentId(null);
    }
  };

  const handleNdrAction = async (order: any, action: 'reattempt' | 'rto') => {
    const orderSellerId = order.seller_id;
    if (!orderSellerId) {
      setError('Cannot perform NDR action: no seller found for this order.');
      return;
    }
    const shipment = shipmentDetails[order.id];
    if (!shipment?.awb_number) {
      setError('Cannot perform NDR action: no AWB number found.');
      return;
    }
    try {
      setNdrActionLoading(order.id);
      const fn = action === 'reattempt' ? ndrReattempt : ndrReturnToOrigin;
      const result = await fn({
        sellerId: orderSellerId,
        orderId: order.id,
        requestData: { awb: shipment.awb_number },
      });
      if (result.error) {
        setError(`NDR ${action === 'reattempt' ? 'reattempt' : 'return to origin'} failed: ${result.error}`);
        return;
      }
      setSuccess(`NDR ${action === 'reattempt' ? 'reattempt delivery' : 'return to origin'} initiated successfully.`);
      fetchOrders();
    } catch (err: any) {
      setError(`NDR action error: ${err.message || 'Unknown error'}`);
    } finally {
      setNdrActionLoading(null);
    }
  };

  const handleFetchTracking = async (orderId: string) => {
    try {
      setTrackingLoading(orderId);
      const shipment = shipmentDetails[orderId];
      if (!shipment) {
        // Try fetching shipment directly
        const { data: shipmentRow } = await supabase
          .from('shiprocket_shipments')
          .select('id, order_id, awb_number, seller_id')
          .eq('order_id', orderId)
          .maybeSingle();
        if (!shipmentRow) {
          setError('No shipment found for this order.');
          return;
        }
        // Try to refresh tracking via Shiprocket API
        if (shipmentRow.awb_number && shipmentRow.seller_id) {
          await trackByAwb({
            sellerId: shipmentRow.seller_id,
            requestData: { awb: shipmentRow.awb_number },
          });
        }
        // Fetch events from DB
        const { data: events } = await supabase
          .from('shiprocket_tracking_events')
          .select('id, sr_status, sr_status_label, activity, location, event_at')
          .eq('shipment_id', shipmentRow.id)
          .order('event_at', { ascending: false });
        setTrackingEvents((prev) => ({ ...prev, [orderId]: events || [] }));
        return;
      }
      // Refresh tracking via Shiprocket API if we have AWB
      if (shipment.awb_number && shipment.seller_id) {
        await trackByAwb({
          sellerId: shipment.seller_id,
          requestData: { awb: shipment.awb_number },
        });
      }
      // Fetch shipment ID first, then events
      const { data: shipmentRow } = await supabase
        .from('shiprocket_shipments')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();
      if (shipmentRow) {
        const { data: events } = await supabase
          .from('shiprocket_tracking_events')
          .select('id, sr_status, sr_status_label, activity, location, event_at')
          .eq('shipment_id', shipmentRow.id)
          .order('event_at', { ascending: false });
        setTrackingEvents((prev) => ({ ...prev, [orderId]: events || [] }));
      }
    } catch (err: any) {
      setError(`Failed to fetch tracking: ${err.message || 'Unknown error'}`);
    } finally {
      setTrackingLoading(null);
    }
  };

  const handleSyncAllShipments = async () => {
    try {
      setSyncingShipments(true);
      setError(null);
      // Use the first seller_id from current orders, or a dummy — the backend queries ALL active shipments
      const anySellerId = orders.find(o => o.seller_id)?.seller_id || 'admin';
      const result = await syncAllActiveShipments({ sellerId: anySellerId });
      if (result.error) {
        setError(`Bulk sync failed: ${result.error}`);
        return;
      }
      const data = result.data as any;
      setSuccess(`Synced ${data?.synced || 0} of ${data?.total || 0} active shipments.`);
      fetchOrders();
    } catch (err: any) {
      setError(`Sync error: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncingShipments(false);
    }
  };

  // Shippo tracking for UK-origin orders
  const handleFetchShippoTracking = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order?.tracking_number || !order?.seller_id) return;
    try {
      setTrackingLoading(orderId);

      // Look up carrier from shippo_shipments
      const { data: shippoShipment } = await supabase
        .from('shippo_shipments')
        .select('id, courier_name, status')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!shippoShipment?.courier_name) {
        // Fallback: show tracking events from DB only
        if (shippoShipment?.id) {
          const { data: events } = await supabase
            .from('shippo_tracking_events')
            .select('id, status, status_details, location, event_at')
            .eq('shipment_id', shippoShipment.id)
            .order('event_at', { ascending: false });
          setTrackingEvents((prev) => ({ ...prev, [orderId]: (events || []).map((e: any) => ({
            id: e.id, sr_status: e.status, sr_status_label: e.status, activity: e.status_details, location: e.location, event_at: e.event_at,
          })) }));
        }
        return;
      }

      // Refresh tracking via Shippo API
      const result = await shippoTrackShipment({
        sellerId: order.seller_id,
        orderId,
        requestData: {
          tracking_number: order.tracking_number,
          carrier: shippoShipment.courier_name,
        },
      });

      if (result.error) {
        setError(`Tracking failed: ${result.error}`);
        return;
      }

      // Fetch events from DB after refresh
      if (shippoShipment.id) {
        const { data: events } = await supabase
          .from('shippo_tracking_events')
          .select('id, status, status_details, location, event_at')
          .eq('shipment_id', shippoShipment.id)
          .order('event_at', { ascending: false });
        setTrackingEvents((prev) => ({ ...prev, [orderId]: (events || []).map((e: any) => ({
          id: e.id, sr_status: e.status, sr_status_label: e.status, activity: e.status_details, location: e.location, event_at: e.event_at,
        })) }));
      }

      // Update shipment details for display
      setShipmentDetails((prev) => ({ ...prev, [orderId]: {
        ...prev[orderId],
        status: shippoShipment.status,
        courier_name: shippoShipment.courier_name,
        awb_number: order.tracking_number,
      }}));
    } catch (err: any) {
      setError(`Failed to fetch Shippo tracking: ${err.message || 'Unknown error'}`);
    } finally {
      setTrackingLoading(null);
    }
  };

  // Admin: refund Shippo label
  const handleRefundShippoLabel = async (order: any) => {
    if (!order.seller_id) return;
    if (!confirm('Are you sure you want to refund the shipping label? This cannot be undone.')) return;
    try {
      setRefundingLabelId(order.id);

      const { data: shippoShipment } = await supabase
        .from('shippo_shipments')
        .select('shippo_transaction_id')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!shippoShipment?.shippo_transaction_id) {
        setError('No Shippo transaction found for this order.');
        return;
      }

      const result = await shippoRefundLabel({
        sellerId: order.seller_id,
        orderId: order.id,
        requestData: { transaction_id: shippoShipment.shippo_transaction_id },
      });

      if (result.error) {
        setError(`Label refund failed: ${result.error}`);
        return;
      }

      const d = result.data as any;
      setSuccess(`Label refund ${d?.status === 'QUEUED' ? 'queued' : 'processed'}. Refund ID: ${d?.refund_id || 'N/A'}`);
      fetchOrders();
    } catch (err: any) {
      setError(`Refund error: ${err.message || 'Unknown error'}`);
    } finally {
      setRefundingLabelId(null);
    }
  };

  // Admin: create Shippo return label
  const handleCreateReturnLabel = async (order: any) => {
    if (!order.seller_id) return;
    if (!confirm('Create a return shipping label for this order?')) return;
    try {
      setCreatingReturnLabelId(order.id);

      const result = await shippoCreateReturnLabel({
        sellerId: order.seller_id,
        orderId: order.id,
        requestData: {},
      });

      if (result.error) {
        setError(`Return label failed: ${result.error}`);
        return;
      }

      const d = result.data as any;
      if (d?.label_url) {
        setLabelUrls((prev) => ({ ...prev, [`${order.id}_return`]: d.label_url }));
      }
      setSuccess(`Return label created. Tracking: ${d?.tracking_number || 'N/A'}`);
      fetchOrders();
    } catch (err: any) {
      setError(`Return label error: ${err.message || 'Unknown error'}`);
    } finally {
      setCreatingReturnLabelId(null);
    }
  };

  const handleDownloadInvoicePdf = async (order: any) => {
    const orderItems = order.order_items || [];

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
      const unitPrice = scaleBuyerAmount(resolveCustomerUnitPrice(item), order.buyerDisplayScale);
      const vi = item.variant_info || {};
      const meta = productMetaMap.get(String(item.product_id));
      return {
        name: item.product_name || item.product_id || 'Item',
        sku: vi.sku || meta?.sku || undefined,
        hsn_code: vi.hsn_code || meta?.hsn_code || undefined,
        qty,
        unitPrice,
        total: scaleBuyerAmount(resolveCustomerLineTotal(item), order.buyerDisplayScale),
      };
    });

    await generateInvoicePdf(
      {
        invoiceNumber: order.invoiceNumber,
        orderId: order.displayOrderId,
        orderDate: new Date(order.created_at).toLocaleDateString(),
        deliveryDate: order.expectedDelivery ? new Date(order.expectedDelivery).toLocaleDateString() : undefined,
        paymentMethod: resolvePaymentMethod(order),
        sellerName: order.sellerName,
        sellerAddress: order.sellerAddress,
        sellerContact: order.sellerContact,
        buyerName: order.buyerName,
        buyerAddress: order.buyerAddress,
        buyerPhone: order.buyerPhone,
        items,
        currency: order.displayCurrency || order.currency || 'INR',
        totalPaid: Number(order.orderTotal || 0),
        shippingCharge: scaleBuyerAmount(Number(order.shipping_charge || 0), order.buyerDisplayScale),
      },
      formatPrice,
    );
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const statuses = ['new', 'accepted', 'processing', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'cancelled', 'return_requested', 'returned'];

  const ORDER_SEGMENT_STATUSES: Record<OrderSegment, string[]> = {
    new: ['new', 'accepted', 'processing', 'packed'],
    in_transit: ['shipped', 'in_transit', 'out_for_delivery', 'failed_delivery'],
    delivered: ['delivered'],
    cancelled: ['cancelled', 'return_requested', 'returned'],
  };

  const pendingCount = orders.filter(o => ORDER_SEGMENT_STATUSES.new.includes(o.status)).length;
  const intransitCount = orders.filter(o => ORDER_SEGMENT_STATUSES.in_transit.includes(o.status)).length;
  const deliveredCount = orders.filter(o => ORDER_SEGMENT_STATUSES.delivered.includes(o.status)).length;
  const cancelledCount = orders.filter(o => ORDER_SEGMENT_STATUSES.cancelled.includes(o.status)).length;
  const ndrCount = orders.filter(o => o.status === 'failed_delivery').length;

  const segmentTabs: Array<{
    key: OrderSegment;
    label: string;
    shortLabel: string;
    count: number;
    activeBg: string;
    ring: string;
  }> = [
    { key: 'new', label: 'New', shortLabel: 'New', count: pendingCount, activeBg: 'bg-indigo-600', ring: 'focus-visible:ring-indigo-500/40' },
    { key: 'in_transit', label: 'In Transit', shortLabel: 'Transit', count: intransitCount, activeBg: 'bg-indigo-600', ring: 'focus-visible:ring-indigo-500/40' },
    { key: 'delivered', label: 'Delivered', shortLabel: 'Delivered', count: deliveredCount, activeBg: 'bg-indigo-600', ring: 'focus-visible:ring-indigo-500/40' },
    { key: 'cancelled', label: 'Cancelled', shortLabel: 'Cancelled', count: cancelledCount, activeBg: 'bg-indigo-600', ring: 'focus-visible:ring-indigo-500/40' },
  ];

  const filteredOrders = orders.filter((order) => {
    if (!ORDER_SEGMENT_STATUSES[segmentFilter].includes(order.status)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.displayOrderId?.toLowerCase().includes(q) ||
      order.invoiceNumber?.toLowerCase().includes(q) ||
      order.buyerName?.toLowerCase().includes(q) ||
      order.sellerName?.toLowerCase().includes(q) ||
      order.order_number?.toLowerCase().includes(q)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      case 'failed_delivery': return 'bg-red-100 text-red-800 border-red-200';
      case 'shipped':
      case 'in_transit':
      case 'out_for_delivery': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'return_requested': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'returned': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getPaymentColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getStatusAccentBorder = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-500';
      case 'cancelled':
      case 'return_requested':
      case 'returned':
      case 'failed_delivery': return 'bg-red-500';
      case 'shipped':
      case 'in_transit':
      case 'out_for_delivery': return 'bg-blue-500';
      default: return 'bg-amber-500';
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
      setSuccess('Tracking number copied');
    } catch {
      setError('Could not copy tracking number');
    }
  };

  if (loading) return <Loading message="Loading orders..." />;

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto">
      <input
        ref={labelFileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadShippingLabel(file);
          e.target.value = '';
        }}
      />
      <input
        ref={manifestFileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadShippingManifest(file);
          e.target.value = '';
        }}
      />

      {/* Toast Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-500 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
            <span className="text-sm font-medium">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Page Header + Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Order Management</h2>
          <p className="text-sm text-gray-500 mt-1">Manage, track, and fulfill all customer orders</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={handleSyncAllShipments}
            disabled={syncingShipments}
            className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncingShipments ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncingShipments ? 'Syncing...' : 'Sync Shipments'}
          </button>
          <div className="bg-white border border-gray-200 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[70px]">
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{pagination.total}</p>
            <p className="text-[10px] sm:text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[70px]">
            <p className="text-xl sm:text-2xl font-bold text-amber-700">{pendingCount}</p>
            <p className="text-[10px] sm:text-xs text-amber-600">Pending</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[70px]">
            <p className="text-xl sm:text-2xl font-bold text-blue-700">{intransitCount}</p>
            <p className="text-[10px] sm:text-xs text-blue-600">In Transit</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[70px]">
            <p className="text-xl sm:text-2xl font-bold text-green-700">{deliveredCount}</p>
            <p className="text-[10px] sm:text-xs text-green-600">Delivered</p>
          </div>
          {ndrCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[70px]">
              <p className="text-xl sm:text-2xl font-bold text-red-700">{ndrCount}</p>
              <p className="text-[10px] sm:text-xs text-red-600">NDR</p>
            </div>
          )}
        </div>
      </div>

      {/* Search & segment filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by Order ID, buyer name, seller, tracking..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
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
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-sm font-semibold uppercase tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 whitespace-nowrap ${tab.ring} ${
                    isActive
                      ? `${tab.activeBg} text-white shadow-md scale-[1.02]`
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

      {/* Order Cards */}
      <div className="space-y-3">
        {filteredOrders.length > 0 ? (
          filteredOrders.map((order) => {
            const isIntl = isInternationalOrder(order);
            const isUkOrigin = isUkOriginOrder(order);
            const items = order.order_items || [];
            const subtotal = scaleBuyerAmount(sumCustomerOrderTotal(items), order.buyerDisplayScale);
            const shippingCharge = scaleBuyerAmount(Number(order.shipping_charge || 0), order.buyerDisplayScale);
            const displayCurrency = order.displayCurrency || order.currency || 'INR';
            const courierData = serviceabilityResults[order.id];
            const showCourierPanel = expandedCourierOrderId === order.id && courierData?.available;
            const cheapestCourier = courierData?.couriers?.length
              ? courierData.couriers.reduce((a, b) => (a.rate <= b.rate ? a : b))
              : null;
            const fastestCourier = courierData?.couriers?.length
              ? courierData.couriers.reduce((a, b) => {
                  const aEtd = parseInt(a.etd) || 999;
                  const bEtd = parseInt(b.etd) || 999;
                  return aEtd <= bEtd ? a : b;
                })
              : null;

            const isItemsExpanded = expandedItemOrders.has(order.id);
            const visibleItems = isItemsExpanded ? items : items.slice(0, ORDER_ITEM_PREVIEW_COUNT);
            const hasMoreItems = items.length > ORDER_ITEM_PREVIEW_COUNT;
            const orderDateLabel = new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
            const showShippoShip = isUkOrigin && !order.tracking_number && ADMIN_SHIPMENT_CREATE_STATUSES.includes(order.status);
            const showIntlShiprocket = isIntl && !isUkOrigin && !order.tracking_number && ADMIN_SHIPMENT_CREATE_STATUSES.includes(order.status);
            const showDomesticShiprocket = !isIntl && !isUkOrigin && !order.tracking_number && ADMIN_SHIPMENT_CREATE_STATUSES.includes(order.status);
            const showRetryShipment = isIntl && !isUkOrigin && order.tracking_number && !order.admin_label_path && ADMIN_SHIPMENT_MANAGE_STATUSES.includes(order.status);
            const showRecreateShipment = !isUkOrigin && (order.tracking_number || shipmentDetails[order.id]?.status === 'cancelled') && ADMIN_SHIPMENT_MANAGE_STATUSES.includes(order.status);
            const showShippingActions = showShippoShip || showIntlShiprocket || showDomesticShiprocket || showRetryShipment || showRecreateShipment;

            return (
              <div key={order.id} className="flex bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className={`w-1 flex-shrink-0 ${getStatusAccentBorder(order.status)}`} aria-hidden="true" />

                <div className="flex-1 min-w-0">
                  {/* Card Header */}
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-sm sm:text-base font-bold text-gray-900 font-mono truncate">{order.displayOrderId}</p>
                          <span className="text-[11px] sm:text-xs text-gray-400">{orderDateLabel}</span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-gray-500 font-mono mt-0.5">{order.invoiceNumber}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
                        {isIntl ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                            <Globe size={11} /> INTL
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                            DOMESTIC
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border ${getStatusColor(order.status)}`}>
                          {order.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border ${getPaymentColor(order.payment_status)}`}>
                          {(order.payment_status || 'pending').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-3 sm:p-4">
                    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_11rem] lg:gap-5">
                      <div className="space-y-3 min-w-0">
                        {/* Buyer → Seller route */}
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:gap-3 items-stretch">
                          <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-2.5 sm:p-3 min-w-0">
                            <div className="flex items-start gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                                {getPartyInitial(order.buyerName)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Buyer</p>
                                <p className="text-sm font-semibold text-gray-900 truncate">{order.buyerName}</p>
                                {order.buyerAddress && (
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{order.buyerAddress}</p>
                                )}
                                {order.buyerPhone && (
                                  <p className="text-xs text-gray-500 mt-0.5">{order.buyerPhone}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="hidden sm:flex items-center justify-center text-gray-300 px-1">
                            <ArrowRight size={18} />
                          </div>
                          <div className="rounded-lg bg-amber-50/70 border border-amber-100 p-2.5 sm:p-3 min-w-0">
                            <div className="flex items-start gap-2">
                              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                                {getPartyInitial(order.sellerName)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Seller</p>
                                <p className="text-sm font-semibold text-gray-900 truncate">{order.sellerName}</p>
                                {order.sellerAddress && (
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{order.sellerAddress}</p>
                                )}
                                {order.sellerContact && (
                                  <p className="text-xs text-gray-500 mt-0.5">{order.sellerContact}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 sm:p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-xs sm:text-sm font-semibold text-gray-900">
                              {items.length} Item{items.length !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm font-bold text-indigo-700">
                              {formatPrice(order.orderTotal, displayCurrency)}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            {visibleItems.map((item: any, idx: number) => {
                              const vi = item.variant_info || {};
                              return (
                                <div key={idx} className="flex items-center gap-2 sm:gap-3 bg-white rounded-md px-2 py-1.5 border border-gray-100">
                                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 flex-shrink-0">
                                    <Package size={14} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate leading-tight">
                                      {item.product_name || item.product_id || 'Item'}
                                    </p>
                                    <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">
                                      {vi.sku ? `SKU: ${vi.sku} · ` : ''}Qty: {item.quantity || 1}
                                      {vi.hsn_code ? ` · HSN: ${vi.hsn_code}` : ''}
                                    </p>
                                  </div>
                                  <p className="text-xs sm:text-sm font-semibold text-gray-900 flex-shrink-0">
                                    {formatPrice(scaleBuyerAmount(resolveCustomerLineTotal(item), order.buyerDisplayScale), displayCurrency)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          {hasMoreItems && (
                            <button
                              type="button"
                              onClick={() => toggleOrderItemsExpanded(order.id)}
                              className="mt-2 w-full text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 py-1"
                            >
                              {isItemsExpanded ? (
                                <>Show less <ChevronUp size={14} /></>
                              ) : (
                                <>Show all {items.length} items <ChevronDown size={14} /></>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Financial strip */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <span>Subtotal</span>
                            <span className="font-medium text-gray-800">{formatPrice(subtotal, displayCurrency)}</span>
                          </div>
                          {shippingCharge > 0 && (
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <span>Shipping</span>
                              <span className="font-medium text-gray-800">{formatPrice(shippingCharge, displayCurrency)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <span className="text-gray-600 font-medium">Total</span>
                            <span className="font-bold text-gray-900">{formatPrice(order.orderTotal, displayCurrency)}</span>
                          </div>
                        </div>

                        {/* Tracking strip */}
                        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                          {order.tracking_number ? (
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <p className="text-xs sm:text-sm text-blue-700 font-mono font-medium flex items-center gap-1.5 min-w-0 truncate">
                                <Truck size={14} className="flex-shrink-0" />
                                <span className="truncate">{order.tracking_number}</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => copyTrackingNumber(order.tracking_number)}
                                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 transition"
                              >
                                <Copy size={12} /> Copy
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs sm:text-sm text-gray-400 italic flex items-center gap-1.5">
                              <Truck size={14} /> Not shipped yet
                            </p>
                          )}
                          {order.expectedDelivery && (
                            <p className="text-[10px] text-blue-600/80 mt-1">
                              Est. delivery {new Date(order.expectedDelivery).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Desktop action column */}
                      <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:border-l lg:border-gray-100 lg:pl-4">
                        <button
                          onClick={() => handleViewDetails(order)}
                          className="w-full px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition flex items-center justify-center gap-1.5"
                        >
                          <Eye size={15} /> View Details
                        </button>
                        <button
                          onClick={() => handleDownloadInvoicePdf(order)}
                          className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
                        >
                          <Download size={15} /> Invoice PDF
                        </button>
                        {order.tracking_number && (
                          <>
                            <button
                              onClick={() => {
                                setLabelUploadOrderId(order.id);
                                labelFileInputRef.current?.click();
                              }}
                              disabled={labelUploadingId === order.id}
                              className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {labelUploadingId === order.id ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                              Upload Label
                            </button>
                            <button
                              onClick={() => {
                                setManifestUploadOrderId(order.id);
                                manifestFileInputRef.current?.click();
                              }}
                              disabled={manifestUploadingId === order.id}
                              className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {manifestUploadingId === order.id ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                              Upload Manifest
                            </button>
                          </>
                        )}
                        {order.admin_label_path && (
                          <button
                            type="button"
                            onClick={() => void handleAdminDownloadShippingDoc(order, 'label')}
                            className="w-full px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center justify-center gap-1.5"
                          >
                            <Download size={15} /> Download Label
                          </button>
                        )}
                        {order.admin_manifest_path && (
                          <button
                            type="button"
                            onClick={() => void handleAdminDownloadShippingDoc(order, 'manifest')}
                            className="w-full px-3 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition flex items-center justify-center gap-1.5"
                          >
                            <Download size={15} /> Download Manifest
                          </button>
                        )}
                        <select
                          value={order.status}
                          onChange={(e) => requestStatusChange(order.id, e.target.value)}
                          disabled={actionLoading === order.id}
                          className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                        >
                          <option value={order.status} disabled>Update Status...</option>
                          {statuses.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* NDR Alert Banner */}
                  {order.status === 'failed_delivery' && (
                    <div className="px-3 sm:px-4 py-3 bg-red-50 border-t border-red-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-red-800">Delivery Failed — Action Required</p>
                            {shipmentDetails[order.id]?.ndr_reason && (
                              <p className="text-xs text-red-600 mt-0.5">Reason: {shipmentDetails[order.id].ndr_reason}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleNdrAction(order, 'reattempt')}
                            disabled={ndrActionLoading === order.id}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {ndrActionLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Reattempt Delivery
                          </button>
                          <button
                            onClick={() => handleNdrAction(order, 'rto')}
                            disabled={ndrActionLoading === order.id}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {ndrActionLoading === order.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                            Return to Origin
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card Footer: Actions (mobile / tablet) */}
                  <div className="lg:hidden px-3 sm:px-4 py-3 bg-gray-50/80 border-t border-gray-100 space-y-3">
                    <button
                      onClick={() => handleViewDetails(order)}
                      className="w-full px-3 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition flex items-center justify-center gap-1.5"
                    >
                      <Eye size={16} /> View Details
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleDownloadInvoicePdf(order)}
                        className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
                      >
                        <Download size={15} /> Invoice PDF
                      </button>
                      {order.tracking_number && (
                        <>
                          <button
                            onClick={() => {
                              setLabelUploadOrderId(order.id);
                              labelFileInputRef.current?.click();
                            }}
                            disabled={labelUploadingId === order.id}
                            className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {labelUploadingId === order.id ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                            Upload Label
                          </button>
                          <button
                            onClick={() => {
                              setManifestUploadOrderId(order.id);
                              manifestFileInputRef.current?.click();
                            }}
                            disabled={manifestUploadingId === order.id}
                            className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {manifestUploadingId === order.id ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                            Upload Manifest
                          </button>
                        </>
                      )}
                      {order.admin_label_path && (
                        <button
                          type="button"
                          onClick={() => void handleAdminDownloadShippingDoc(order, 'label')}
                          className="px-3 py-2 text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center justify-center gap-1.5"
                        >
                          <Download size={15} /> Label
                        </button>
                      )}
                      {order.admin_manifest_path && (
                        <button
                          type="button"
                          onClick={() => void handleAdminDownloadShippingDoc(order, 'manifest')}
                          className="px-3 py-2 text-xs sm:text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition flex items-center justify-center gap-1.5"
                        >
                          <Download size={15} /> Manifest
                        </button>
                      )}
                    </div>
                    <select
                      value={order.status}
                      onChange={(e) => requestStatusChange(order.id, e.target.value)}
                      disabled={actionLoading === order.id}
                      className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                    >
                      <option value={order.status} disabled>Update Status...</option>
                      {statuses.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  {/* Shipping Actions */}
                  {showShippingActions && (
                  <div className="px-3 sm:px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-2">
                    {showShippoShip && (
                      <button
                        onClick={() => handleCreateShippoShipment(order)}
                        disabled={creatingShippoShipmentId === order.id}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                      >
                        {creatingShippoShipmentId === order.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Package size={16} />
                        )}
                        {creatingShippoShipmentId === order.id ? 'Creating...' : 'Ship via Shippo (UK)'}
                      </button>
                    )}
                    {showIntlShiprocket && (
                      <>
                        {!courierData?.available ? (
                          <button
                            onClick={() => handleCheckServiceability(order)}
                            disabled={checkingServiceabilityId === order.id}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                          >
                            {checkingServiceabilityId === order.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Search size={16} />
                            )}
                            {checkingServiceabilityId === order.id ? 'Checking...' : 'Check Serviceability (Rates Only)'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setExpandedCourierOrderId(expandedCourierOrderId === order.id ? null : order.id)}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 shadow-sm"
                          >
                            <Globe size={16} />
                            {courierData.couriers.length} Courier{courierData.couriers.length !== 1 ? 's' : ''} — Select & Ship (Create Shipment)
                          </button>
                        )}
                      </>
                    )}
                    {showDomesticShiprocket && (
                      <button
                        onClick={() => handleCreateDomesticShipment(order)}
                        disabled={creatingDomesticShipmentId === order.id}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                      >
                        {creatingDomesticShipmentId === order.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Truck size={16} />
                        )}
                        {creatingDomesticShipmentId === order.id ? 'Creating...' : 'Ship via Shiprocket'}
                      </button>
                    )}
                    {showRetryShipment && (
                      <button
                        onClick={() => handleCheckServiceability(order)}
                        disabled={checkingServiceabilityId === order.id}
                        className="px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {checkingServiceabilityId === order.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Retry Shipment
                      </button>
                    )}
                    {showRecreateShipment && (
                      <button
                        onClick={() => handleRecreateShiprocketShipment(order)}
                        disabled={recreatingShiprocketShipmentId === order.id}
                        className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {recreatingShiprocketShipmentId === order.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {recreatingShiprocketShipmentId === order.id ? 'Recreating...' : 'Recreate Shipment'}
                      </button>
                    )}
                  </div>
                  )}

                  {/* Courier Selection Panel */}
                  {showCourierPanel && (
                  <div className="border-t border-indigo-100 bg-indigo-50/50">
                    <div className="px-4 sm:px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={18} className="text-indigo-600" />
                          <p className="text-sm font-semibold text-gray-900">
                            {courierData.couriers.length} Courier{courierData.couriers.length !== 1 ? 's' : ''} Available
                          </p>
                        </div>
                        <button
                          onClick={() => setExpandedCourierOrderId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {courierData.couriers.map((courier) => {
                          const isSelected = selectedCourier[order.id] === courier.courier_company_id;
                          const isCheapest = cheapestCourier?.courier_company_id === courier.courier_company_id;
                          const isFastest = fastestCourier?.courier_company_id === courier.courier_company_id
                            && fastestCourier?.courier_company_id !== cheapestCourier?.courier_company_id;
                          return (
                            <button
                              key={courier.courier_company_id}
                              type="button"
                              onClick={() => setSelectedCourier((prev) => ({ ...prev, [order.id]: courier.courier_company_id }))}
                              className={`p-3 rounded-lg border-2 text-left transition ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{courier.courier_name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">EST: {courier.etd}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-base sm:text-lg font-bold text-gray-900">₹{courier.rate.toFixed(0)}</p>
                                  {isCheapest && (
                                    <span className="inline-block text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">CHEAPEST</span>
                                  )}
                                  {isFastest && (
                                    <span className="inline-block text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">FASTEST</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                        <button
                          onClick={() => setExpandedCourierOrderId(null)}
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition"
                        >
                          Cancel
                        </button>
                        {/* Sync to Shiprocket: pushes order to Shiprocket's "New Orders" without
                            assigning AWB. Only shown when no active SR shipment exists yet.
                            All prices are converted to INR before sending — Shiprocket requires INR. */}
                        {!shipmentDetails[order.id]?.sr_order_id && (
                          <button
                            onClick={() => handleSyncToShiprocket(order)}
                            disabled={syncingOrderId === order.id}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                            title="Push order to Shiprocket's New Orders without assigning a courier/AWB. Prices auto-converted to INR."
                          >
                            {syncingOrderId === order.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Upload size={16} />
                            )}
                            {syncingOrderId === order.id ? 'Syncing...' : 'Sync to Shiprocket'}
                          </button>
                        )}
                        <button
                          onClick={() => handleCreateShiprocketShipment(order)}
                          disabled={creatingShiprocketShipmentId === order.id || !selectedCourier[order.id]}
                          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                        >
                          {creatingShiprocketShipmentId === order.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Globe size={16} />
                          )}
                          {creatingShiprocketShipmentId === order.id ? 'Creating...' : (shipmentDetails[order.id]?.sr_order_id ? 'Assign AWB & Ship' : 'Create Shipment')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            No orders found
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white rounded-xl border border-gray-200 p-3 sm:p-4 gap-2 sm:gap-0">
          <p className="text-sm text-gray-500 order-2 sm:order-1">
            Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-1 order-1 sm:order-2">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={pagination.page === 1}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - pagination.page) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-gray-400">…</span>
                  )}
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: p }))}
                    className={`w-9 h-9 text-sm font-medium rounded-lg transition ${
                      p === pagination.page
                        ? 'bg-gray-900 text-white'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
              disabled={pagination.page === totalPages}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showDetails && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Order Details</h2>
              <button onClick={() => setShowDetails(false)} className="p-1 text-gray-400 hover:text-gray-600 transition">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Order ID</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 font-mono break-all">{selectedOrder.displayOrderId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Invoice</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 font-mono">{selectedOrder.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border mt-1 ${getStatusColor(selectedOrder.status)}`}>
                    {selectedOrder.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Amount</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">{formatPrice(selectedOrder.orderTotal, selectedOrder.displayCurrency || selectedOrder.currency || 'INR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Date</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {new Date(selectedOrder.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Buyer</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">{selectedOrder.buyerName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Seller</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">{selectedOrder.sellerName}</p>
                </div>
                {selectedOrder.tracking_number && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Tracking</p>
                    <p className="text-sm sm:text-base font-semibold text-blue-600 font-mono flex items-center gap-2 mt-1">
                      <Truck size={16} /> {selectedOrder.tracking_number}
                    </p>
                  </div>
                )}
              </div>

              {/* Return Requests */}
              {orderReturns.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <RotateCcw size={16} /> Return Requests
                  </h3>
                  <div className="space-y-3">
                    {orderReturns.map((ret: any) => (
                      <div key={ret.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-900">Reason: {ret.reason}</p>
                            {ret.description && <p className="text-xs text-amber-700 mt-1">{ret.description}</p>}
                            <p className="text-xs text-amber-500 mt-1">
                              Status: <span className="font-semibold">{ret.status.toUpperCase()}</span>
                              {' · '}Requested: {new Date(ret.created_at).toLocaleDateString()}
                            </p>
                            {ret.seller_response && (
                              <p className="text-xs text-gray-600 mt-1">Seller response: {ret.seller_response}</p>
                            )}
                          </div>
                          {ret.status === 'requested' && (
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => handleApproveReturn(ret)}
                                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 flex items-center gap-1"
                              >
                                <CheckCircle size={14} /> Approve
                              </button>
                              <button
                                onClick={() => handleRejectReturn(ret)}
                                className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 flex items-center gap-1"
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status History */}
              {orderHistory.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Clock size={16} /> Status History
                  </h3>
                  <div className="space-y-2">
                    {orderHistory.map((entry: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-gray-900 font-medium">
                            {entry.from_status?.toUpperCase() || '—'} → {entry.to_status?.toUpperCase()}
                          </p>
                          {entry.note && <p className="text-gray-500">{entry.note}</p>}
                          <p className="text-gray-400">
                            {new Date(entry.created_at).toLocaleString()} · by {entry.role || 'system'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NDR Actions in Detail Modal */}
              {selectedOrder.status === 'failed_delivery' && (
                <div className="border-t pt-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-800">Delivery Failed — Admin Action Required</p>
                        {shipmentDetails[selectedOrder.id]?.ndr_reason && (
                          <p className="text-xs text-red-600 mt-1">Reason: {shipmentDetails[selectedOrder.id].ndr_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleNdrAction(selectedOrder, 'reattempt')}
                        disabled={ndrActionLoading === selectedOrder.id}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {ndrActionLoading === selectedOrder.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Reattempt Delivery
                      </button>
                      <button
                        onClick={() => handleNdrAction(selectedOrder, 'rto')}
                        disabled={ndrActionLoading === selectedOrder.id}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {ndrActionLoading === selectedOrder.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Return to Origin
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Shipment Tracking Timeline */}
              {selectedOrder.tracking_number && (isInternationalOrder(selectedOrder) || isUkOriginOrder(selectedOrder)) && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <MapPin size={16} /> Tracking Timeline
                    </h3>
                    <button
                      onClick={() => isUkOriginOrder(selectedOrder) ? handleFetchShippoTracking(selectedOrder.id) : handleFetchTracking(selectedOrder.id)}
                      disabled={trackingLoading === selectedOrder.id}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {trackingLoading === selectedOrder.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {trackingLoading === selectedOrder.id ? 'Loading...' : 'Refresh Tracking'}
                    </button>
                  </div>
                  {shipmentDetails[selectedOrder.id] && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-4 text-xs">
                        <div>
                          <span className="text-gray-500">Shipment Status: </span>
                          <span className="font-bold text-gray-900">{(shipmentDetails[selectedOrder.id].status || 'unknown').toUpperCase()}</span>
                        </div>
                        {shipmentDetails[selectedOrder.id].courier_name && (
                          <div>
                            <span className="text-gray-500">Courier: </span>
                            <span className="font-bold text-gray-900">{shipmentDetails[selectedOrder.id].courier_name}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">AWB: </span>
                          <span className="font-bold text-blue-600 font-mono">{selectedOrder.tracking_number}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {trackingEvents[selectedOrder.id] && trackingEvents[selectedOrder.id].length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {trackingEvents[selectedOrder.id].map((event: any, i: number) => (
                        <div key={event.id || i} className="flex items-start gap-3 text-xs">
                          <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${i === 0 ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                          <div className="flex-1">
                            <p className="text-gray-900 font-medium">
                              {event.sr_status_label || event.sr_status || 'Update'}
                            </p>
                            {event.activity && <p className="text-gray-500">{event.activity}</p>}
                            <div className="flex items-center gap-2 text-gray-400 mt-0.5">
                              {event.location && (
                                <span className="flex items-center gap-0.5"><MapPin size={10} /> {event.location}</span>
                              )}
                              {event.event_at && (
                                <span>{new Date(event.event_at).toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No tracking events loaded. Click "Refresh Tracking" to fetch.</p>
                  )}
                </div>
              )}

              {/* Update Status */}
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Update Status</p>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => requestStatusChange(selectedOrder.id, e.target.value)}
                  disabled={actionLoading === selectedOrder.id}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>{status.replace(/_/g, ' ').toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* Modal Footer Actions */}
              <div className="border-t pt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleDownloadInvoicePdf(selectedOrder)}
                  className="px-4 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 inline-flex items-center gap-2 text-sm font-medium"
                >
                  <Download size={16} /> Invoice PDF
                </button>
                {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
                  <button
                    onClick={() => setShowRefundDialog(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 inline-flex items-center gap-2 text-sm font-medium"
                  >
                    <DollarSign size={16} /> Process Refund
                  </button>
                )}
                {/* Shippo label actions for UK-origin orders */}
                {isUkOriginOrder(selectedOrder) && selectedOrder.tracking_number && (
                  <>
                    {selectedOrder.status === 'cancelled' && (
                      <button
                        onClick={() => void handleRefundShippoLabel(selectedOrder)}
                        disabled={refundingLabelId === selectedOrder.id}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                      >
                        {refundingLabelId === selectedOrder.id ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                        Refund Shipping Label
                      </button>
                    )}
                    {selectedOrder.status === 'return_requested' && (
                      <button
                        onClick={() => void handleCreateReturnLabel(selectedOrder)}
                        disabled={creatingReturnLabelId === selectedOrder.id}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                      >
                        {creatingReturnLabelId === selectedOrder.id ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                        Create Return Label
                      </button>
                    )}
                    {labelUrls[`${selectedOrder.id}_return`] && (
                      <a
                        href={labelUrls[`${selectedOrder.id}_return`]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg inline-flex items-center gap-2 text-sm font-medium"
                      >
                        <Download size={16} /> Download Return Label
                      </a>
                    )}
                  </>
                )}
                {!isUkOriginOrder(selectedOrder) && (selectedOrder.tracking_number || shipmentDetails[selectedOrder.id]?.status === 'cancelled') && ADMIN_SHIPMENT_MANAGE_STATUSES.includes(selectedOrder.status) && (
                  <button
                    onClick={() => handleRecreateShiprocketShipment(selectedOrder)}
                    disabled={recreatingShiprocketShipmentId === selectedOrder.id}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                  >
                    {recreatingShiprocketShipmentId === selectedOrder.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {recreatingShiprocketShipmentId === selectedOrder.id ? 'Recreating...' : 'Recreate Shipment'}
                  </button>
                )}
                <button
                  onClick={() => setShowDetails(false)}
                  className="ml-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Dialog */}
      {showRefundDialog && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Process Refund</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund Amount</label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(parseFloat(e.target.value))}
                  max={selectedOrder.orderTotal}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Max: {formatPrice(selectedOrder.orderTotal, selectedOrder.displayCurrency || selectedOrder.currency || 'INR')}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowRefundDialog(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleProcessRefund(selectedOrder.id, refundAmount)}
                disabled={actionLoading === selectedOrder.id || refundAmount <= 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {actionLoading === selectedOrder.id ? 'Processing...' : 'Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Action Modal */}
      {showReturnModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
              {showReturnModal.action === 'approve' ? 'Approve Return' : 'Reject Return'}
            </h2>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-bold text-amber-600 mb-1">Buyer's Reason</p>
              <p className="text-sm font-semibold text-amber-900">{showReturnModal.returnReq.reason}</p>
              {showReturnModal.returnReq.description && (
                <p className="text-xs text-amber-700 mt-1">{showReturnModal.returnReq.description}</p>
              )}
            </div>

            {showReturnModal.action === 'approve' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-bold text-green-600 mb-1">Refund Amount</p>
                <p className="text-lg font-bold text-green-900">{formatPrice(selectedOrder.orderTotal, selectedOrder.displayCurrency || selectedOrder.currency || 'INR')}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Response {showReturnModal.action === 'reject' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                value={returnResponse}
                onChange={(e) => setReturnResponse(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={3}
                placeholder={showReturnModal.action === 'approve' ? 'Optional note...' : 'Reason for rejecting...'}
                disabled={processingReturn}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowReturnModal(null); setReturnResponse(''); }}
                disabled={processingReturn}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReturnAction}
                disabled={processingReturn || (showReturnModal.action === 'reject' && !returnResponse)}
                className={`px-4 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50 ${
                  showReturnModal.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processingReturn ? 'Processing...' : showReturnModal.action === 'approve' ? 'Approve & Refund' : 'Reject Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Confirmation Dialog */}
      {confirmStatusChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Confirm Status Change</h2>
                <p className="text-sm text-gray-600 mt-1">
                  You are about to change order <span className="font-mono font-bold">{confirmStatusChange.displayOrderId}</span> to{' '}
                  <span className="font-bold text-red-700">{confirmStatusChange.newStatus.replace(/_/g, ' ').toUpperCase()}</span>.
                </p>
                <p className="text-xs text-gray-500 mt-2">This action may be difficult to reverse.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmStatusChange(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { orderId, newStatus } = confirmStatusChange;
                  setConfirmStatusChange(null);
                  handleUpdateStatus(orderId, newStatus);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
