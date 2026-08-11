import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, LogOut, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { SUPPORTED_CURRENCIES, fetchExchangeRates } from '../../../utils/currency';
import { logger } from '../../../utils/logger';
import { formatFrontend12DigitId } from '../../../utils/idFormatter';

interface AdminHeaderProps {
  adminName: string;
  adminId: string;
  onMenuToggle?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ adminName, adminId, onMenuToggle }) => {
    const displayAdminId = formatFrontend12DigitId(adminId || '');

  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { currency, setCurrency, loading: currencyLoading, switchingCurrency, rates } = useCurrency();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);
  const [localSwitching, setLocalSwitching] = useState(false);
  const prevCurrencyRef = useRef(currency);

  const handleCurrencyChange = async (newCurrency: string) => {
    if (newCurrency === currency || ratesFailed) return;
    prevCurrencyRef.current = currency;

    // If rates are already loaded, switch immediately
    if (rates && Object.keys(rates).length > 0) {
      setCurrency(newCurrency);
      return;
    }

    // Rates not yet available — try fetching up to 2 times before giving up
    setLocalSwitching(true);
    let fetchedRates: Record<string, number> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fetchedRates = await fetchExchangeRates();
        if (fetchedRates && Object.keys(fetchedRates).length > 0) break;
      } catch (err) {
        logger.error(err as Error, { context: `Admin currency rate fetch attempt ${attempt + 1}` });
      }
    }
    setLocalSwitching(false);

    if (!fetchedRates || Object.keys(fetchedRates).length === 0) {
      // Both retries failed — revert to previous currency and permanently disable the selector
      setRatesFailed(true);
      return;
    }

    setCurrency(newCurrency);
  };

  const isCurrencyBusy = currencyLoading || switchingCurrency || localSwitching;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setStatusMessage(null);
    setStatusType(null);
    try {
      await signOut();
      setStatusType('success');
      setStatusMessage('Logged out successfully. Redirecting...');
      setTimeout(() => {
        setShowLogoutDialog(false);
        navigate('/seller/login');
      }, 600);
    } catch (error) {
      logger.error(error as Error, { context: 'Admin logout error' });
      setStatusType('error');
      setStatusMessage('Failed to logout. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCancel = () => {
    setIsCanceling(true);
    setStatusMessage(null);
    setStatusType(null);
    setTimeout(() => {
      setShowLogoutDialog(false);
      setIsCanceling(false);
    }, 400);
  };

  return (
    <>
      <header data-native-shrink="admin-header" className="fixed top-0 left-0 right-0 z-40 flex min-h-16 items-center justify-between bg-gradient-to-r from-[#2bb0f3] to-[#1565d8] px-3 text-white shadow-lg sm:px-6">
        {/* Left: Hamburger Menu */}
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 transition-colors hover:bg-white/15 lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu size={24} />
        </button>

        {/* Center: Logo/Title */}
        <div className="min-w-0 flex-1 px-2 text-left sm:px-4 sm:text-center">
          <h1 className="truncate text-base font-bold tracking-normal sm:text-xl sm:tracking-wide">
            <span className="sm:hidden">BZEAD Admin</span>
            <span className="hidden sm:inline">BZEAD - Admin Panel</span>
          </h1>
        </div>

        {/* Right: Admin Info & Logout */}
        <div className="flex items-center gap-2 sm:gap-6">
          <div className="hidden sm:flex flex-col text-right text-sm">
            <span className="font-semibold">{adminName}</span>
            <span className="text-blue-100 text-xs font-mono">{displayAdminId}</span>
          </div>

          {/* Currency Selector */}
          <div className="relative flex items-center">
            <select
              value={currency}
              onChange={(e) => { void handleCurrencyChange(e.target.value); }}
              disabled={isCurrencyBusy || ratesFailed}
              title={ratesFailed ? 'Exchange rate unavailable — currency switching disabled' : undefined}
              className={`h-8 w-24 appearance-none rounded-lg border border-blue-300 bg-white px-2 py-1 pr-7 text-xs font-semibold text-slate-900 transition-all sm:min-w-[90px] sm:w-auto ${
                isCurrencyBusy || ratesFailed
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:border-blue-100 cursor-pointer'
              }`}
            >
              {SUPPORTED_CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code}>{curr.symbol} {curr.code}</option>
              ))}
            </select>
            {isCurrencyBusy && (
              <Loader2 className="absolute right-1.5 top-1.5 h-4 w-4 text-slate-600 animate-spin pointer-events-none" />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setStatusMessage(null);
              setStatusType(null);
              setShowLogoutDialog(true);
            }}
            data-no-global-confirm="true"
            className="rounded-lg p-2 transition-colors hover:bg-white/15"
            aria-label="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Logout Confirmation Dialog */}
      {showLogoutDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Confirm Logout</h2>
              <button
                type="button"
                onClick={handleCancel}
                data-no-global-confirm="true"
                className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                disabled={isLoggingOut || isCanceling}
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-gray-600 mb-6">Are you sure you want to logout?</p>

            {statusMessage && (
              <div
                className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${
                  statusType === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {statusMessage}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                data-no-global-confirm="true"
                disabled={isLoggingOut || isCanceling}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isCanceling ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Canceling...
                  </span>
                ) : (
                  'Cancel'
                )}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                data-no-global-confirm="true"
                disabled={isLoggingOut || isCanceling}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Logging out...
                  </>
                ) : (
                  'Logout'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminHeader;
