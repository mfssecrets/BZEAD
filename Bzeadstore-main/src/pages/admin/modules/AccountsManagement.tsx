import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '../../../utils/currency';
import { logger } from '../../../utils/logger';
import { TableSkeleton } from '../../../components/common/Skeleton';

// ═══════════════════════════════════════════════════════════════
// Accounts Management — unified Transactions ledger
// Source of truth (read-only):
//   • orders             → order placed / order cancellation rows
//   • manual_payouts     → admin → seller payouts
// Amounts are shown in each row's original currency (buyer paid in
// buyer currency; seller payout in seller listing currency). No FX conversion.
// ═══════════════════════════════════════════════════════════════

type TabType = 'payment-transactions' | 'transactions' | 'order-details' | 'refund-requests' | 'seller-payout';
type DebitCredit = 'credit' | 'debit';
type RefundStatusFilter = 'all' | 'requested' | 'accepted' | 'rejected' | 'paid' | 'failed';

interface PayoutRow {
  cycleCode: string;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  currency: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string | null;
  totalAmount: number;
  platformCharge: number;
  netPayout: number;
  itemCount: number;
  payoutStatus: 'pending' | 'paid';
  paidAt: string | null;
  isStale: boolean;
}

// Build cycle code like MAY012026 from a period_start date.
// Cycle 01 = covers [1st → 14th] (pays 15th); Cycle 02 = covers [15th → end] (pays 1st of next month).
// All boundaries are evaluated in UTC so the value always matches what Postgres sees.
const MONTHS_3 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const computeCycleCode = (periodStartISO: string): string => {
  const d = new Date(periodStartISO);
  const mon = MONTHS_3[d.getUTCMonth()];
  const half = d.getUTCDate() === 1 ? '01' : '02';
  return `${mon}${half}${d.getUTCFullYear()}`;
};
// Format a UTC ISO timestamp as the calendar date the user expects (M/D/YYYY).
const fmtUTCDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
};

interface RefundRow {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber: string;
  paymentIntentId: string | null;
  buyerName: string;
  buyerEmail: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: 'requested' | 'accepted' | 'rejected' | 'paid' | 'failed';
  adminNote: string | null;
  stripeRefundId: string | null;
  stripeRefundStatus: string | null;
  stripeFailureReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
}

interface PaymentTransaction {
  orderId: string;
  orderNumber: string;
  sellerName: string;
  buyerName: string;
  totalAmountPaid: number;
  paymentCurrency: string;
  paidAt: string;
  paymentMethod: string;
  buyerToInrFxRate: number | null;
  markupTotalInr: number | null;
  paymentIntentId: string | null;
}

interface Transaction {
  id: string;
  date: string;              // ISO timestamp
  paidBy: string;            // buyer name / "BZEAD Admin" / seller name
  purpose: string;           // "Order Placed" / "Order Cancellation" / "Seller Payout" / ...
  amount: number;            // amount in source currency
  sourceCurrency: string;
  direction: DebitCredit;
  transactionId: string;     // Stripe PI / manual transaction no.
  source: 'order' | 'cancellation' | 'payout';
}

interface OrderDetail {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  buyerName: string;
  buyerCountry: string;
  sellerName: string;
  sellerCountry: string;
  orderAmount: number;
  orderCurrency: string;
  exchangeRate: number | null;
  markupPrice: number | null;
  markupCurrency: string;
  status: 'PAID' | 'CANCELLED';
}

const PAGE_SIZE = 50;

const fmtNative = (amount: number, currency: string) =>
  formatCurrency(amount, (currency || 'INR').toUpperCase());

const formatPaymentMethod = (method: string) => {
  const key = (method || 'card').toLowerCase().replace(/[\s-]+/g, '_');
  const labels: Record<string, string> = {
    card: 'Card',
    cod: 'Cash on Delivery',
    upi: 'UPI',
    account_transfer: 'Bank Transfer',
    net_banking: 'Net Banking',
    wallet: 'Wallet',
  };
  return labels[key] || method || 'Card';
};

const fmtFxToInr = (rate: number | null, currency: string) => {
  if (rate == null) return '-';
  const ccy = (currency || 'INR').toUpperCase();
  if (ccy === 'INR') return '1 INR = 1 INR';
  return `1 ${ccy} = ${rate.toFixed(4)} INR`;
};

type CurrencyBucket = { credit: number; debit: number };
const sumTxnByCurrency = (rows: Transaction[]): Map<string, CurrencyBucket> => {
  const map = new Map<string, CurrencyBucket>();
  for (const t of rows) {
    const ccy = (t.sourceCurrency || 'INR').toUpperCase();
    const bucket = map.get(ccy) || { credit: 0, debit: 0 };
    if (t.direction === 'credit') bucket.credit += t.amount;
    else bucket.debit += t.amount;
    map.set(ccy, bucket);
  }
  return map;
};

