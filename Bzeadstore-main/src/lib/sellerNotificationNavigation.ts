import type { Notification } from './notificationService';

export interface SellerNotificationNavState {
  fromNotification: true;
  notificationId: string;
  orderId?: string;
  orderNumber?: string;
  orderSegment?: 'new' | 'in_transit' | 'delivered' | 'cancelled';
  productId?: string;
  productTab?: 'active' | 'pending' | 'draft' | 'rejected';
  openProductEdit?: boolean;
  resumeDraft?: boolean;
  walletTab?: 'transactions' | 'withdrawals' | 'payouts';
  highlightProductId?: string;
}

const ORDER_TYPES = new Set([
  'order_new',
  'order_placed',
  'order_accepted',
  'order_rejected',
  'order_packed',
  'order_shipped',
  'order_in_transit',
  'order_out_for_delivery',
  'order_delivered',
  'order_failed_delivery',
  'order_cancelled',
  'order_picked_up',
  'order_update',
  'label_ready',
  'in_transit',
  'return_requested',
  'return_approved',
  'return_rejected',
  'refund',
  'refund_processed',
]);

const PRODUCT_TYPES = new Set(['product_approved', 'product_rejected', 'product_pending']);
const PAYOUT_TYPES = new Set(['payout_completed', 'payout_failed']);

function orderSegmentForType(type: string): SellerNotificationNavState['orderSegment'] {
  if (['order_new', 'order_placed'].includes(type)) return 'new';
  if ([
    'order_accepted',
    'order_packed',
    'order_shipped',
    'order_in_transit',
    'order_out_for_delivery',
    'order_picked_up',
    'order_update',
    'label_ready',
    'in_transit',
  ].includes(type)) {
    return 'in_transit';
  }
  if (['order_delivered'].includes(type)) return 'delivered';
  if ([
    'order_cancelled',
    'order_rejected',
    'order_failed_delivery',
    'return_requested',
    'return_approved',
    'return_rejected',
    'refund',
    'refund_processed',
  ].includes(type)) {
    return 'cancelled';
  }
  return 'new';
}

function productTabForType(type: string): SellerNotificationNavState['productTab'] {
  if (type === 'product_approved') return 'active';
  if (type === 'product_rejected') return 'rejected';
  if (type === 'product_pending') return 'pending';
  return 'pending';
}

export function resolveSellerNotificationTarget(
  notification: Notification,
): { path: string; state: SellerNotificationNavState } {
  const meta = notification.metadata || {};
  const base: SellerNotificationNavState = {
    fromNotification: true,
    notificationId: notification.id,
  };

  const orderId = meta.order_id ? String(meta.order_id) : undefined;
  const orderNumber = meta.order_number ? String(meta.order_number) : undefined;
  const productId = meta.product_id ? String(meta.product_id) : undefined;

  if (ORDER_TYPES.has(notification.type) || orderId) {
    return {
      path: '/seller/orders',
      state: {
        ...base,
        orderId,
        orderNumber,
        orderSegment: orderSegmentForType(notification.type),
      },
    };
  }

  if (PRODUCT_TYPES.has(notification.type) || productId) {
    const tab = productTabForType(notification.type);
    return {
      path: '/seller/products',
      state: {
        ...base,
        productId,
        productTab: tab,
        highlightProductId: productId,
        openProductEdit: tab === 'active' || tab === 'rejected',
        resumeDraft: tab === 'pending' || tab === 'draft',
      },
    };
  }

  if (PAYOUT_TYPES.has(notification.type)) {
    return {
      path: '/seller/wallet',
      state: { ...base, walletTab: 'payouts' },
    };
  }

  if (notification.type.startsWith('warehouse_')) {
    return { path: '/seller/warehouse', state: base };
  }

  if (notification.type.startsWith('identity_')) {
    return { path: '/seller/verify', state: base };
  }

  return { path: '/seller/dashboard', state: base };
}
