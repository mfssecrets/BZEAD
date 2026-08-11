import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SellerPromotions from './SellerPromotions';
import { logger } from '../../utils/logger';

export const SellerPromotionsWrapper: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/seller');
    } catch (error) {
      logger.error(error as Error, { context: 'Seller logout error' });
    }
  };

  const handleNavigate = (view: string) => {
    const targetPath =
      view === 'seller-dashboard' ? '/seller/dashboard' :
      view === 'seller-products' || view === 'seller-product-listing' ? '/seller/products' :
      view === 'seller-orders' ? '/seller/orders' :
      view === 'seller-wallet' ? '/seller/wallet' :
      view === 'seller-verify' ? '/seller/verify' :
      view === 'seller-sales-report' ? '/seller/analytics' :
      view === 'seller-promotions' ? '/seller/promotions' :
      view === 'seller-notifications' ? '/seller/notifications' :
      '';

    if (!targetPath || targetPath === location.pathname) return;
    navigate(targetPath);
  };

  return <SellerPromotions onLogout={handleLogout} onNavigate={handleNavigate} />;
};

export default SellerPromotionsWrapper;
