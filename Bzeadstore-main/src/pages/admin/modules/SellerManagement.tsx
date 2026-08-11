import React, { useEffect, useState } from 'react';
import { Loading, ErrorMessage, SuccessMessage } from '../components/StatusIndicators';
import { Search, Eye, CheckCircle, XCircle } from 'lucide-react';
import type { Seller } from '../../../types';
import { logger } from '../../../utils/logger';
import * as adminApiService from '../../../lib/adminService';
import { useCurrency } from '../../../contexts/CurrencyContext';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

export const SellerManagement: React.FC = () => {
  const { formatPrice } = useCurrency();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [kycFilter, setKycFilter] = useState<string>('');
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 10,
    total: 0,
  });

  useEffect(() => {
    fetchSellers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, searchTerm, kycFilter]);

  const fetchSellers = async () => {
    try {
      setLoading(true);
      const result = await adminApiService.getAllSellers({
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
        search: searchTerm || undefined,
        kycFilter: kycFilter || undefined,
      });
      if (result) {
        setSellers(result.sellers);
        setPagination((prev) => ({ ...prev, total: result.total }));
        setError(null);
      }
    } catch (err) {
      setError('Failed to load sellers');
      logger.error(err as Error, { context: 'Seller management error' });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveKYC = async (sellerId: string) => {
    try {
      setActionLoading(sellerId);
      const result = await adminApiService.updateSellerKYC(sellerId, 'approved');
      if (result) {
        setSuccess('Seller KYC approved');
        fetchSellers();
      }
    } catch (_err) {
      setError('Failed to approve KYC');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectKYC = async (sellerId: string) => {
    try {
      setActionLoading(sellerId);
      const result = await adminApiService.updateSellerKYC(sellerId, 'rejected');
      if (result) {
        setSuccess('Seller KYC rejected');
        fetchSellers();
      }
    } catch (_err) {
      setError('Failed to reject KYC');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateBadge = async (sellerId: string, badge: 'silver' | 'gold' | 'platinum') => {
    try {
      setActionLoading(sellerId);
      const result = await adminApiService.updateSellerBadge(sellerId, badge);
      if (result) {
        setSuccess(`Seller badge updated to ${badge.toUpperCase()}`);
        fetchSellers();
      }
    } catch (_err) {
      setError('Failed to update badge');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (loading) return <Loading message="Loading sellers..." />;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex gap-2">
          <ErrorMessage message={error} />
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {success && (
        <div className="flex gap-2">
          <SuccessMessage message={success} />
          <button onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Seller Management</h2>
        <p className="text-gray-600">Total Sellers: {pagination.total}</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Search by shop name or email..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
            />
          </div>

          <select
            value={kycFilter}
            onChange={(e) => {
              setKycFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
          >
            <option value="">All KYC Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Sellers Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Shop Name</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">KYC Status</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Badge</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Listings</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sellers.length > 0 ? (
                sellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-3 text-sm font-medium text-gray-900">{seller.shop_name}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">{seller.email}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        seller.kyc_status === 'approved' ? 'bg-green-100 text-green-800' :
                        seller.kyc_status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {(seller.kyc_status || 'pending').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        seller.badge === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                        seller.badge === 'platinum' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {seller.badge?.toUpperCase() || 'STANDARD'}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">{seller.total_listings}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedSeller(seller);
                            setShowDetails(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>
                        {seller.kyc_status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApproveKYC(seller.id)}
                              disabled={actionLoading === seller.id}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                              title="Approve KYC"
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => handleRejectKYC(seller.id)}
                              disabled={actionLoading === seller.id}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                              title="Reject KYC"
                            >
                              <XCircle size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No sellers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white rounded-lg shadow p-3 sm:p-4 gap-3">
          <button
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
            disabled={pagination.page === 1}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            Previous
          </button>

          <span className="text-sm text-gray-600">
            Page {pagination.page} of {totalPages}
          </span>

          <button
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
            disabled={pagination.page === totalPages}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            Next
          </button>
        </div>
      )}

      {/* Seller Details Modal */}
      {showDetails && selectedSeller && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Seller Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Shop Name</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSeller.shop_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSeller.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSeller.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Seller Type</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSeller.seller_type?.toUpperCase() || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Listings</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSeller.total_listings}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-lg font-semibold text-gray-900">{formatPrice(selectedSeller.total_revenue || 0, 'INR')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Rating</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSeller.rating || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="text-lg font-semibold text-gray-900">{new Date(selectedSeller.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-3">Update Badge</p>
                <div className="flex gap-2">
                  {['silver', 'gold', 'platinum'].map((badge) => (
                    <button
                      key={badge}
                      onClick={() => handleUpdateBadge(selectedSeller.id, badge as 'silver' | 'gold' | 'platinum')}
                      disabled={actionLoading === selectedSeller.id}
                      className={`px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
                        selectedSeller.badge === badge
                          ? 'bg-white text-gray-900'
                          : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      }`}
                    >
                      {badge.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetails(false)}
                className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerManagement;
