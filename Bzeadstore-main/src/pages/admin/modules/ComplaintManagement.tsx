import React, { useEffect, useState } from 'react';
import { logger } from '../../../utils/logger';
import { Loading, ErrorMessage, SuccessMessage } from '../components/StatusIndicators';
import { Eye } from 'lucide-react';
import type { Complaint } from '../../../types';
import * as adminApiService from '../../../lib/adminService';
import { formatFrontend12DigitId } from '../../../utils/idFormatter';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

export const ComplaintManagement: React.FC = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [resolution, setResolution] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 10,
    total: 0,
  });

  useEffect(() => {
    fetchComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, statusFilter]);

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const result = await adminApiService.getAllComplaints({
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
        status: statusFilter || undefined,
      });
      if (result) {
        setComplaints(result.complaints);
        setPagination((prev) => ({ ...prev, total: result.total }));
        setError(null);
      }
    } catch (err) {
      setError('Failed to load complaints');
      logger.error(err as Error, { context: 'Complaint management error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (complaintId: string) => {
    try {
      setActionLoading(complaintId);
      const result = await adminApiService.updateComplaintStatus(complaintId, newStatus, resolution);
      if (result) {
        setSuccess('Complaint updated successfully');
        fetchComplaints();
        setShowDetails(false);
      }
    } catch (_err) {
      setError('Failed to update complaint');
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (loading) return <Loading message="Loading complaints..." />;

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

      <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Complaints & Support</h2>
        <p className="text-gray-600">Total Complaints: {pagination.total}</p>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">ID</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">User</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {complaints.length > 0 ? (
                complaints.map((complaint) => (
                  <tr key={complaint.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-3 text-sm font-medium text-gray-900 font-mono">{formatFrontend12DigitId(complaint.id)}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600 font-mono">{formatFrontend12DigitId(complaint.user_id)}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">{complaint.subject}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        complaint.status === 'resolved' ? 'bg-green-100 text-green-800' :
                        complaint.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        complaint.status === 'open' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {complaint.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">
                      {new Date(complaint.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <button
                        onClick={() => {
                          setSelectedComplaint(complaint);
                          setNewStatus(complaint.status);
                          setResolution(complaint.resolution || '');
                          setShowDetails(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No complaints found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Complaint Details Modal */}
      {showDetails && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Complaint Details</h2>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-sm text-gray-600">Subject</p>
                <p className="text-lg font-semibold text-gray-900">{selectedComplaint.subject}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Description</p>
                <p className="text-gray-700 mt-1">{selectedComplaint.description}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">User</p>
                  <p className="text-gray-900 font-semibold font-mono">{formatFrontend12DigitId(selectedComplaint.user_id)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="text-gray-900 font-semibold">{new Date(selectedComplaint.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Update Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Notes</label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
                  placeholder="Add resolution notes..."
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowDetails(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedComplaint.id)}
                disabled={actionLoading === selectedComplaint.id}
                className="px-4 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {actionLoading === selectedComplaint.id ? 'Updating...' : 'Update Complaint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintManagement;
