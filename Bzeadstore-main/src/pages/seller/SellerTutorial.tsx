/**
 * SellerTutorial.tsx
 * ------------------
 * Step-by-step onboarding tutorial page with progress tracking.
 * Wired to real seller data: KYC status, products, orders, bank details, wallet.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Check, Lock, ArrowRight, ChevronLeft } from 'lucide-react';
import { PageSkeleton } from '../../components/common/Skeleton';
import { getSellerKYCStatus } from '../../lib/kycService';
import { fetchOrdersBySeller, fetchSellerProfile, fetchSellerBankDetails } from '../../lib/orderService';
import { supabase } from '../../lib/supabase';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'locked';
  link?: string;
}

// Module-level cache keyed by sellerId — survives unmounts so revisits render instantly
// while a silent background refresh updates the cache.
const sellerTutorialCache: Record<string, TutorialStep[]> = {};

const SellerTutorial: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const navigate = useNavigate();
  const sellerId = user?.id || currentAuthUser?.userId || '';

  const [loading, setLoading] = useState(() => !(sellerId && sellerTutorialCache[sellerId]));
  const [steps, setSteps] = useState<TutorialStep[]>(() => (sellerId && sellerTutorialCache[sellerId]) || []);

  useEffect(() => {
    if (sellerId) loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const loadProgress = async () => {
    try {
      const hasCache = !!sellerTutorialCache[sellerId];
      if (!hasCache) setLoading(true);

      // Fetch all necessary data in parallel
      const [kycRes, ordersRes, profileRes, bankRes, productsRes] = await Promise.all([
        getSellerKYCStatus(sellerId),
        fetchOrdersBySeller(sellerId, { limit: 5 }),
        fetchSellerProfile(sellerId),
        fetchSellerBankDetails(sellerId),
        supabase.from('products').select('id').eq('seller_id', sellerId).limit(1),
      ]);

      const kycApproved = kycRes.kycData?.kyc_status === 'approved';
      const hasProducts = (productsRes.data?.length || 0) > 0;
      const orders = ordersRes.data || [];
      const hasOrders = orders.length > 0;
      const hasDelivered = orders.some((o: any) => o.status === 'delivered');
      const hasBankDetails = !!bankRes.data?.account_number;
      const hasPickupLocation = !!profileRes.data?.shop_address;

      // Check withdrawals
      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('id')
        .eq('seller_id', sellerId)
        .limit(1);
      const hasWithdrawal = (withdrawals?.length || 0) > 0;

      // Check promotions
      const { data: promotions } = await supabase
        .from('seller_promotions')
        .select('id')
        .eq('seller_id', sellerId)
        .limit(1);
      const hasPromotion = (promotions?.length || 0) > 0;

      // Build steps array based on real data
      const stepDefs: { id: string; title: string; description: string; done: boolean; link: string }[] = [
        { id: 'account', title: 'Account Setup', description: 'Create your seller account and verify email', done: true, link: '/seller/dashboard#profile' },
        { id: 'kyc', title: 'KYC Verification', description: 'Submit identity documents for verification', done: kycApproved, link: '/seller/dashboard' },
        { id: 'product', title: 'List First Product', description: 'Create your first product listing with images', done: hasProducts, link: '/seller/products' },
        { id: 'shipping', title: 'Set Up Shipping', description: 'Configure warehouse and shipping preferences', done: hasPickupLocation, link: '/seller/warehouse' },
        { id: 'order', title: 'Process First Order', description: 'Accept and fulfill your first customer order', done: hasOrders && hasDelivered, link: '/seller/orders' },
        { id: 'bank', title: 'Set Up Bank Account', description: 'Link bank account for receiving payouts', done: hasBankDetails, link: '/seller/dashboard#profile' },
        { id: 'withdrawal', title: 'First Withdrawal', description: 'Withdraw your first earnings to bank', done: hasWithdrawal, link: '/seller/wallet' },
        { id: 'promotion', title: 'Add Promotions', description: 'Create your first sale or coupon offer', done: hasPromotion, link: '/seller/products' },
      ];

      // Determine status for each step
      let foundCurrent = false;
      const builtSteps: TutorialStep[] = stepDefs.map((s) => {
        if (s.done) {
          return { id: s.id, title: s.title, description: s.description, status: 'completed' as const, link: s.link };
        }
        if (!foundCurrent) {
          foundCurrent = true;
          return { id: s.id, title: s.title, description: s.description, status: 'current' as const, link: s.link };
        }
        return { id: s.id, title: s.title, description: s.description, status: 'locked' as const, link: s.link };
      });

      setSteps(builtSteps);
      if (sellerId) sellerTutorialCache[sellerId] = builtSteps;
    } catch (err) {
      console.error('Tutorial: error loading progress', err);
      setSteps([
        { id: 'account', title: 'Account Setup', description: 'Create your seller account and verify email', status: 'completed' },
        { id: 'kyc', title: 'KYC Verification', description: 'Submit identity documents for verification', status: 'current', link: '/seller/dashboard' },
        { id: 'product', title: 'List First Product', description: 'Create your first product listing with images', status: 'locked' },
        { id: 'shipping', title: 'Set Up Shipping', description: 'Configure warehouse and shipping preferences', status: 'locked' },
        { id: 'order', title: 'Process First Order', description: 'Accept and fulfill your first customer order', status: 'locked' },
        { id: 'bank', title: 'Set Up Bank Account', description: 'Link bank account for receiving payouts', status: 'locked' },
        { id: 'withdrawal', title: 'First Withdrawal', description: 'Withdraw your first earnings to bank', status: 'locked' },
        { id: 'promotion', title: 'Add Promotions', description: 'Create your first sale or coupon offer', status: 'locked' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  if (loading) {
    return <PageSkeleton variant="plain" />;
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="rounded-2xl text-white h-14 flex items-center px-4 sm:px-6 gap-2.5" style={{ background: 'linear-gradient(90deg, #0f172a 0%, #1e3a5f 100%)' }}>
        <button
          onClick={() => navigate('/seller/dashboard')}
          className="lg:hidden p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          aria-label="Back to dashboard"
        >
          <ChevronLeft size={16} />
        </button>
        <GraduationCap size={16} className="text-amber-400" />
        <h2 className="text-sm font-bold">Seller Tutorial</h2>
      </div>

      {/* Progress Card */}
      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' }}>
        <p className="text-xs font-semibold text-white/80">Your Progress</p>
        <p className="text-2xl font-bold mt-1">{completedCount} of {totalSteps} completed</p>
        <div className="w-full bg-white/20 rounded-full h-2 mt-3">
          <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="text-[10px] text-white/70 mt-2">Complete all steps to unlock priority seller badge</p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          if (step.status === 'completed') {
            return (
              <div key={step.id} className="bg-white border border-green-200 rounded-xl p-3.5 flex gap-3 items-start">
                <div className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                  <Check size={14} className="text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-900">{step.title}</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">{step.description}</p>
                  <span className="text-[10px] text-green-600 font-semibold mt-1.5 inline-flex items-center gap-1">
                    <Check size={10} /> Completed
                  </span>
                </div>
              </div>
            );
          }

          if (step.status === 'current') {
            return (
              <div key={step.id} className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3.5 flex gap-3 items-start">
                <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30">
                  <span className="text-white text-xs font-bold">{index + 1}</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-900">{step.title}</h4>
                  <p className="text-[11px] text-gray-600 mt-0.5">{step.description}</p>
                  {step.link && (
                    <button
                      onClick={() => navigate(step.link!)}
                      className="mt-2 bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-all inline-flex items-center gap-1"
                    >
                      Start Now <ArrowRight size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // Locked
          return (
            <div key={step.id} className="bg-white border border-gray-200 rounded-xl p-3.5 flex gap-3 items-start opacity-60">
              <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                <Lock size={12} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-gray-500">{step.title}</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SellerTutorial;
