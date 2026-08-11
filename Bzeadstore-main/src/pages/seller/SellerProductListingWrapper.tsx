import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SellerProductListing from './SellerProductListing';
import SellerLayout from './SellerLayout';

export const SellerProductListingWrapper: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (view: string) => {
    const targetPath =
      view === 'seller-dashboard' ? '/seller/dashboard' :
      view === 'seller-verify' ? '/seller/verify' :
      view === 'seller-product-listing' || view === 'seller-products' ? '/seller/products' :
      view === 'seller-warehouse' ? '/seller/warehouse' :
      view === 'seller-orders' ? '/seller/orders' :
      view === 'seller-wallet' ? '/seller/wallet' :
      view === 'seller-notifications' ? '/seller/notifications' :
      view === 'seller-tutorial' ? '/seller/tutorial' :
      view === 'seller-help' ? '/seller/help' :
      '';

    if (!targetPath || targetPath === location.pathname) return;
    navigate(targetPath);
  };

  return (
    <SellerLayout>
      <SellerProductListing
        onNavigate={handleNavigate}
      />
    </SellerLayout>
  );
};

export default SellerProductListingWrapper;
