import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '../../utils/logger';
import { useAuth } from '../../contexts/AuthContext';
import { 
  DollarSign,
  TrendingUp, TrendingDown, 
  Download, AlertCircle, 
  CheckCircle, Clock, ArrowUpRight, ArrowDownRight,
  Wallet, RefreshCw, Search, Loader2, X
  , ChevronLeft
} from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import { Skeleton, ListSkeleton } from '../../components/common/Skeleton';
import { supabase } from '../../lib/supabase';
import { useSellerDisplayCurrency } from '../../hooks/useSellerDisplayCurrency';
import {
  fetchSellerSettlementOrders,
  calculateSettlementSummary,
  createWithdrawal,
  fetchWithdrawals,
  fetchSellerBankDetails,
  getSellerWalletBalance,
  fetchWalletTransactions,
} from '../../lib/orderService';
import { getSellerManualPayouts, getPaymentModes } from '../../lib/adminService';
import type { PaymentMode } from '../../types';
import type { SellerNotificationNavState } from '../../lib/sellerNotificationNavigation';

interface WithdrawalRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  bank_details: Record<string, any> | null;
  notes: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SettlementOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  product_subtotal: number;
  platform_fee: number;
  seller_earning: number;
  settlement_cycle: string;
  settlement_status: string;
  total_amount: number;
  currency?: string;
  // Locked seller-currency snapshot columns (added by 20260520120000 migration)
  seller_currency?: string;
  buyer_to_seller_fx_rate?: number;
  seller_items_subtotal?: number;
  seller_payout_total?: number;
  platform_markup_total_inr?: number;
}

interface Transaction {
  id: string;
  date: string;
  orderId: string;
  type: 'credit' | 'debit' | 'refund' | 'commission' | 'withdrawal';
  description: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  balance: number;
}

interface SellerWalletProps {
  onNavigate: (view: any) => void;
}

/** Minimum withdrawal amount in seller's currency */
const MIN_WITHDRAWAL = 100;

// Module-level cache keyed by sellerId — survives unmounts so revisits render instantly
// while a silent background refresh updates the cache.
interface WalletCacheEntry {
  settlementOrders: SettlementOrder[];
  withdrawalRecords: WithdrawalRecord[];
  bankDetails: { bank_holder_name?: string; account_number?: string; ifsc_code?: string; account_type?: string } | null;
  walletBalance: { available: number; pending: number; withdrawn: number; totalEarnings: number };
  walletTransactions: any[];
  sellerPayouts: any[];
  commissionPercent: number | null;
  paymentModes: PaymentMode[];
}
const sellerWalletCache: Record<string, WalletCacheEntry> = {};