type PayoutBucket = { gross: number; charge: number; net: number };
const sumPayoutByCurrency = (rows: PayoutRow[]): Map<string, PayoutBucket> => {
  const map = new Map<string, PayoutBucket>();
  for (const r of rows) {
    const ccy = (r.currency || 'INR').toUpperCase();
    const bucket = map.get(ccy) || { gross: 0, charge: 0, net: 0 };
    bucket.gross += r.totalAmount;
    bucket.charge += r.platformCharge;
    bucket.net += r.netPayout;
    map.set(ccy, bucket);
  }
  return map;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const startOfDay = (d: string) => `${d}T00:00:00`;
const endOfDay = (d: string) => `${d}T23:59:59`;

export const AccountsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('payment-transactions');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date filter — default to today (per spec)
  const [dateFrom, setDateFrom] = useState<string>(todayISO());
  const [dateTo, setDateTo] = useState<string>(todayISO());

  // Search + pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Raw fetched rows
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // ───── Payment Transactions tab state ─────
  const [ptDateFrom, setPtDateFrom] = useState<string>(todayISO());
  const [ptDateTo, setPtDateTo] = useState<string>(todayISO());
  const [ptSearch, setPtSearch] = useState('');
  const [ptDebounced, setPtDebounced] = useState('');
  const [ptRows, setPtRows] = useState<PaymentTransaction[]>([]);
  const [ptLoading, setPtLoading] = useState(false);
  const [ptError, setPtError] = useState<string | null>(null);
  const [ptPage, setPtPage] = useState(1);
  const ptSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ptSearchTimerRef.current) clearTimeout(ptSearchTimerRef.current);
    ptSearchTimerRef.current = setTimeout(() => setPtDebounced(ptSearch.trim()), 300);
    return () => {
      if (ptSearchTimerRef.current) clearTimeout(ptSearchTimerRef.current);
    };
  }, [ptSearch]);

  useEffect(() => {
    if (!ptError) return;
    const t = setTimeout(() => setPtError(null), 6000);
    return () => clearTimeout(t);
  }, [ptError]);

  // ───── Order Details tab state ─────
  const [odDateFrom, setOdDateFrom] = useState<string>(todayISO());
  const [odDateTo, setOdDateTo] = useState<string>(todayISO());
  const [odSearch, setOdSearch] = useState('');
  const [odDebounced, setOdDebounced] = useState('');
  const [odRows, setOdRows] = useState<OrderDetail[]>([]);
  const [odLoading, setOdLoading] = useState(false);
  const [odError, setOdError] = useState<string | null>(null);
  const [odPage, setOdPage] = useState(1);
  const odSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (odSearchTimerRef.current) clearTimeout(odSearchTimerRef.current);
    odSearchTimerRef.current = setTimeout(() => setOdDebounced(odSearch.trim()), 300);
    return () => {
      if (odSearchTimerRef.current) clearTimeout(odSearchTimerRef.current);
    };
  }, [odSearch]);

  useEffect(() => {
    if (!odError) return;
    const t = setTimeout(() => setOdError(null), 6000);
    return () => clearTimeout(t);
  }, [odError]);

  // ───── Refund Requests tab state ─────
  const [rfRows, setRfRows] = useState<RefundRow[]>([]);
  const [rfLoading, setRfLoading] = useState(false);
  const [rfError, setRfError] = useState<string | null>(null);
  const [rfStatusFilter, setRfStatusFilter] = useState<RefundStatusFilter>('all');
  const [rfSearch, setRfSearch] = useState('');
  const [rfDebounced, setRfDebounced] = useState('');
  const [rfActionId, setRfActionId] = useState<string | null>(null);
  const rfSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rfSearchTimerRef.current) clearTimeout(rfSearchTimerRef.current);
    rfSearchTimerRef.current = setTimeout(() => setRfDebounced(rfSearch.trim().toLowerCase()), 300);
    return () => {
      if (rfSearchTimerRef.current) clearTimeout(rfSearchTimerRef.current);
    };
  }, [rfSearch]);

  useEffect(() => {
    if (!rfError) return;
    const t = setTimeout(() => setRfError(null), 6000);
    return () => clearTimeout(t);
  }, [rfError]);

  // ───── Seller Payout tab state ─────
  // Payout cycles: 1st & 15th. A cycle that pays out on the 1st covers
  // [previous-month-16, this-month-01); a cycle paying on the 15th covers
  // [this-month-01, this-month-15). Default to the current (in-progress)
  // cycle so admins see what is accruing.
  const computeCurrentCycle = () => {
    const now = new Date();
    // Use UTC parts so cycle boundaries match the Postgres view of the dates.
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    let startMs: number;
    let endMs: number;
    let label: string;
    if (d < 15) {
      // accruing for the 15th payout
      startMs = Date.UTC(y, m, 1);
      endMs = Date.UTC(y, m, 15);
      label = `${fmtUTCDate(new Date(startMs).toISOString())} → ${fmtUTCDate(new Date(endMs - 1).toISOString())} · pays on 15th`;
    } else {
      // accruing for next month's 1st payout
      startMs = Date.UTC(y, m, 15);
      endMs = Date.UTC(y, m + 1, 1);
      label = `${fmtUTCDate(new Date(startMs).toISOString())} → ${fmtUTCDate(new Date(endMs - 1).toISOString())} · pays on 1st`;
    }
    return {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      label,
    };
  };

  const [spCycle, setSpCycle] = useState(() => computeCurrentCycle());
  const [spRows, setSpRows] = useState<PayoutRow[]>([]);
  const [spLoading, setSpLoading] = useState(false);
  const [spProcessing, setSpProcessing] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);
  const [spInfo, setSpInfo] = useState<string | null>(null);
  const [spSearch, setSpSearch] = useState('');
  const [spDebounced, setSpDebounced] = useState('');
  const [spSellerFilter, setSpSellerFilter] = useState<string>('all');
  const [spMonthFilter, setSpMonthFilter] = useState<string>('all'); // YYYY-MM or 'all'
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spModalSellerKey, setSpModalSellerKey] = useState<string>(''); // `${sellerId}::${currency}`
  const [spModalStep, setSpModalStep] = useState<'choose' | 'online'>('choose');
  const [spOnlineMethod, setSpOnlineMethod] = useState<'upi' | 'account_transfer'>('upi');
  const [spTxnId, setSpTxnId] = useState('');
  const [spIsPartial, setSpIsPartial] = useState(false);
  const [spPartialAmount, setSpPartialAmount] = useState('');
  const spSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (spSearchTimerRef.current) clearTimeout(spSearchTimerRef.current);
    spSearchTimerRef.current = setTimeout(() => setSpDebounced(spSearch.trim().toLowerCase()), 300);
    return () => {
      if (spSearchTimerRef.current) clearTimeout(spSearchTimerRef.current);
    };
  }, [spSearch]);

  useEffect(() => {
    if (!spError) return;
    const t = setTimeout(() => setSpError(null), 6000);
    return () => clearTimeout(t);
  }, [spError]);

  useEffect(() => {
    if (!spInfo) return;
    const t = setTimeout(() => setSpInfo(null), 6000);
    return () => clearTimeout(t);
  }, [spInfo]);

  // ───── Debounce search input ─────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm]);

  // ───── Auto-dismiss error ─────
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // ───── Fetch transactions from DB (server-side RPC) ─────
  const fetchTransactions = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setRefreshing(true);
    setError(null);

    try {
      const fromTs = startOfDay(dateFrom);
      const toTs = endOfDay(dateTo);

      // Single source of truth: server-side RPC enforces admin role and
      // unifies orders + cancellations + manual_payouts into one feed.
      const { data, error: rpcError } = await supabase.rpc('get_admin_transactions', {
        p_from: fromTs,
        p_to: toTs,
      });

      if (rpcError) throw new Error(rpcError.message);

      const rows: Transaction[] = ((data || []) as any[]).map((r) => ({
        id: String(r.txn_id),
        date: r.txn_date,
        paidBy: r.paid_by || '-',
        purpose: r.purpose || '-',
        amount: Number(r.amount) || 0,
        sourceCurrency: r.source_currency || 'INR',
        direction: (r.direction === 'debit' ? 'debit' : 'credit') as DebitCredit,
        transactionId: r.transaction_id || '-',
        source: (r.source as Transaction['source']) || 'order',
      }));

      setTransactions(rows);
    } catch (e) {
      logger.error(e as Error, { context: 'AccountsManagement.fetchTransactions' });
      setError((e as Error).message || 'Failed to load transactions');
      setTransactions([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  // ───── Fetch payment transactions (buyer payments ledger) ─────
  const fetchPaymentTransactions = useCallback(async () => {
    if (!ptDateFrom || !ptDateTo) return;
    setPtLoading(true);
    setPtError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_payment_transactions', {
        p_from: startOfDay(ptDateFrom),
        p_to: endOfDay(ptDateTo),
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const rows: PaymentTransaction[] = ((data || []) as any[]).map((r) => ({
        orderId: String(r.order_id),
        orderNumber: r.order_number || '-',
        sellerName: r.seller_name || '-',
        buyerName: r.buyer_name || '-',
        totalAmountPaid: Number(r.total_amount_paid) || 0,
        paymentCurrency: r.payment_currency || 'INR',
        paidAt: r.paid_at,
        paymentMethod: r.payment_method || 'card',
        buyerToInrFxRate: r.buyer_to_inr_fx_rate != null ? Number(r.buyer_to_inr_fx_rate) : null,
        markupTotalInr: r.markup_total_inr != null ? Number(r.markup_total_inr) : null,
        paymentIntentId: r.payment_intent_id || null,
      }));
      setPtRows(rows);
    } catch (e) {
      logger.error(e as Error, { context: 'AccountsManagement.fetchPaymentTransactions' });
      setPtError((e as Error).message || 'Failed to load payment transactions');
      setPtRows([]);
    } finally {
      setPtLoading(false);
    }
  }, [ptDateFrom, ptDateTo]);

  useEffect(() => {
    if (activeTab === 'payment-transactions') void fetchPaymentTransactions();
  }, [activeTab, fetchPaymentTransactions]);

  // ───── Fetch order details (server-side RPC over snapshot table) ─────
  const fetchOrderDetails = useCallback(async () => {
    if (!odDateFrom || !odDateTo) return;
    setOdLoading(true);
    setOdError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_order_details', {
        p_from: startOfDay(odDateFrom),
        p_to: endOfDay(odDateTo),
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const rows: OrderDetail[] = ((data || []) as any[]).map((r) => ({
        orderId: String(r.order_id),
        orderNumber: r.order_number || '-',
        orderDate: r.order_date,
        buyerName: r.buyer_name || '-',
        buyerCountry: r.buyer_country || '-',
        sellerName: r.seller_name || '-',
        sellerCountry: r.seller_country || '-',
        orderAmount: Number(r.order_amount) || 0,
        orderCurrency: r.order_currency || 'INR',
        exchangeRate: r.exchange_rate != null ? Number(r.exchange_rate) : null,
        markupPrice: r.markup_price != null ? Number(r.markup_price) : null,
        markupCurrency: r.markup_currency || 'INR',
        status: r.status === 'CANCELLED' ? 'CANCELLED' : 'PAID',
      }));
      setOdRows(rows);
    } catch (e) {
      logger.error(e as Error, { context: 'AccountsManagement.fetchOrderDetails' });
      setOdError((e as Error).message || 'Failed to load order details');
      setOdRows([]);
    } finally {
      setOdLoading(false);
    }
  }, [odDateFrom, odDateTo]);

  useEffect(() => {
    if (activeTab === 'order-details') void fetchOrderDetails();
  }, [activeTab, fetchOrderDetails]);

  // ───── Fetch refund requests ─────
  const fetchRefundRequests = useCallback(async () => {
    setRfLoading(true);
    setRfError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_refund_requests', {
        p_status: rfStatusFilter === 'all' ? null : rfStatusFilter,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const rows: RefundRow[] = ((data || []) as any[]).map((r) => ({
        id: String(r.id),
        refundNumber: r.refund_number || '-',
        orderId: String(r.order_id),
        orderNumber: r.order_number || '-',
        paymentIntentId: r.payment_intent_id || null,
        buyerName: r.buyer_name || '-',
        buyerEmail: r.buyer_email || null,
        amount: Number(r.amount) || 0,
        currency: r.currency || 'INR',
        reason: r.reason || null,
        status: (r.status as RefundRow['status']) || 'requested',
        adminNote: r.admin_note || null,
        stripeRefundId: r.stripe_refund_id || null,
        stripeRefundStatus: r.stripe_refund_status || null,
        stripeFailureReason: r.stripe_failure_reason || null,
        requestedAt: r.requested_at,
        reviewedAt: r.reviewed_at || null,
        paidAt: r.paid_at || null,
      }));
      setRfRows(rows);
    } catch (e) {
      logger.error(e as Error, { context: 'AccountsManagement.fetchRefundRequests' });
      setRfError((e as Error).message || 'Failed to load refund requests');
      setRfRows([]);
    } finally {
      setRfLoading(false);
    }
  }, [rfStatusFilter]);

  useEffect(() => {
    if (activeTab === 'refund-requests') void fetchRefundRequests();
  }, [activeTab, fetchRefundRequests]);

  // ───── Fetch seller payouts ─────
  const fetchSellerPayouts = useCallback(async () => {
    setSpLoading(true);
    setSpError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_get_seller_payouts', {
        p_period_start: spCycle.start,
        p_period_end: spCycle.end,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const rows: PayoutRow[] = ((data || []) as Array<{
        cycle_code: string | null;
        order_id: string;
        order_number: string | null;
        order_date: string;
        order_status: string;
        currency: string | null;
        seller_id: string;
        seller_name: string | null;
        seller_email: string | null;
        total_amount: number | string;
        platform_charge: number | string;
        net_payout: number | string;
        item_count: number | string;
        payout_status: string | null;
        paid_at: string | null;
        is_stale: boolean | null;
      }>).map((r) => ({
        cycleCode: r.cycle_code || computeCycleCode(spCycle.start),
        orderId: String(r.order_id),
        orderNumber: r.order_number || '-',
        orderDate: r.order_date,
        orderStatus: r.order_status,
        currency: r.currency || 'INR',
        sellerId: String(r.seller_id),
        sellerName: r.seller_name || 'Seller',
        sellerEmail: r.seller_email,
        totalAmount: Number(r.total_amount) || 0,
        platformCharge: Number(r.platform_charge) || 0,
        netPayout: Number(r.net_payout) || 0,
        itemCount: Number(r.item_count) || 0,
        payoutStatus: (r.payout_status === 'paid' ? 'paid' : 'pending') as 'pending' | 'paid',
        paidAt: r.paid_at,
        isStale: Boolean(r.is_stale),
      }));
      setSpRows(rows);
    } catch (e) {
      logger.error(e as Error, { context: 'AccountsManagement.fetchSellerPayouts' });
      setSpError((e as Error).message || 'Failed to load seller payouts');
      setSpRows([]);
    } finally {
      setSpLoading(false);
    }
  }, [spCycle.start, spCycle.end]);

  useEffect(() => {
    if (activeTab === 'seller-payout') void fetchSellerPayouts();
  }, [activeTab, fetchSellerPayouts]);

  // ───── Pending buckets grouped by (seller, currency) for the current cycle ─────
  // Used by the Process Payout modal so the admin can pick which seller to pay.
  const spPendingBuckets = useMemo(() => {
    const buckets = new Map<
      string,
      { sellerId: string; sellerName: string; sellerEmail: string | null; currency: string;
        total: number; platform: number; net: number; orders: Set<string>;
        cycleCode: string }
    >();
    for (const r of spRows) {
      if (r.payoutStatus === 'paid' && !r.isStale) continue;
      const key = `${r.sellerId}::${r.currency}`;
      const b = buckets.get(key) || {
        sellerId: r.sellerId,
        sellerName: r.sellerName,
        sellerEmail: r.sellerEmail,
        currency: r.currency,
        total: 0, platform: 0, net: 0,
        orders: new Set<string>(),
        cycleCode: r.cycleCode,
      };
      b.total += r.totalAmount;
      b.platform += r.platformCharge;
      b.net += r.netPayout;
      b.orders.add(r.orderId);
      buckets.set(key, b);
    }
    return buckets;
  }, [spRows]);

  // Open the modal; default-select the first bucket if any.
  const openProcessPayoutModal = useCallback(() => {
    if (spPendingBuckets.size === 0) {
      setSpInfo('Nothing to process — all rows in this cycle are already paid.');
      return;
    }
    const firstKey = Array.from(spPendingBuckets.keys())[0];
    setSpModalSellerKey(firstKey);
    setSpModalStep('choose');
    setSpOnlineMethod('upi');
    setSpTxnId('');
    setSpIsPartial(false);
    setSpPartialAmount('');
    setSpError(null);
    setSpInfo(null);
    setSpModalOpen(true);
  }, [spPendingBuckets]);

  // Submit the modal: mark the chosen seller bucket paid with the chosen method.
  const handleProcessPayoutSubmit = useCallback(
    async (method: 'stripe' | 'online') => {
      const b = spPendingBuckets.get(spModalSellerKey);
      if (!b) {
        setSpError('Please select a seller.');
        return;
      }

      // Online-method validation lives in the UI; the DB also enforces it.
      let partialAmt: number | null = null;
      if (method === 'online') {
        if (!spTxnId.trim()) {
          setSpError('Transaction ID is required for online payments.');
          return;
        }
        if (spIsPartial) {
          const n = Number(spPartialAmount);
          if (!Number.isFinite(n) || n <= 0) {
            setSpError('Enter a valid partial amount greater than 0.');
            return;
          }
          if (n >= b.net) {
            setSpError(`Partial amount must be less than the full net payout (${formatCurrency(b.net, b.currency)}).`);
            return;
          }
          partialAmt = Number(n.toFixed(2));
        }
      }

      setSpProcessing(true);
      setSpError(null);
      setSpInfo(null);
      try {
        const { error: rpcErr } = await supabase.rpc('admin_mark_seller_payout_paid', {
          p_cycle_code: b.cycleCode,
          p_seller_id: b.sellerId,
          p_currency: b.currency,
          p_period_start: spCycle.start,
          p_period_end: spCycle.end,
          p_total_amount: Number(b.total.toFixed(2)),
          p_platform_charge: Number(b.platform.toFixed(2)),
          p_net_payout: Number(b.net.toFixed(2)),
          p_order_count: b.orders.size,
          p_payment_method: method,
          p_online_method: method === 'online' ? spOnlineMethod : null,
          p_transaction_id: method === 'online' ? spTxnId.trim() : null,
          p_is_partial: method === 'online' ? spIsPartial : false,
          p_paid_amount: method === 'online' && spIsPartial ? partialAmt : null,
          p_note: null,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        const paidLabel = method === 'online' && spIsPartial && partialAmt !== null
          ? `${formatCurrency(partialAmt, b.currency)} (PARTIAL of ${formatCurrency(b.net, b.currency)})`
          : formatCurrency(b.net, b.currency);
        setSpInfo(
          `Marked ${b.sellerName} payout of ${paidLabel} via ${method === 'stripe' ? 'Stripe' : `Online – ${spOnlineMethod === 'upi' ? 'UPI' : 'Account Transfer'}`}.`
        );
        setSpModalOpen(false);
        await fetchSellerPayouts();
      } catch (e) {
        logger.error(e as Error, { context: 'AccountsManagement.handleProcessPayoutSubmit' });
        setSpError((e as Error).message || 'Failed to process payout');
      } finally {
        setSpProcessing(false);
      }
    },
    [spPendingBuckets, spModalSellerKey, spCycle, fetchSellerPayouts, spOnlineMethod, spTxnId, spIsPartial, spPartialAmount]
  );

  const handleReviewRefund = useCallback(
    async (request: RefundRow, decision: 'accepted' | 'rejected') => {
      const note = window.prompt(
        `Optional note for ${decision === 'accepted' ? 'accepting' : 'rejecting'} refund ${request.refundNumber}:`,
        ''
      );
      // window.prompt returns null on Cancel — abort in that case.
      if (note === null) return;
      setRfActionId(request.id);
      try {
        const { error: rpcErr } = await supabase.rpc('admin_review_refund_request', {
          p_request_id: request.id,
          p_decision: decision,
          p_admin_note: note || null,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        await fetchRefundRequests();
      } catch (e) {
        logger.error(e as Error, { context: 'AccountsManagement.handleReviewRefund' });
        setRfError((e as Error).message || 'Failed to update refund request');
      } finally {
        setRfActionId(null);
      }
    },
    [fetchRefundRequests]
  );

  const handlePayRefund = useCallback(
    async (request: RefundRow) => {
      const confirmMsg =
        `Issue Stripe refund of ${formatCurrency(request.amount, request.currency)} to the buyer's original payment method?\n\n` +
        `Refund #: ${request.refundNumber}\n` +
        `Order #: ${request.orderNumber}\n\n` +
        `This is irreversible once submitted.`;
      if (!window.confirm(confirmMsg)) return;

      setRfActionId(request.id);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('Not authenticated');

        const supabaseUrl = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl
          || import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) throw new Error('Supabase URL not configured');

        const resp = await fetch(`${supabaseUrl}/functions/v1/refund-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refund_request_id: request.id }),
        });

        const result = await resp.json().catch(() => ({}));
        if (!resp.ok || result?.error) {
          throw new Error(result?.error || `Refund failed (HTTP ${resp.status})`);
        }
        await fetchRefundRequests();
      } catch (e) {
        logger.error(e as Error, { context: 'AccountsManagement.handlePayRefund' });
        setRfError((e as Error).message || 'Failed to issue Stripe refund');
      } finally {
        setRfActionId(null);
      }
    },
    [fetchRefundRequests]
  );

  useEffect(() => {
    setPtPage(1);
  }, [ptDebounced, ptDateFrom, ptDateTo]);

  useEffect(() => {
    setOdPage(1);
  }, [odDebounced, odDateFrom, odDateTo]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo]);

  // ───── Search filter ─────
  const filtered = useMemo(() => {
    if (!debouncedSearch) return transactions;
    const q = debouncedSearch.toLowerCase();
    return transactions.filter((t) => {
      const amountStr = t.amount.toFixed(2);
      return (
        t.paidBy.toLowerCase().includes(q) ||
        t.purpose.toLowerCase().includes(q) ||
        t.transactionId.toLowerCase().includes(q) ||
        amountStr.includes(q) ||
        t.sourceCurrency.toLowerCase().includes(q)
      );
    });
  }, [transactions, debouncedSearch]);

  const txnTotalsByCurrency = useMemo(
    () => sumTxnByCurrency(filtered),
    [filtered]
  );

  // ───── Payment Transactions: search + pagination ─────
  const ptFiltered = useMemo(() => {
    if (!ptDebounced) return ptRows;
    const q = ptDebounced.toLowerCase();
    return ptRows.filter(
      (r) =>
        r.orderNumber.toLowerCase().includes(q) ||
        r.sellerName.toLowerCase().includes(q) ||
        r.buyerName.toLowerCase().includes(q) ||
        r.paymentMethod.toLowerCase().includes(q) ||
        (r.paymentIntentId || '').toLowerCase().includes(q)
    );
  }, [ptRows, ptDebounced]);

  const ptTotalPages = Math.max(1, Math.ceil(ptFiltered.length / PAGE_SIZE));
  const ptPageRows = useMemo(() => {
    const start = (ptPage - 1) * PAGE_SIZE;
    return ptFiltered.slice(start, start + PAGE_SIZE);
  }, [ptFiltered, ptPage]);

  const handlePtExport = () => {
    if (ptFiltered.length === 0) return;
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Payment Date & Time',
      'Order ID',
      'Seller Name',
      'Buyer Name',
      'Total Amount Paid',
      'Currency',
      'Mode of Payment',
      'FX Rate to INR',
      'Total Markup (INR)',
      'Stripe Payment Intent',
    ];
    const lines = [header.map(escape).join(',')];
    for (const r of ptFiltered) {
      lines.push(
        [
          new Date(r.paidAt).toLocaleString(),
          r.orderNumber,
          r.sellerName,
          r.buyerName,
          r.totalAmountPaid.toFixed(2),
          r.paymentCurrency,
          formatPaymentMethod(r.paymentMethod),
          r.buyerToInrFxRate != null ? r.buyerToInrFxRate.toFixed(8) : '-',
          r.markupTotalInr != null ? r.markupTotalInr.toFixed(2) : '-',
          r.paymentIntentId || '-',
        ]
          .map(escape)
          .join(',')
      );
    }
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment_transactions_${ptDateFrom}_to_${ptDateTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ───── Pagination ─────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // ───── Order Details: search + pagination ─────
  const odFiltered = useMemo(() => {
    if (!odDebounced) return odRows;
    const q = odDebounced.toLowerCase();
    return odRows.filter(
      (r) =>
        r.orderNumber.toLowerCase().includes(q) ||
        r.buyerName.toLowerCase().includes(q) ||
        r.buyerCountry.toLowerCase().includes(q) ||
        r.sellerName.toLowerCase().includes(q) ||
        r.sellerCountry.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
    );
  }, [odRows, odDebounced]);

  const odTotalPages = Math.max(1, Math.ceil(odFiltered.length / PAGE_SIZE));
  const odPageRows = useMemo(() => {
    const start = (odPage - 1) * PAGE_SIZE;
    return odFiltered.slice(start, start + PAGE_SIZE);
  }, [odFiltered, odPage]);

  // ───── Order Details: Excel export ─────
  const handleOdExport = () => {
    if (odFiltered.length === 0) return;
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Order Date',
      'Order ID',
      'Buyer Name',
      'Buyer Country',
      'Seller Name',
      'Seller Country',
      'Buyer Paid',
      'Buyer Currency',
      'Exchange Rate',
      'Markup Price',
      'Markup Currency',
      'Status',
    ];
    const lines = [header.map(escape).join(',')];
    for (const r of odFiltered) {
      lines.push(
        [
          new Date(r.orderDate).toLocaleString(),
          r.orderNumber,
          r.buyerName,
          r.buyerCountry,
          r.sellerName,
          r.sellerCountry,
          r.orderAmount.toFixed(2),
          r.orderCurrency,
          r.exchangeRate != null ? r.exchangeRate.toFixed(6) : '-',
          r.markupPrice != null ? r.markupPrice.toFixed(2) : '-',
          r.markupCurrency,
          r.status,
        ]
          .map(escape)
          .join(',')
      );
    }
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `order_details_${odDateFrom}_to_${odDateTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ───── CSV export (Excel-compatible) ─────
  const handleExport = () => {
    if (filtered.length === 0) return;
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Date', 'Paid By', 'Purpose', 'Amount', 'Currency', 'Debit/Credit', 'Transaction ID'];
    const lines = [header.map(escape).join(',')];
    for (const t of filtered) {
      lines.push(
        [
          new Date(t.date).toLocaleString(),
          t.paidBy,
          t.purpose,
          t.amount.toFixed(2),
          t.sourceCurrency,
          t.direction === 'credit' ? 'Credit' : 'Debit',
          t.transactionId,
        ]
          .map(escape)
          .join(',')
      );
    }
    const csv = '\uFEFF' + lines.join('\n'); // BOM for Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${dateFrom}_to_${dateTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ───── Render ─────
  return (
    <div className="space-y-6 max-w-[1600px]">
      {refreshing && (
        <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-blue-100">
          <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Accounts Management</h2>
          <p className="text-gray-500 text-sm mt-1">Real-time financial overview &amp; transaction management</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'payment-transactions') void fetchPaymentTransactions();
            else if (activeTab === 'order-details') void fetchOrderDetails();
            else if (activeTab === 'refund-requests') void fetchRefundRequests();
            else if (activeTab === 'seller-payout') void fetchSellerPayouts();
            else void fetchTransactions();
          }}
          disabled={refreshing || ptLoading || odLoading || rfLoading || spLoading}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('payment-transactions')}
          className={`px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm transition ${
            activeTab === 'payment-transactions'
              ? 'bg-blue-600 text-white'
              : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300'
          }`}
        >
          Transactions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm transition ${
            activeTab === 'transactions'
              ? 'bg-blue-600 text-white'
              : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300'
          }`}
        >
          Ledger
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('order-details')}
          className={`px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm transition ${
            activeTab === 'order-details'
              ? 'bg-blue-600 text-white'
              : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300'
          }`}
        >
          Order Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('refund-requests')}
          className={`px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm transition ${
            activeTab === 'refund-requests'
              ? 'bg-blue-600 text-white'
              : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300'
          }`}
        >
          Refund Requests
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('seller-payout')}
          className={`px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm transition ${
            activeTab === 'seller-payout'
              ? 'bg-blue-600 text-white'
              : 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300'
          }`}
        >
          Seller Payout
        </button>
      </div>

      {error && activeTab === 'transactions' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {activeTab === 'payment-transactions' && (
        <>
          {ptError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{ptError}</span>
            </div>
          )}

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-400" />
                <h3 className="font-semibold text-gray-800">Payment Transactions</h3>
                <span className="text-xs text-gray-500">Buyer payments · original currency · no FX conversion</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={ptDateFrom}
                    onChange={(e) => setPtDateFrom(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="date"
                    value={ptDateTo}
                    onChange={(e) => setPtDateTo(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const t = todayISO();
                    setPtDateFrom(t);
                    setPtDateTo(t);
                  }}
                  className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Today
                </button>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search order / buyer / seller…"
                    value={ptSearch}
                    onChange={(e) => setPtSearch(e.target.value)}
                    className="rounded-md border pl-8 pr-2 py-1.5 text-sm w-60"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePtExport}
                  disabled={ptFiltered.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Download size={14} />
                  Excel
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Order ID</th>
                  <th className="px-4 py-3 text-left">Seller</th>
                  <th className="px-4 py-3 text-left">Buyer</th>
                  <th className="px-4 py-3 text-right">Total Paid</th>
                  <th className="px-4 py-3 text-left">Payment Date &amp; Time</th>
                  <th className="px-4 py-3 text-left">Mode of Pay</th>
                  <th className="px-4 py-3 text-right">FX Rate → INR</th>
                  <th className="px-4 py-3 text-right">Total Markup (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ptLoading ? (
                  <tr>
                    <td colSpan={8} className="p-4">
                      <span className="sr-only">Loading payment transactions…</span>
                      <TableSkeleton rows={8} columns={8} className="border-0" />
                    </td>
                  </tr>
                ) : ptPageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No payment transactions in this date range.
                    </td>
                  </tr>
                ) : (
                  ptPageRows.map((r) => (
                    <tr key={r.orderId} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-800 whitespace-nowrap">
                        {r.orderNumber}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800">{r.sellerName}</td>
                      <td className="px-4 py-2.5 text-gray-800">{r.buyerName}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {fmtNative(r.totalAmountPaid, r.paymentCurrency)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {new Date(r.paidAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {formatPaymentMethod(r.paymentMethod)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap" title={fmtFxToInr(r.buyerToInrFxRate, r.paymentCurrency)}>
                        {r.buyerToInrFxRate != null ? r.buyerToInrFxRate.toFixed(4) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800 whitespace-nowrap">
                        {r.markupTotalInr != null ? fmtNative(r.markupTotalInr, 'INR') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {ptFiltered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-2.5 text-sm shadow-sm">
              <span className="text-gray-600">
                Showing {(ptPage - 1) * PAGE_SIZE + 1}–{Math.min(ptPage * PAGE_SIZE, ptFiltered.length)} of{' '}
                {ptFiltered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={ptPage === 1}
                  onClick={() => setPtPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="px-2 text-xs text-gray-600">
                  Page {ptPage} / {ptTotalPages}
                </span>
                <button
                  type="button"
                  disabled={ptPage >= ptTotalPages}
                  onClick={() => setPtPage((p) => Math.min(ptTotalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'transactions' && (
        <>
          {/* Totals — per original currency, no FX conversion */}
          {txnTotalsByCurrency.size > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from(txnTotalsByCurrency.entries()).map(([ccy, bucket]) => {
                const net = bucket.credit - bucket.debit;
                return (
                  <div key={ccy} className="rounded-lg border bg-white p-4 shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{ccy}</span>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Credit</span>
                        <span className="font-semibold text-emerald-600">{fmtNative(bucket.credit, ccy)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Debit</span>
                        <span className="font-semibold text-rose-600">{fmtNative(bucket.debit, ccy)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-1">
                        <span className="font-medium text-gray-700">Net</span>
                        <span className={`font-bold ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmtNative(net, ccy)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Filter bar */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Calendar size={16} className="text-gray-500" />
                <span>Ledger</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Date range */}
                <div className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1.5">
                  <Calendar size={14} className="text-gray-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="border-none bg-transparent text-sm outline-none"
                  />
                  <span className="text-xs text-gray-400">→</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="border-none bg-transparent text-sm outline-none"
                  />
                </div>

                {/* Quick today */}
                <button
                  type="button"
                  onClick={() => {
                    const t = todayISO();
                    setDateFrom(t);
                    setDateTo(t);
                  }}
                  className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Today
                </button>

                {/* Search */}
                <div className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1.5">
                  <Search size={14} className="text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search orders..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-56 border-none bg-transparent text-sm outline-none"
                  />
                </div>

                {/* Export */}
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={filtered.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Download size={14} />
                  Excel
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <th className="w-40 px-4 py-3">Date</th>
                  <th className="w-48 px-4 py-3">Paid By</th>
                  <th className="px-4 py-3">Purpose</th>
                  <th className="w-36 px-4 py-3 text-right">Amount (original)</th>
                  <th className="w-32 px-4 py-3 text-center">Debit/Credit</th>
                  <th className="w-56 px-4 py-3">Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-4">
                      <span className="sr-only">Loading transactions...</span>
                      <TableSkeleton rows={8} columns={6} className="border-0" />
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No transactions in this range.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">
                        {new Date(t.date).toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{t.paidBy}</td>
                      <td className="px-4 py-3 text-gray-700">{t.purpose}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {fmtNative(t.amount, t.sourceCurrency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            t.direction === 'credit'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {t.direction === 'credit' ? 'Credit' : 'Debit'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 break-all">
                        {t.transactionId}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-2.5 text-sm shadow-sm">
              <span className="text-gray-600">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="px-2 text-xs text-gray-600">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'order-details' && (
        <>
          {odError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{odError}</span>
            </div>
          )}

          {/* Filter bar */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-400" />
                <h3 className="font-semibold text-gray-800">Order Details</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={odDateFrom}
                    onChange={(e) => setOdDateFrom(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="date"
                    value={odDateTo}
                    onChange={(e) => setOdDateTo(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const t = todayISO();
                    setOdDateFrom(t);
                    setOdDateTo(t);
                  }}
                  className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Today
                </button>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search order / buyer / seller…"
                    value={odSearch}
                    onChange={(e) => setOdSearch(e.target.value)}
                    className="rounded-md border pl-8 pr-2 py-1.5 text-sm w-60"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleOdExport}
                  disabled={odFiltered.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Download size={14} />
                  Excel
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Order ID</th>
                    <th className="px-4 py-3 text-left">Buyer</th>
                    <th className="px-4 py-3 text-left">Seller</th>
                    <th className="px-4 py-3 text-right">Buyer Paid</th>
                    <th className="px-4 py-3 text-right">FX Rate</th>
                    <th className="px-4 py-3 text-right">Admin Markup</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {odLoading ? (
                    <tr>
                      <td colSpan={8} className="p-4">
                        <span className="sr-only">Loading…</span>
                        <TableSkeleton rows={8} columns={8} className="border-0" />
                      </td>
                    </tr>
                  ) : odPageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                        No orders in this range.
                      </td>
                    </tr>
                  ) : (
                    odPageRows.map((r) => (
                      <tr key={r.orderId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">
                          {new Date(r.orderDate).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.orderNumber}</td>
                        <td className="px-4 py-2.5 text-gray-800">
                          <div className="font-medium">{r.buyerName}</div>
                          <div className="text-xs text-gray-500">{r.buyerCountry}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-800">
                          <div className="font-medium">{r.sellerName}</div>
                          <div className="text-xs text-gray-500">{r.sellerCountry}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">
                          {fmtNative(r.orderAmount, r.orderCurrency)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">
                          {r.exchangeRate != null ? r.exchangeRate.toFixed(6) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">
                          {r.markupPrice != null
                            ? fmtNative(r.markupPrice, r.markupCurrency)
                            : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              r.status === 'CANCELLED'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {odTotalPages > 1 && (
              <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-2.5 text-sm">
                <span className="text-gray-600">
                  Page {odPage} of {odTotalPages} · {odFiltered.length} orders
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOdPage((p) => Math.max(1, p - 1))}
                    disabled={odPage === 1}
                    className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft size={14} />
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setOdPage((p) => Math.min(odTotalPages, p + 1))}
                    disabled={odPage === odTotalPages}
                    className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'refund-requests' && (
        <>
          {rfError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{rfError}</span>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 shadow-sm">
            <div className="flex items-center gap-1 flex-wrap">
              {(['all', 'requested', 'accepted', 'paid', 'failed', 'rejected'] as RefundStatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRfStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
                    rfStatusFilter === s
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={rfSearch}
                onChange={(e) => setRfSearch(e.target.value)}
                placeholder="Search refund #, order #, buyer..."
                className="w-full rounded-md border bg-white pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <button
              type="button"
              onClick={() => void fetchRefundRequests()}
              disabled={rfLoading}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={rfLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Requested</th>
                  <th className="px-3 py-2 text-left font-semibold">Refund ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Order</th>
                  <th className="px-3 py-2 text-left font-semibold">Buyer</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Reason</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfLoading ? (
                  <tr>
                    <td colSpan={8} className="p-4">
                      <span className="sr-only">Loading refund requests...</span>
                      <TableSkeleton rows={8} columns={8} className="border-0" />
                    </td>
                  </tr>
                ) : (() => {
                  const filtered = rfDebounced
                    ? rfRows.filter((r) =>
                        r.refundNumber.toLowerCase().includes(rfDebounced) ||
                        r.orderNumber.toLowerCase().includes(rfDebounced) ||
                        r.buyerName.toLowerCase().includes(rfDebounced) ||
                        (r.buyerEmail || '').toLowerCase().includes(rfDebounced)
                      )
                    : rfRows;
                  if (filtered.length === 0) {
                    return (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No refund requests found.</td></tr>
                    );
                  }
                  return filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-gray-50/60">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {new Date(r.requestedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-800">{r.refundNumber}</td>
                      <td className="px-3 py-2 text-gray-700">{r.orderNumber}</td>
                      <td className="px-3 py-2 text-gray-700">
                        <div className="font-semibold">{r.buyerName}</div>
                        {r.buyerEmail && <div className="text-xs text-gray-500">{r.buyerEmail}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {fmtNative(r.amount, r.currency)}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-[240px]">
                        <div className="line-clamp-2" title={r.reason || ''}>{r.reason || '-'}</div>
                        {r.adminNote && (
                          <div className="mt-1 text-[10px] text-gray-500 italic" title={r.adminNote}>
                            Admin: {r.adminNote}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          r.status === 'paid'
                            ? 'bg-blue-100 text-blue-700'
                            : r.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : r.status === 'accepted'
                                ? 'bg-green-100 text-green-700'
                                : r.status === 'rejected'
                                  ? 'bg-gray-200 text-gray-700'
                                  : 'bg-amber-100 text-amber-700'
                        }`}>
                          {r.status.toUpperCase()}
                        </span>
                        {r.stripeRefundStatus && (
                          <div className="mt-1 text-[10px] text-gray-500" title={r.stripeFailureReason || ''}>
                            Stripe: {r.stripeRefundStatus}
                            {r.stripeFailureReason ? ` (${r.stripeFailureReason})` : ''}
                          </div>
                        )}
                        {r.stripeRefundId && (
                          <div className="text-[10px] text-gray-400 font-mono">{r.stripeRefundId}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {r.status === 'requested' ? (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              disabled={rfActionId === r.id}
                              onClick={() => void handleReviewRefund(r, 'accepted')}
                              className="inline-flex items-center gap-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-2.5 py-1 disabled:opacity-50"
                            >
                              <CheckCircle2 size={12} />
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={rfActionId === r.id}
                              onClick={() => void handleReviewRefund(r, 'rejected')}
                              className="inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-2.5 py-1 disabled:opacity-50"
                            >
                              <XCircle size={12} />
                              Reject
                            </button>
                          </div>
                        ) : (r.status === 'accepted' || r.status === 'failed') ? (
                          <button
                            type="button"
                            disabled={rfActionId === r.id || !r.paymentIntentId}
                            onClick={() => void handlePayRefund(r)}
                            title={!r.paymentIntentId ? 'Order has no Stripe payment intent' : undefined}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1 disabled:opacity-50"
                          >
                            {rfActionId === r.id
                              ? 'Processing...'
                              : r.status === 'failed' ? 'Retry Pay' : 'Pay Refund'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {r.paidAt
                              ? `Paid ${new Date(r.paidAt).toLocaleString()}`
                              : r.reviewedAt
                                ? new Date(r.reviewedAt).toLocaleString()
                                : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'seller-payout' && (
        <>
          {spError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{spError}</span>
            </div>
          )}
          {spInfo && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{spInfo}</span>
            </div>
          )}

          {/* Cycle selector + Process Payout */}
          <div className="rounded-lg border bg-white p-3 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase text-gray-500">Payout cycle</span>
              <span className="text-sm font-semibold text-gray-800">
                <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 mr-2">
                  {computeCycleCode(spCycle.start)}
                </span>
                {spCycle.label}
              </span>
              <span className="text-[11px] text-gray-500">
                Cycles run 1st → 14th (pays 15th) and 15th → end of month (pays 1st). Only delivered orders.
              </span>
              <button
                type="button"
                onClick={openProcessPayoutModal}
                disabled={spProcessing || spLoading || spPendingBuckets.size === 0}
                className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 size={16} className={spProcessing ? 'animate-pulse' : ''} />
                {spProcessing ? 'Processing…' : 'PROCESS PAYOUT'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const s = new Date(spCycle.start);
                  const sy = s.getUTCFullYear();
                  const sm = s.getUTCMonth();
                  const sd = s.getUTCDate();
                  let prevStartMs: number;
                  let prevEndMs: number;
                  // If current cycle starts on day 1 → previous cycle was prev-month-15 to this-month-1
                  // If current cycle starts on day 15 → previous cycle was this-month-1 to this-month-15
                  if (sd === 1) {
                    prevStartMs = Date.UTC(sy, sm - 1, 15);
                    prevEndMs = Date.UTC(sy, sm, 1);
                  } else {
                    prevStartMs = Date.UTC(sy, sm, 1);
                    prevEndMs = Date.UTC(sy, sm, 15);
                  }
                  setSpCycle({
                    start: new Date(prevStartMs).toISOString(),
                    end: new Date(prevEndMs).toISOString(),
                    label: `${fmtUTCDate(new Date(prevStartMs).toISOString())} → ${fmtUTCDate(new Date(prevEndMs - 1).toISOString())}`,
                  });
                }}
                className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <ChevronLeft size={14} /> Previous cycle
              </button>
              <button
                type="button"
                onClick={() => setSpCycle(computeCurrentCycle())}
                className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Current
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = new Date(spCycle.start);
                  const sy = s.getUTCFullYear();
                  const sm = s.getUTCMonth();
                  const sd = s.getUTCDate();
                  let nextStartMs: number;
                  let nextEndMs: number;
                  if (sd === 1) {
                    nextStartMs = Date.UTC(sy, sm, 15);
                    nextEndMs = Date.UTC(sy, sm + 1, 1);
                  } else {
                    nextStartMs = Date.UTC(sy, sm + 1, 1);
                    nextEndMs = Date.UTC(sy, sm + 1, 15);
                  }
                  setSpCycle({
                    start: new Date(nextStartMs).toISOString(),
                    end: new Date(nextEndMs).toISOString(),
                    label: `${fmtUTCDate(new Date(nextStartMs).toISOString())} → ${fmtUTCDate(new Date(nextEndMs - 1).toISOString())}`,
                  });
                }}
                className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Next cycle <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => void fetchSellerPayouts()}
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <RefreshCw size={14} className={spLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Totals */}
          {(() => {
            // Unique sellers + months across all loaded rows (for filter dropdowns).
            const sellerOptions = Array.from(
              new Map(spRows.map((r) => [r.sellerId, r.sellerName])).entries()
            ).map(([id, name]) => ({ id, name }));
            const monthOptions = Array.from(
              new Set(
                spRows.map((r) => {
                  const d = new Date(r.orderDate);
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                })
              )
            ).sort().reverse();

            const filtered = spRows.filter((r) => {
              if (spSellerFilter !== 'all' && r.sellerId !== spSellerFilter) return false;
              if (spMonthFilter !== 'all') {
                const d = new Date(r.orderDate);
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (ym !== spMonthFilter) return false;
              }
              if (!spDebounced) return true;
              const q = spDebounced;
              return (
                r.orderNumber.toLowerCase().includes(q) ||
                r.sellerName.toLowerCase().includes(q) ||
                (r.sellerEmail || '').toLowerCase().includes(q)
              );
            });
            const payoutTotalsByCurrency = sumPayoutByCurrency(filtered);

            return (
              <>
                {payoutTotalsByCurrency.size > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from(payoutTotalsByCurrency.entries()).map(([ccy, bucket]) => (
                      <div key={ccy} className="rounded-lg border bg-white p-4 shadow-sm">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                          Seller listing · {ccy}
                        </span>
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">Gross</span>
                            <span className="font-semibold text-gray-900">{fmtNative(bucket.gross, ccy)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">Platform (9%)</span>
                            <span className="font-semibold text-rose-600">{fmtNative(bucket.charge, ccy)}</span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1">
                            <span className="font-medium text-gray-700">Net payout</span>
                            <span className="font-bold text-emerald-600">{fmtNative(bucket.net, ccy)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Filters + Search */}
                <div className="rounded-lg border bg-white p-3 shadow-sm flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={spSearch}
                      onChange={(e) => setSpSearch(e.target.value)}
                      placeholder="Search order #, seller name or email..."
                      className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={spSellerFilter}
                    onChange={(e) => setSpSellerFilter(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="all">All sellers</option>
                    {sellerOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <select
                    value={spMonthFilter}
                    onChange={(e) => setSpMonthFilter(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="all">All months</option>
                    {monthOptions.map((ym) => {
                      const [yy, mm] = ym.split('-');
                      const label = `${MONTHS_3[Number(mm) - 1]} ${yy}`;
                      return <option key={ym} value={ym}>{label}</option>;
                    })}
                  </select>
                </div>

                {/* Table */}
                <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Cycle</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Order #</th>
                        <th className="px-3 py-2 text-left">Seller</th>
                        <th className="px-3 py-2 text-left">Order Status</th>
                        <th className="px-3 py-2 text-left">Payout</th>
                        <th className="px-3 py-2 text-right">Listing Total</th>
                        <th className="px-3 py-2 text-right">Platform (9%)</th>
                        <th className="px-3 py-2 text-right">Net Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {spLoading ? (
                        <tr>
                          <td colSpan={9} className="p-4">
                            <span className="sr-only">Loading payouts...</span>
                            <TableSkeleton rows={8} columns={9} className="border-0" />
                          </td>
                        </tr>
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                            No delivered orders in this payout cycle.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((r) => (
                          <tr key={`${r.orderId}-${r.sellerId}-${r.currency}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-[11px] font-bold text-blue-700 whitespace-nowrap">
                              {r.cycleCode}
                            </td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {new Date(r.orderDate).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-700">
                              {r.orderNumber}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-gray-800">{r.sellerName}</div>
                              {r.sellerEmail && (
                                <div className="text-[11px] text-gray-500">{r.sellerEmail}</div>
                              )}
                              <div className="text-[10px] text-gray-400">
                                {r.itemCount} item{r.itemCount === 1 ? '' : 's'}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                                {r.orderStatus.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {r.payoutStatus === 'paid' ? (
                                r.isStale ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700" title="Late delivery arrived after this cycle was processed — reprocess to settle the difference.">
                                    <AlertCircle size={11} /> STALE
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    <CheckCircle2 size={11} /> PAID
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                  PENDING
                                </span>
                              )}
                              {r.paidAt && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {new Date(r.paidAt).toLocaleDateString()}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                              {fmtNative(r.totalAmount, r.currency)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-rose-600 whitespace-nowrap">
                              {fmtNative(r.platformCharge, r.currency)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-600 whitespace-nowrap">
                              {fmtNative(r.netPayout, r.currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {/* ───── Process Payout modal ───── */}
          {spModalOpen && (() => {
            const bucket = spPendingBuckets.get(spModalSellerKey);
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
                  <div className="border-b px-5 py-3 flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-900">Process Seller Payout</h3>
                    <button
                      type="button"
                      onClick={() => !spProcessing && setSpModalOpen(false)}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
                      disabled={spProcessing}
                    >
                      <XCircle size={20} />
                    </button>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="text-[11px] font-semibold uppercase text-gray-500">Seller</label>
                      <select
                        value={spModalSellerKey}
                        onChange={(e) => setSpModalSellerKey(e.target.value)}
                        disabled={spProcessing}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        {Array.from(spPendingBuckets.entries()).map(([key, b]) => (
                          <option key={key} value={key}>
                            {b.sellerName} ({b.orders.size} order{b.orders.size === 1 ? '' : 's'}, {b.currency})
                          </option>
                        ))}
                      </select>
                    </div>

                    {bucket && (
                      <div className="rounded-lg border bg-gray-50 p-3 space-y-1 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Cycle</span>
                          <span className="font-mono font-bold text-blue-700">{bucket.cycleCode}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Orders</span>
                          <span>{bucket.orders.size}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Total</span>
                          <span>{formatCurrency(bucket.total, bucket.currency)}</span>
                        </div>
                        <div className="flex justify-between text-rose-600">
                          <span>Platform charge (9%)</span>
                          <span>−{formatCurrency(bucket.platform, bucket.currency)}</span>
                        </div>
                        <div className="border-t pt-1 mt-1 flex justify-between text-base font-bold text-emerald-700">
                          <span>NET TO PAY</span>
                          <span>{formatCurrency(bucket.net, bucket.currency)}</span>
                        </div>
                      </div>
                    )}

                    {spError && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{spError}</span>
                      </div>
                    )}

                    {/* Step 2: Online payment details */}
                    {spModalStep === 'online' && bucket && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
                        <div>
                          <label className="text-[11px] font-semibold uppercase text-gray-600">Online method</label>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setSpOnlineMethod('upi')}
                              disabled={spProcessing}
                              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                                spOnlineMethod === 'upi'
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-400'
                              }`}
                            >
                              UPI
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpOnlineMethod('account_transfer')}
                              disabled={spProcessing}
                              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                                spOnlineMethod === 'account_transfer'
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-400'
                              }`}
                            >
                              Account Transfer
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold uppercase text-gray-600">
                            Transaction ID
                          </label>
                          <input
                            type="text"
                            value={spTxnId}
                            onChange={(e) => setSpTxnId(e.target.value)}
                            placeholder={spOnlineMethod === 'upi' ? 'UPI ref no.' : 'Bank reference / UTR'}
                            disabled={spProcessing}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={spIsPartial}
                              onChange={(e) => setSpIsPartial(e.target.checked)}
                              disabled={spProcessing}
                              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="font-semibold">Partial payment</span>
                          </label>
                          {spIsPartial && (
                            <div className="mt-2">
                              <label className="text-[11px] font-semibold uppercase text-gray-600">
                                Amount paid ({bucket.currency}) &mdash; must be &lt; {formatCurrency(bucket.net, bucket.currency)}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={spPartialAmount}
                                onChange={(e) => setSpPartialAmount(e.target.value)}
                                placeholder="0.00"
                                disabled={spProcessing}
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t px-5 py-3 flex flex-col sm:flex-row gap-2">
                    {spModalStep === 'choose' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleProcessPayoutSubmit('stripe')}
                          disabled={spProcessing || !bucket}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {spProcessing ? 'Processing…' : 'Pay via Stripe'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSpError(null); setSpModalStep('online'); }}
                          disabled={spProcessing || !bucket}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Pay Online
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { setSpError(null); setSpModalStep('choose'); }}
                          disabled={spProcessing}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleProcessPayoutSubmit('online')}
                          disabled={spProcessing || !bucket || !spTxnId.trim() || (spIsPartial && !spPartialAmount)}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {spProcessing ? 'Submitting…' : 'Submit Payment'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

export default AccountsManagement;
