import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SellerOrderManagement from './SellerOrderManagement';
import SellerLayout from './SellerLayout';

export const SellerOrderManagementWrapper: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, currentAuthUser } = useAuth();

  const handleNavigate = (view: string) => {
    const targetPath =
      view === 'seller-dashboard' ? '/seller/dashboard' :
      view === 'seller-products' || view === 'seller-product-listing' ? '/seller/products' :
      view === 'seller-orders' ? '/seller/orders' :
      view === 'seller-wallet' ? '/seller/wallet' :
      view === 'seller-verify' ? '/seller/verify' :
      view === 'seller-notifications' ? '/seller/notifications' :
      view === 'seller-tutorial' ? '/seller/tutorial' :
      view === 'seller-help' ? '/seller/help' :
      '';

    if (!targetPath || targetPath === location.pathname) return;
    navigate(targetPath);
  };

  const sellerEmail = user?.email || currentAuthUser?.email || '';

  return (
    <SellerLayout>
      <SellerOrderManagement
        sellerEmail={sellerEmail}
        onNavigate={handleNavigate}
      />
    </SellerLayout>
  );
};

export default SellerOrderManagementWrapper;
