import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateEmail } from '../../utils/validation';
import { SellerAuthHeader } from './SellerAuthHeader';
import { AuthCardHeader } from '../../components/auth/AuthCardHeader';
import { isNativePlatform } from '../../mobile/nativePlatform';

const SellerForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Please enter your email address');
      return;
    }

    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(normalizedEmail, '/seller/new-password');
      if (result.success) {
        sessionStorage.setItem('sellerPasswordResetEmail', normalizedEmail);
        sessionStorage.setItem('otpContext', JSON.stringify({ email: normalizedEmail, purpose: 'seller-password-reset', role: 'seller' }));
        setIsLoading(false);
        navigate('/seller/otp-verification', {
          state: {
            email: normalizedEmail,
            purpose: 'seller-password-reset',
            role: 'seller',
            notice: 'Reset OTP sent. Please check inbox, spam, and promotions tabs.'
          }
        });
      } else {
        setError(result.error?.message || 'Failed to send reset code');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="seller-auth-shell">
      <SellerAuthHeader />
      <div className="auth-card">
        {!isNativePlatform && (
          <Link
            to="/seller/login"
            className="auth-top-link"
          >
            <ArrowLeft size={16} />
            Back to Login
          </Link>
        )}

        <AuthCardHeader
          title="Reset Your Password"
          subtitle="Enter your email address and we'll send you a verification code."
        />

        <form onSubmit={handleEmailSubmit} className="space-y-5">
          {error && (
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="reset-email" className="text-sm font-medium text-gray-700">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@bzead.com"
                className="auth-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-submit-btn-blue flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send Verification Code'}
          </button>
          <p className="text-xs text-gray-500 text-center">
            If email is delayed, check spam and promotions tabs.
          </p>
        </form>
      </div>
    </div>
  );
};

export default SellerForgotPassword;