const SellerWallet: React.FC<SellerWalletProps> = ({ onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const handledNotificationNav = useRef<string | null>(null);
  const { user, currentAuthUser } = useAuth();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const { sellerCurrency, convertToSellerCurrency, formatSellerAmount } = useSellerDisplayCurrency(sellerId);
  const cachedEntry = sellerId ? sellerWalletCache[sellerId] : undefined;
  const [activeFilter, setActiveFilter] = useState<'all' | 'credit' | 'debit' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('primary');
  const [settlementOrders, setSettlementOrders] = useState<SettlementOrder[]>(() => cachedEntry?.settlementOrders || []);
  const [loading, setLoading] = useState(() => !cachedEntry);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawalRecords, setWithdrawalRecords] = useState<WithdrawalRecord[]>(() => cachedEntry?.withdrawalRecords || []);
  const [bankDetails, setBankDetails] = useState<{ bank_holder_name?: string; account_number?: string; ifsc_code?: string; account_type?: string } | null>(() => cachedEntry?.bankDetails || null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedCycle, setSelectedCycle] = useState<string>('all');
  const [walletBalance, setWalletBalance] = useState<{
    available: number; pending: number; withdrawn: number; totalEarnings: number;
  }>(() => cachedEntry?.walletBalance || { available: 0, pending: 0, withdrawn: 0, totalEarnings: 0 });
  const [walletTransactions, setWalletTransactions] = useState<any[]>(() => cachedEntry?.walletTransactions || []);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'withdrawals' | 'payouts'>('transactions');
  const [, setCommissionPercent] = useState<number | null>(() => cachedEntry?.commissionPercent ?? null);
  const [sellerPayouts, setSellerPayouts] = useState<any[]>(() => cachedEntry?.sellerPayouts || []);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>(() => cachedEntry?.paymentModes || []);

  // Resolve the seller's currency from their country
  const currencySymbol = SUPPORTED_CURRENCIES.find(c => c.code === sellerCurrency)?.symbol || sellerCurrency || '';

  // Format amount from INR to seller-country currency
  const fmtPrice = (amount: number, sourceCurrency: string = 'INR') => formatSellerAmount(amount, sourceCurrency);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const nav = location.state as SellerNotificationNavState | null;
    if (!nav?.fromNotification) return;
    if (nav.notificationId === handledNotificationNav.current) return;
    if (nav.walletTab) setActiveTab(nav.walletTab);
    handledNotificationNav.current = nav.notificationId;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // Fetch wallet data from ledger + settlement orders from DB
  const fetchWalletData = useCallback(async (isRefresh = false) => {
    try {
      const sellerId = user?.id || currentAuthUser?.userId || '';
      const hasCache = !!sellerId && !!sellerWalletCache[sellerId];
      if (isRefresh) {
        setRefreshing(true);
      } else if (!hasCache) {
        setLoading(true);
      }
      setError(null);

        if (!sellerId) {
          setError('Failed to load wallet data. Please sign in again.');
          return;
        }

        const [ordersRes, withdrawalsRes, bankRes, balanceRes, txnRes, payoutsRes] = await Promise.all([
          fetchSellerSettlementOrders(sellerId),
          fetchWithdrawals(sellerId),
          fetchSellerBankDetails(sellerId),
          getSellerWalletBalance(sellerId),
          fetchWalletTransactions(sellerId),
          getSellerManualPayouts(sellerId),
        ]);

        if (ordersRes.error) {
          setError('Failed to load wallet data. Please try again.');
        } else {
          setSettlementOrders(ordersRes.data as SettlementOrder[]);
        }

        if (!withdrawalsRes.error) {
          setWithdrawalRecords(withdrawalsRes.data);
        }

        if (!bankRes.error && bankRes.data) {
          setBankDetails(bankRes.data);
        }

        // Ledger-based wallet balance (source of truth)
        if (!balanceRes.error && balanceRes.data) {
          const b = balanceRes.data as any;
          // Compute actual withdrawals from ledger (exclude refund debits)
          const withdrawalTotal = (txnRes.data || []).reduce((sum: number, t: any) =>
            t.type === 'debit' && t.source === 'withdrawal' ? sum + Number(t.amount || 0) : sum, 0);
          setWalletBalance({
            available: Number(b.available_balance || 0),
            pending: Number(b.pending_orders || 0),
            withdrawn: withdrawalTotal,
            totalEarnings: Number(b.total_earnings || 0),
          });
        }

        if (!txnRes.error) {
          setWalletTransactions(txnRes.data);
        }

        setSellerPayouts(payoutsRes.payouts || []);

        // Fetch payment modes from DB
        const modesRes = await getPaymentModes();
        if (modesRes.modes) setPaymentModes(modesRes.modes);

        // Fetch active commission rate from platform_commission_rules
        const { data: commissionRule } = await supabase
          .from('platform_commission_rules')
          .select('charge_percent')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (commissionRule?.charge_percent != null) {
          setCommissionPercent(Number(commissionRule.charge_percent));
        }

        // Persist to module cache so revisits render instantly without flicker.
        sellerWalletCache[sellerId] = {
          settlementOrders: (ordersRes.error ? [] : (ordersRes.data as SettlementOrder[])) || [],
          withdrawalRecords: withdrawalsRes.error ? [] : (withdrawalsRes.data || []),
          bankDetails: !bankRes.error && bankRes.data ? bankRes.data : null,
          walletBalance: !balanceRes.error && balanceRes.data ? {
            available: Number((balanceRes.data as any).available_balance || 0),
            pending: Number((balanceRes.data as any).pending_orders || 0),
            withdrawn: (txnRes.data || []).reduce((sum: number, t: any) =>
              t.type === 'debit' && t.source === 'withdrawal' ? sum + Number(t.amount || 0) : sum, 0),
            totalEarnings: Number((balanceRes.data as any).total_earnings || 0),
          } : { available: 0, pending: 0, withdrawn: 0, totalEarnings: 0 },
          walletTransactions: txnRes.error ? [] : (txnRes.data || []),
          sellerPayouts: payoutsRes.payouts || [],
          commissionPercent: commissionRule?.charge_percent != null ? Number(commissionRule.charge_percent) : null,
          paymentModes: modesRes.modes || [],
        };
      } catch (err) {
        logger.error('Failed to fetch wallet data:', err as Record<string, any>);
        setError('Failed to load wallet data. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
  }, [user?.id, currentAuthUser?.userId]);

  useEffect(() => {
    if (user?.id || currentAuthUser?.userId) {
      fetchWalletData();
    }
  }, [fetchWalletData]);

  // Settlement summary from DB columns
  const summary = calculateSettlementSummary(settlementOrders);

  // walletBalance is now set from ledger RPC in useEffect — no frontend calculation

  // Filter orders by selected cycle
  const filteredOrders = selectedCycle === 'all'
    ? settlementOrders.filter((o) => o.status !== 'cancelled' && o.status !== 'returned' && o.status !== 'refunded')
    : settlementOrders.filter((o) => o.settlement_cycle === selectedCycle && o.status !== 'cancelled' && o.status !== 'returned' && o.status !== 'refunded');

  // Transaction history from REAL wallet ledger (source of truth)
  const generateTransactions = (): Transaction[] => {
    const transactions: Transaction[] = [];
    let runningBalance = 0;

    // Real ledger transactions (credits/debits from DB triggers)
    walletTransactions.forEach((txn: any) => {
      const amount = Number(txn.amount || 0);
      const orderNumber = txn.orders?.order_number || txn.order_id?.slice(0, 8) || '—';

      if (txn.type === 'credit') {
        runningBalance += amount;
        transactions.push({
          id: txn.id,
          date: new Date(txn.created_at).toLocaleString(),
          orderId: orderNumber,
          type: 'credit',
          description: txn.source === 'order' ? `Order delivered – ${orderNumber}` : `Credit – ${txn.source}`,
          amount,
          status: 'completed',
          balance: runningBalance,
        });
      } else {
        runningBalance -= amount;
        const txType: Transaction['type'] = txn.source === 'withdrawal' ? 'withdrawal' : 'refund';
        transactions.push({
          id: txn.id,
          date: new Date(txn.created_at).toLocaleString(),
          orderId: orderNumber,
          type: txType,
          description: txn.source === 'withdrawal'
            ? 'Withdrawal to bank account'
            : txn.source === 'refund'
              ? `Order refund – ${orderNumber}`
              : `Debit – ${txn.source}`,
          amount: -amount,
          status: 'completed',
          balance: runningBalance,
        });
      }
    });

    // Also show pending orders (not yet in ledger) — read locked seller-currency payout
    settlementOrders.forEach((order) => {
      const earning = Number((order as any).seller_payout_total ?? order.seller_earning ?? 0);
      if (!earning) return;
      if (order.status === 'delivered' || order.status === 'cancelled' || order.status === 'returned' || order.status === 'refunded') return;

      transactions.push({
        id: `${order.id}-pending`,
        date: new Date(order.created_at).toLocaleString(),
        orderId: order.order_number,
        type: 'credit',
        description: `Order in processing – ${order.order_number}`,
        amount: earning,
        status: 'pending',
        balance: runningBalance,
      });
    });

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return transactions;
  };

  const transactions = generateTransactions();

  const filteredTransactions = transactions.filter(txn => {
    const matchesFilter = 
      activeFilter === 'all' ||
      (activeFilter === 'credit' && (txn.type === 'credit')) ||
      (activeFilter === 'debit' && (txn.type === 'debit' || txn.type === 'commission' || txn.type === 'withdrawal' || txn.type === 'refund')) ||
      (activeFilter === 'pending' && txn.status === 'pending');
    
    const matchesSearch = 
      txn.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const availableDisplayBalance = convertToSellerCurrency(walletBalance.available, 'INR');


  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amount) || amount <= 0) {
      setToast({ type: 'error', message: 'Please enter a valid withdrawal amount.' });
      return;
    }
    if (amount < MIN_WITHDRAWAL) {
      setToast({ type: 'error', message: `Minimum withdrawal amount is ${currencySymbol}${MIN_WITHDRAWAL}.` });
      return;
    }
    if (amount > availableDisplayBalance) {
      setToast({ type: 'error', message: 'Withdrawal amount exceeds available balance.' });
      return;
    }
    if (!bankDetails?.account_number) {
      setToast({ type: 'error', message: 'No bank account on file. Please complete KYC verification to add your bank details.' });
      return;
    }

    try {
      setWithdrawing(true);
      const sellerId = user?.id || currentAuthUser?.userId || '';
      if (!sellerId) {
        setToast({ type: 'error', message: 'Please sign in again.' });
        return;
      }
      
      const { data: withdrawal, error: wError } = await createWithdrawal(
        sellerId,
        Math.floor(parseFloat(withdrawAmount) * 100) / 100,
        sellerCurrency || 'INR',
        bankDetails ? {
          bank_holder_name: bankDetails.bank_holder_name,
          account_number: bankDetails.account_number,
          ifsc_code: bankDetails.ifsc_code,
        } : undefined
      );

      if (wError || !withdrawal) {
        // Show specific error from backend (e.g. INSUFFICIENT BALANCE)
        const msg = String(wError || 'Unknown error');
        setToast({ type: 'error', message: 'Withdrawal failed: ' + (msg.includes('INSUFFICIENT') ? 'Insufficient balance' : msg) });
      } else {
        logger.log('Withdrawal successful', withdrawal);
        // Refresh all wallet data (balance + transactions + withdrawals)
        await fetchWalletData(true);
        setToast({ type: 'success', message: 'Withdrawal request submitted successfully! Funds typically arrive within 1-2 business days.' });
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        setActiveTab('withdrawals'); // Switch to withdrawals tab to show the new record
      }
    } catch (err) {
      logger.error('Withdrawal error:', err as Record<string, any>);
      setToast({ type: 'error', message: 'Failed to process withdrawal. Please try again.' });
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDownloadStatement = () => {
    const rows = [
      ['Date', 'Order ID', 'Type', 'Description', 'Amount', 'Status', 'Balance'],
      ...filteredTransactions.map(t => [
        t.date, t.orderId, t.type, t.description, t.amount.toString(), t.status, t.balance.toString()
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-statement-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const paginatedTransactions = filteredTransactions.slice(0, visibleCount);

  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'credit':
        return <ArrowDownRight className="text-green-600" size={18} />;
      case 'debit':
      case 'commission':
      case 'withdrawal':
        return <ArrowUpRight className="text-red-600" size={18} />;
      case 'refund':
        return <RefreshCw className="text-orange-600" size={18} />;
      default:
        return <DollarSign className="text-gray-600" size={18} />;
    }
  };

  const getStatusBadge = (status: Transaction['status']) => {
    const badges = {
      pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-700', border: 'border-yellow-500/20', label: 'Pending' },
      completed: { bg: 'bg-green-500/10', text: 'text-green-700', border: 'border-green-500/20', label: 'Completed' },
      failed: { bg: 'bg-red-500/10', text: 'text-red-700', border: 'border-red-500/20', label: 'Failed' }
    };
    const badge = badges[status];
    return (
      <span className={`${badge.bg} ${badge.text} ${badge.border} border text-[11px] font-bold px-2 py-0.5 rounded uppercase`}>
        {badge.label}
      </span>
    );
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] max-w-sm w-full animate-in slide-in-from-right duration-300 ${
          toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        } text-white rounded-xl shadow-2xl p-4 flex items-start gap-3`}>
          <div className="flex-shrink-0 mt-0.5">
            {toast.type === 'success' ? <CheckCircle size={18} /> : toast.type === 'error' ? <AlertCircle size={18} /> : <AlertCircle size={18} />}
          </div>
          <p className="text-sm font-medium flex-1">{toast.message}</p>
          <button onClick={() => setToast(null)} className="text-white/80 hover:text-white flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

          {/* Header */}
          <div className="flex flex-row md:flex-row justify-between items-center md:items-center gap-2 md:gap-6 mb-4 sm:mb-8">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                <button
                  onClick={() => onNavigate('seller-dashboard')}
                  className="lg:hidden p-1.5 sm:p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
                  aria-label="Back to dashboard"
                >
                  <ChevronLeft size={16} />
                </button>
                <h2 className="text-base sm:text-2xl font-bold text-gray-900 truncate">Wallet & Payouts</h2>
              </div>
              <p className="hidden sm:block text-gray-600 text-sm font-medium mt-1">Manage your earnings and withdrawals</p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap flex-shrink-0">
              <button
                onClick={() => fetchWalletData(true)}
                disabled={refreshing || loading}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl transition-all text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2 disabled:opacity-50"
                title="Refresh wallet data"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={handleDownloadStatement}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-2.5 sm:px-6 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl transition-all text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2"
              >
                <Download size={14} /> <span className="hidden sm:inline">Download Statement</span><span className="sm:hidden">Statement</span>
              </button>
            </div>
          </div>

          {/* Balance Cards */}
          {loading ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5 sm:gap-6 mb-3 sm:mb-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl p-2 sm:p-6 h-16 sm:h-32 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5 sm:gap-6 mb-3 sm:mb-8">
              <BalanceCard
                label="Available Balance"
                amount={walletBalance.available}
                icon={<Wallet className="text-green-600" />}
                actionLabel="Withdraw"
                onAction={() => setShowWithdrawModal(true)}
                formatAmount={fmtPrice}
              />
              <BalanceCard
                label="Pending Balance"
                amount={walletBalance.pending}
                icon={<Clock className="text-yellow-600" />}
                description="Will be available after delivery"
                formatAmount={fmtPrice}
              />
              <BalanceCard
                label="Total Withdrawn"
                amount={walletBalance.withdrawn}
                icon={<ArrowUpRight className="text-blue-600" />}
                description="Lifetime withdrawals"
                formatAmount={fmtPrice}
              />
              <BalanceCard
                label="Total Earnings"
                amount={walletBalance.totalEarnings}
                icon={<TrendingUp className="text-purple-600" />}
                formatAmount={fmtPrice}
              />
            </div>
          )}

          {/* Wallet Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg sm:rounded-2xl p-2.5 sm:p-6 mb-3 sm:mb-8 flex items-start gap-2 sm:gap-4">
            <div className="w-6 h-6 sm:w-10 sm:h-10 bg-blue-600 rounded-md sm:rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="text-white" size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[11px] sm:text-sm font-bold text-blue-900 mb-0.5 sm:mb-1">Settlement Information</h4>
              <p className="text-[10px] sm:text-xs text-blue-700 leading-relaxed">
                2-cycle monthly settlement: <strong>Cycle 1</strong> (1st–15th, payout on 16th) and <strong>Cycle 2</strong> (16th–end of month, payout on 1st).
                Only <strong>delivered</strong> orders are eligible for settlement.
              </p>
            </div>
          </div>

          {/* Settlement Summary Cards */}
          {!loading && (
            <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl p-2.5 sm:p-6 mb-3 sm:mb-8">
              <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-2 sm:mb-4">Settlement Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-1.5 sm:gap-4">
                <div className="bg-gray-50 rounded-md sm:rounded-xl p-1.5 sm:p-4 text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Total Orders</p>
                  <p className="text-sm sm:text-xl font-bold text-gray-900">{summary.totalOrders}</p>
                </div>
                <div className="bg-gray-50 rounded-md sm:rounded-xl p-1.5 sm:p-4 text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Product Amt</p>
                  <p className="text-xs sm:text-xl font-bold text-gray-900 truncate">{fmtPrice(summary.totalProductSubtotal)}</p>
                </div>
                <div className="bg-gray-50 rounded-md sm:rounded-xl p-1.5 sm:p-4 text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Deduction</p>
                  <p className="text-xs sm:text-xl font-bold text-red-600 truncate">-{fmtPrice(summary.totalPlatformFee)}</p>
                </div>
                <div className="bg-gray-50 rounded-md sm:rounded-xl p-1.5 sm:p-4 text-center">
                  <p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Earnings</p>
                  <p className="text-xs sm:text-xl font-bold text-green-600 truncate">{fmtPrice(summary.totalSellerEarning)}</p>
                </div>
                <div className="bg-green-50 rounded-md sm:rounded-xl p-1.5 sm:p-4 text-center border border-green-200">
                  <p className="text-[8px] sm:text-[10px] font-bold text-green-700 uppercase tracking-wider mb-0.5">Settled</p>
                  <p className="text-xs sm:text-xl font-bold text-green-700 truncate">{fmtPrice(summary.completedEarning)}</p>
                </div>
                <div className="bg-yellow-50 rounded-md sm:rounded-xl p-1.5 sm:p-4 text-center border border-yellow-200">
                  <p className="text-[8px] sm:text-[10px] font-bold text-yellow-700 uppercase tracking-wider mb-0.5">Pending</p>
                  <p className="text-xs sm:text-xl font-bold text-yellow-700 truncate">{fmtPrice(summary.pendingEarning)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Cycle Filter + Order Breakdown Table */}
          {!loading && (
            <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl p-2.5 sm:p-6 mb-3 sm:mb-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2 sm:mb-4">
                <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider">Order Breakdown</h3>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedCycle('all')}
                    className={`px-2.5 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${selectedCycle === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >All</button>
                  <button
                    onClick={() => setSelectedCycle('CYCLE_1')}
                    className={`px-2.5 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${selectedCycle === 'CYCLE_1' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  ><span className="sm:hidden">Cycle 1</span><span className="hidden sm:inline">Cycle 1 (1st-15th)</span></button>
                  <button
                    onClick={() => setSelectedCycle('CYCLE_2')}
                    className={`px-2.5 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${selectedCycle === 'CYCLE_2' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  ><span className="sm:hidden">Cycle 2</span><span className="hidden sm:inline">Cycle 2 (16th-End)</span></button>
                </div>
              </div>
              {/* Mobile cards (order breakdown) */}
              <div className="md:hidden space-y-2">
                {filteredOrders.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-6">No orders found for this cycle</p>
                ) : (
                  filteredOrders.map((order) => {
                    const sub = Number((order as any).seller_items_subtotal ?? order.product_subtotal ?? 0);
                    const pay = Number((order as any).seller_payout_total ?? order.seller_earning ?? 0);
                    const fee = Math.max(0, sub - pay);
                    return (
                      <div key={order.id} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-xs font-mono font-bold text-blue-600 truncate">{order.order_number}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                              order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>{order.status}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">{order.settlement_cycle}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[10px] border-t border-gray-200 pt-2">
                          <div>
                            <p className="text-gray-500 uppercase font-semibold">Product</p>
                            <p className="font-bold text-gray-900 truncate">{fmtPrice(sub)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 uppercase font-semibold">Fee</p>
                            <p className="font-bold text-red-600 truncate">-{fmtPrice(fee)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 uppercase font-semibold">Earnings</p>
                            <p className="font-bold text-green-600 truncate">{fmtPrice(pay)}</p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                          <span className="text-[10px] text-gray-500 uppercase font-semibold">Settlement</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            order.settlement_status === 'completed' ? 'bg-green-100 text-green-700' :
                            order.settlement_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{order.settlement_status || '—'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {/* Desktop table (order breakdown) */}
              <div className="hidden md:block overflow-x-auto -mx-2.5 sm:mx-0">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Order ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Date</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Product Price</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Deduction</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Seller Earnings</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">Cycle</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">Settlement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">No orders found for this cycle</td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-xs font-mono font-bold text-blue-600">{order.order_number}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-gray-700">{new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${
                              order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                              order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>{order.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-bold text-gray-900">{fmtPrice(Number((order as any).seller_items_subtotal ?? order.product_subtotal ?? 0))}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(() => {
                              const sub = Number((order as any).seller_items_subtotal ?? order.product_subtotal ?? 0);
                              const pay = Number((order as any).seller_payout_total ?? order.seller_earning ?? 0);
                              const fee = Math.max(0, sub - pay);
                              return <p className="text-sm font-bold text-red-600">-{fmtPrice(fee)}</p>;
                            })()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-bold text-green-600">{fmtPrice(Number((order as any).seller_payout_total ?? order.seller_earning ?? 0))}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">{order.settlement_cycle}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${
                              order.settlement_status === 'completed' ? 'bg-green-100 text-green-700' :
                              order.settlement_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{order.settlement_status || '—'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab Switcher: Transactions / Withdrawal History / Payouts */}
          <div className="flex gap-1 mb-3 sm:mb-6 bg-gray-200 rounded-md sm:rounded-xl p-0.5 sm:p-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-2.5 sm:px-6 py-1.5 sm:py-2.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === 'transactions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="sm:hidden">Txns</span><span className="hidden sm:inline">Transaction History</span>
            </button>
            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`px-2.5 sm:px-6 py-1.5 sm:py-2.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'withdrawals' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="sm:hidden">Withdrawals</span><span className="hidden sm:inline">Withdrawal History</span>
              {withdrawalRecords.filter(w => w.status === 'pending' || w.status === 'processing').length > 0 && (
                <span className="w-4 h-4 sm:w-5 sm:h-5 bg-yellow-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center">
                  {withdrawalRecords.filter(w => w.status === 'pending' || w.status === 'processing').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('payouts')}
              className={`px-2.5 sm:px-6 py-1.5 sm:py-2.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'payouts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Payouts
              {sellerPayouts.length > 0 && (
                <span className="w-4 h-4 sm:w-5 sm:h-5 bg-green-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center">
                  {sellerPayouts.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'transactions' && (<>
          {/* Filters and Search */}
          <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl p-2.5 sm:p-6 mb-3 sm:mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-6">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                <input
                  type="text"
                  placeholder="Search by Order ID or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-md sm:rounded-xl pl-9 pr-3 py-2 sm:py-3 text-xs sm:text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex gap-1.5 flex-wrap">
                <FilterButton label="All" active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
                <FilterButton label="Credits" active={activeFilter === 'credit'} onClick={() => setActiveFilter('credit')} />
                <FilterButton label="Debits" active={activeFilter === 'debit'} onClick={() => setActiveFilter('debit')} />
                <FilterButton label="Pending" active={activeFilter === 'pending'} onClick={() => setActiveFilter('pending')} />
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          {error ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={24} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Error Loading Transactions</h3>
              <p className="text-gray-600 text-sm">{error}</p>
              <button
                onClick={() => fetchWalletData()}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-all"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl overflow-hidden">
              {/* Mobile cards (transactions) */}
              <div className="md:hidden p-2.5 space-y-2">
                {loading ? (
                  <ListSkeleton rows={5} withAvatar={false} />
                ) : filteredTransactions.length === 0 ? (
                  <div className="flex flex-col items-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                      <Wallet size={18} className="text-gray-500" />
                    </div>
                    <p className="text-gray-600 font-semibold text-xs">No transactions found</p>
                    <p className="text-gray-500 text-[10px] mt-0.5">Try adjusting your filters</p>
                  </div>
                ) : (
                  paginatedTransactions.map((txn) => (
                    <div key={txn.id} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                          {getTransactionIcon(txn.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{txn.description}</p>
                          <p className="text-[9px] text-gray-500 uppercase font-semibold mt-0.5">{txn.type.replace('-', ' ')} · {txn.date}</p>
                          {txn.orderId && <p className="text-[10px] font-mono font-bold text-blue-600 truncate mt-0.5">{txn.orderId}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{txn.amount > 0 ? '+' : ''}{fmtPrice(txn.amount)}</p>
                          <div className="mt-1">{getStatusBadge(txn.status)}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                        <span className="text-[9px] text-gray-500 uppercase font-semibold">Balance</span>
                        <span className="text-xs font-bold text-gray-900">{fmtPrice(txn.balance)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Desktop table (transactions) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Date & Time</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Transaction</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Order ID</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Amount</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      Array.from({ length: 6 }).map((_, r) => (
                        <tr key={r}>
                          {Array.from({ length: 6 }).map((_, c) => (
                            <td key={c} className="px-4 py-4">
                              <Skeleton rounded="sm" className={`h-3 ${c === 1 ? 'w-11/12' : 'w-2/3'}`} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                              <Wallet size={24} className="text-gray-500" />
                            </div>
                            <p className="text-gray-600 font-semibold">No transactions found</p>
                            <p className="text-gray-500 text-sm mt-1">Try adjusting your filters</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedTransactions.map((txn) => (
                        <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                                {getTransactionIcon(txn.type)}
                              </div>
                              <p className="text-xs font-semibold text-gray-700">{txn.date}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-gray-900">{txn.description}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">
                              {txn.type.replace('-', ' ')}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-mono font-bold text-blue-600">{txn.orderId}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className={`text-sm font-bold ${
                              txn.amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {txn.amount > 0 ? '+' : ''}{fmtPrice(txn.amount)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(txn.status)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-bold text-gray-900">{fmtPrice(txn.balance)}</p>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {filteredTransactions.length > visibleCount && (
            <div className="flex justify-center mt-4 sm:mt-8">
              <button
                onClick={() => setVisibleCount(prev => prev + 20)}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-4 sm:px-8 py-2 sm:py-3 rounded-md sm:rounded-xl transition-all text-[11px] sm:text-xs"
              >
                Load More ({filteredTransactions.length - visibleCount} remaining)
              </button>
            </div>
          )}
          </>)}

          {/* Withdrawal History Tab */}
          {activeTab === 'withdrawals' && (
            <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl overflow-hidden">
              <div className="p-3 sm:p-6 border-b border-gray-200">
                <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider">Withdrawal History</h3>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">Track the status of all your withdrawal requests</p>
              </div>
              {/* Mobile cards (withdrawals) */}
              <div className="md:hidden p-2.5 space-y-2">
                {withdrawalRecords.length === 0 ? (
                  <div className="flex flex-col items-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2"><ArrowUpRight size={18} className="text-gray-500" /></div>
                    <p className="text-gray-600 font-semibold text-xs">No withdrawals yet</p>
                    <button onClick={() => setShowWithdrawModal(true)} className="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-1.5 rounded-lg transition-all text-[11px]">Request Withdrawal</button>
                  </div>
                ) : (
                  withdrawalRecords.map((w) => {
                    const statusStyles: Record<string, string> = {
                      pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
                      processing: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
                      completed: 'bg-green-500/10 text-green-700 border-green-500/20',
                      failed: 'bg-red-500/10 text-red-700 border-red-500/20',
                      cancelled: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
                    };
                    const bankInfo = w.bank_details as Record<string, any> | null;
                    return (
                      <div key={w.id} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">{fmtPrice(w.amount)}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{new Date(w.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {new Date(w.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <span className={`${statusStyles[w.status] || statusStyles.pending} border text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0`}>{w.status}</span>
                        </div>
                        {bankInfo?.account_number && (
                          <div className="border-t border-gray-200 pt-1.5">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Bank</p>
                            <p className="text-xs font-semibold text-gray-800 truncate">{bankInfo.bank_holder_name || '—'} · ••••{String(bankInfo.account_number).slice(-4)}</p>
                          </div>
                        )}
                        <div className="border-t border-gray-200 pt-1.5 mt-1.5 grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Processed</p>
                            <p className="text-[11px] text-gray-700">{w.processed_at ? new Date(w.processed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Notes</p>
                            <p className="text-[11px] text-gray-600 truncate">{w.notes || '—'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {/* Desktop table (withdrawals) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Date</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Amount</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Bank Account</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Processed</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {withdrawalRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                              <ArrowUpRight size={24} className="text-gray-500" />
                            </div>
                            <p className="text-gray-600 font-semibold">No withdrawals yet</p>
                            <p className="text-gray-500 text-sm mt-1">Your withdrawal requests will appear here</p>
                            <button
                              onClick={() => setShowWithdrawModal(true)}
                              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-xs"
                            >
                              Request Withdrawal
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      withdrawalRecords.map((w) => {
                        const statusStyles: Record<string, string> = {
                          pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
                          processing: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
                          completed: 'bg-green-500/10 text-green-700 border-green-500/20',
                          failed: 'bg-red-500/10 text-red-700 border-red-500/20',
                          cancelled: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
                        };
                        const bankInfo = w.bank_details as Record<string, any> | null;
                        return (
                          <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-xs font-semibold text-gray-700">
                                {new Date(w.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {new Date(w.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="text-sm font-bold text-gray-900">{fmtPrice(w.amount)}</p>
                            </td>
                            <td className="px-4 py-3">
                              {bankInfo?.account_number ? (
                                <div>
                                  <p className="text-xs font-semibold text-gray-800">{bankInfo.bank_holder_name || '—'}</p>
                                  <p className="text-[10px] text-gray-500">••••{String(bankInfo.account_number).slice(-4)}</p>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">—</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`${statusStyles[w.status] || statusStyles.pending} border text-[11px] font-bold px-2 py-0.5 rounded uppercase`}>
                                {w.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-600">
                                {w.processed_at
                                  ? new Date(w.processed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                  : '—'}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-500 max-w-[120px] sm:max-w-[200px] truncate">{w.notes || '—'}</p>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payouts' && (
            <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl overflow-hidden">
              <div className="p-3 sm:p-6 border-b border-gray-200">
                <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider">Payouts Received</h3>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">All manual payouts from the platform to your account</p>
              </div>
              {/* Mobile cards (payouts) */}
              <div className="md:hidden p-2.5 space-y-2">
                {sellerPayouts.length === 0 ? (
                  <div className="flex flex-col items-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2"><Wallet size={18} className="text-gray-500" /></div>
                    <p className="text-gray-600 font-semibold text-xs">No payouts received yet</p>
                  </div>
                ) : (
                  sellerPayouts.map((p: any) => (
                    <div key={p.id} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-green-700">{fmtPrice(p.amount)}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{new Date(p.payout_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">{p.cycle}</span>
                          <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-700 border border-green-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"><CheckCircle size={9} /> Paid</span>
                        </div>
                      </div>
                      <div className="border-t border-gray-200 pt-1.5 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-semibold">Mode</p>
                          <p className="text-[11px] text-gray-700 capitalize truncate">{paymentModes.find(m => m.code === p.mode_of_pay)?.label || p.mode_of_pay}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-500 uppercase font-semibold">Txn No</p>
                          <p className="text-[11px] font-mono text-gray-600 truncate">{p.transaction_no || '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Desktop table (payouts) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Cycle</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Date</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-600 uppercase tracking-widest">Amount</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Mode</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">Transaction No</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sellerPayouts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                              <Wallet size={24} className="text-gray-500" />
                            </div>
                            <p className="text-gray-600 font-semibold">No payouts received yet</p>
                            <p className="text-gray-500 text-sm mt-1">Platform payouts will appear here once processed</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sellerPayouts.map((p: any) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                              {p.cycle}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-semibold text-gray-700">
                              {new Date(p.payout_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-bold text-green-700">{fmtPrice(p.amount)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-gray-700 capitalize">
                              {paymentModes.find(m => m.code === p.mode_of_pay)?.label || p.mode_of_pay}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-mono text-gray-600">{p.transaction_no}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-700 border border-green-500/20 text-[11px] font-bold px-2 py-0.5 rounded uppercase">
                              <CheckCircle size={10} /> Paid
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl sm:rounded-3xl p-3 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 sm:mb-6">
              <h3 className="text-base sm:text-2xl font-bold text-gray-900">Withdraw Funds</h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                disabled={withdrawing}
                className="text-gray-500 hover:text-gray-600 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Available Balance Display */}
            <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg sm:rounded-2xl p-3 sm:p-6 mb-3 sm:mb-6 text-white">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider opacity-80 mb-1 sm:mb-2">Available Balance</p>
              <p className="text-lg sm:text-2xl font-bold">{fmtPrice(walletBalance.available)}</p>
            </div>

            {/* Withdrawal Amount */}
            <div className="mb-3 sm:mb-6">
              <label className="block text-[10px] sm:text-xs font-bold text-gray-700 mb-1 sm:mb-2 uppercase tracking-wider">Withdrawal Amount</label>
              <div className="relative">
                <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs sm:text-base">{currencySymbol}</span>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  disabled={withdrawing}
                  className="w-full bg-gray-50 border border-gray-200 rounded-md sm:rounded-xl pl-7 sm:pl-10 pr-3 py-2.5 sm:py-4 text-sm sm:text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="0.00"
                  max={availableDisplayBalance}
                  min={MIN_WITHDRAWAL}
                />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Minimum withdrawal: {currencySymbol}{MIN_WITHDRAWAL}</p>
              <div className="flex justify-between mt-2 sm:mt-3">
                <button
                  onClick={() => setWithdrawAmount((Math.floor(availableDisplayBalance * 25) / 100).toFixed(2))}
                  disabled={withdrawing}
                  className="text-[10px] sm:text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  25%
                </button>
                <button
                  onClick={() => setWithdrawAmount((Math.floor(availableDisplayBalance * 50) / 100).toFixed(2))}
                  disabled={withdrawing}
                  className="text-[10px] sm:text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  50%
                </button>
                <button
                  onClick={() => setWithdrawAmount((Math.floor(availableDisplayBalance * 75) / 100).toFixed(2))}
                  disabled={withdrawing}
                  className="text-[10px] sm:text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  75%
                </button>
                <button
                  onClick={() => setWithdrawAmount(availableDisplayBalance.toString())}
                  disabled={withdrawing}
                  className="text-[10px] sm:text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Bank Account Selection */}
            <div className="mb-3 sm:mb-6">
              <label className="block text-[10px] sm:text-xs font-bold text-gray-700 mb-1.5 sm:mb-3 uppercase tracking-wider">Withdraw To</label>
              <div className="space-y-2 sm:space-y-3">
                {bankDetails?.account_number ? (
                  <label className={`flex items-center gap-2 sm:gap-4 p-2.5 sm:p-4 border-2 rounded-md sm:rounded-xl cursor-pointer transition-all ${
                    selectedAccount === 'primary' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="account"
                      value="primary"
                      checked={selectedAccount === 'primary'}
                      onChange={(e) => setSelectedAccount(e.target.value)}
                      disabled={withdrawing}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <p className="text-xs sm:text-sm font-bold text-gray-900">{bankDetails.bank_holder_name || 'Bank Account'}</p>
                      <p className="text-[10px] sm:text-xs text-gray-600">
                        ••••  ••••  {bankDetails.account_number.slice(-4)}
                        {bankDetails.ifsc_code ? ` · ${bankDetails.ifsc_code}` : ''}
                      </p>
                    </div>
                    {selectedAccount === 'primary' && <CheckCircle size={16} className="text-blue-600" />}
                  </label>
                ) : (
                  <div className="p-2.5 sm:p-4 border-2 border-yellow-200 bg-yellow-50 rounded-md sm:rounded-xl">
                    <p className="text-xs sm:text-sm font-semibold text-yellow-800">No bank account on file</p>
                    <p className="text-[10px] sm:text-xs text-yellow-700 mt-0.5 sm:mt-1">Please complete KYC verification to add your bank details.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Processing Info */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-md sm:rounded-xl p-2.5 sm:p-4 mb-3 sm:mb-6">
              <div className="flex gap-2 sm:gap-3">
                <Clock className="text-yellow-600 flex-shrink-0" size={14} />
                <p className="text-[10px] sm:text-xs text-yellow-800 leading-relaxed">
                  Withdrawals are processed once daily at 6:00 PM. Funds typically reach your account within 1-2 business days.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => setShowWithdrawModal(false)}
                disabled={withdrawing}
                className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-3 sm:px-6 py-2 sm:py-3 rounded-md sm:rounded-xl transition-all text-xs sm:text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={
                  withdrawing ||
                  !withdrawAmount ||
                  parseFloat(withdrawAmount) > availableDisplayBalance ||
                  parseFloat(withdrawAmount) < MIN_WITHDRAWAL ||
                  parseFloat(withdrawAmount) <= 0 ||
                  !bankDetails?.account_number
                }
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 sm:px-6 py-2 sm:py-3 rounded-md sm:rounded-xl transition-all text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 sm:gap-2"
              >
                {withdrawing && <Loader2 size={14} className="animate-spin" />}
                <span className="sm:hidden">Request</span><span className="hidden sm:inline">Request Withdrawal</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const BalanceCard = ({ label, amount, icon, trend, trendUp, description, actionLabel, onAction, formatAmount }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg sm:rounded-2xl p-2 sm:p-6 hover:border-gray-300 transition-all">
    <div className="flex items-center justify-between mb-1.5 sm:mb-4">
      <div className="w-6 h-6 sm:w-12 sm:h-12 bg-gray-50 rounded-md sm:rounded-xl flex items-center justify-center">
        {icon}
      </div>
      {trend && (
        <span className={`flex items-center gap-1 text-[9px] sm:text-xs font-bold ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
          {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {trend}
        </span>
      )}
    </div>
    <p className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 sm:mb-2 truncate">{label}</p>
    <p className="text-xs sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 truncate">{formatAmount ? formatAmount(amount) : amount}</p>
    {description && <p className="hidden sm:block text-xs text-gray-600">{description}</p>}
    {actionLabel && (
      <button
        onClick={onAction}
        className="mt-1.5 sm:mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 sm:py-2.5 rounded-md sm:rounded-xl transition-all text-[10px] sm:text-xs"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const FilterButton = ({ label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex-1 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-md sm:rounded-xl font-bold text-[10px] sm:text-xs uppercase tracking-wider transition-all ${
      active
        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

export default SellerWallet;
