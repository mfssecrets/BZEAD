import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, CheckCircle, AlertCircle, ArrowLeft, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateEmail } from '../../utils/validation';
import { SellerAuthHeader } from './SellerAuthHeader';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { AuthCardHeader } from '../../components/auth/AuthCardHeader';

const SellerLogin: React.FC = () => {
  const { signIn, signOut, authRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [wrongRolePopup, setWrongRolePopup] = useState(false);

  // Redirect already-logged-in users away from seller login page
  useEffect(() => {
    if (authRole === 'seller') {
      navigate('/seller/dashboard', { replace: true });
    } else if (authRole === 'admin') {
      navigate('/admin', { replace: true });
    } else if (authRole === 'user') {
      navigate('/', { replace: true });
    }
  }, [authRole, navigate]);

  // Check for success message from password reset
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the state so message doesn't persist on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setIsLoading(false);
      return;
    }

    const result = await signIn(email.trim().toLowerCase(), password);

    if (!result.success || result.error) {
      // Better error messages
      const errorMessage = result.error?.message || '';
      if (errorMessage.includes('Incorrect username or password')) {
        setError('Invalid email or password. Please try again.');
      } else if (errorMessage.includes('User does not exist')) {
        setError('No account found with this email. Please sign up first.');
      } else if (errorMessage.includes('NotAuthorizedException')) {
        setError('Incorrect email or password.');
      } else if (errorMessage.toLowerCase().includes('failed to fetch') || errorMessage.toLowerCase().includes('networkerror') || errorMessage.toLowerCase().includes('timed out')) {
        setError('Network error — please check your internet connection and try again.');
      } else {
        setError(errorMessage || 'Failed to sign in');
      }
      setIsLoading(false);
      return;
    }

    // Redirect based on the actual user role from the result
    const userRole = result.role;
    
    if (userRole === 'admin') {
      navigate('/admin');
    } else if (userRole === 'seller') {
      navigate('/seller/dashboard');
    } else {
      // BLOCK: Regular users cannot login through seller login page
      setWrongRolePopup(true);
      await signOut();
    }
    setIsLoading(false);
  };

  return (
    <div className="seller-auth-shell">
      <SellerAuthHeader />
      {/* ── Wrong-role popup modal ── */}
      {wrongRolePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setWrongRolePopup(false)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-amber-600" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-3">Account Type Mismatch</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The email address you entered is linked to a <span className="font-semibold">Buyer</span> account.
              Seller access is restricted to accounts registered as sellers.
            </p>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              Please log in through the <span className="font-semibold">Buyer Login</span> page using this email address.
            </p>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed">
              If you intend to sell on our platform, you will need to register for a Seller account and complete the verification process.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="/login"
                className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold text-center hover:bg-blue-700 transition-colors"
              >
                Go to Buyer Login
              </a>
              <button
                onClick={() => setWrongRolePopup(false)}
                className="w-full rounded-lg border border-gray-300 text-gray-700 py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="auth-card auth-card--seller">
        {!isNativePlatform && (
          <div className="mb-5 sm:mb-6">
            <Link
              to="/"
              className="auth-top-link"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back To Home</span>
            </Link>
          </div>
        )}
        <AuthCardHeader
          title="Seller Portal"
          subtitle="Manage your store, orders, and payouts."
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          {successMessage && (
            <div className="auth-alert auth-alert--success">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {error && (
            <div className="auth-alert auth-alert--error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="seller-email" className="auth-label">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                id="seller-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="auth-input"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="seller-password" className="auth-label">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                id="seller-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="auth-input auth-input--toggle"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="flex justify-end">
              <Link
                to="/seller/forgot-password"
                className="text-xs font-semibold text-slate-500 hover:text-blue-700 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-submit-btn-blue"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="text-center mt-4 text-xs text-slate-600">
          New seller?{' '}
          <Link to="/seller/signup" className="auth-footer-link">
            Create your store
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SellerLogin;
