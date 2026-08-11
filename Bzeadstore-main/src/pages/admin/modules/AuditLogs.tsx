import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Filter, Download, Eye, X } from 'lucide-react';
import { getAuditLogs } from '../../../lib/adminService';
import { formatFrontend12DigitId } from '../../../utils/idFormatter';

interface AuditLog {
  id: string;
  timestamp: string;
  admin: string;
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  ipAddress: string;
  status: 'success' | 'failed';
}

export const AuditLogs: React.FC = () => {
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateRange, setDateRange] = useState('7days');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [_total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const limit = 20;

  const loadLogs = useCallback(async () => {
    const result = await getAuditLogs({ limit: 500, offset: 0 });
    const fetched = (result.logs || []).map((l: any) => ({
      id: l.id,
      timestamp: l.created_at || l.timestamp || '',
      admin: l.admin_name || l.admin || 'Admin',
      action: l.action || '',
      resource: l.resource || '',
      resourceId: l.resource_id || '',
      details: typeof l.details === 'object' ? JSON.stringify(l.details, null, 2) : (l.details || ''),
      ipAddress: l.ip_address || '',
      status: l.status || 'success',
    }));
    setLogs(fetched);
    setTotal(result.total || fetched.length);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Apply client-side filters
  useEffect(() => {
    let filtered = [...logs];

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateRange === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (dateRange === '7days') cutoff.setDate(now.getDate() - 7);
      else if (dateRange === '30days') cutoff.setDate(now.getDate() - 30);
      else if (dateRange === '90days') cutoff.setDate(now.getDate() - 90);
      filtered = filtered.filter((l) => new Date(l.timestamp) >= cutoff);
    }

    // Action filter
    if (selectedAction !== 'all') {
      filtered = filtered.filter((l) => l.action === selectedAction);
    }

    // Status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((l) => l.status === selectedStatus);
    }

    setFilteredLogs(filtered);
    setPage(1);
  }, [logs, dateRange, selectedAction, selectedStatus]);

  const paginatedLogs = filteredLogs.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(filteredLogs.length / limit);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Admin', 'Action', 'Resource', 'Resource ID', 'Status', 'IP Address', 'Details'];
    const rows = filteredLogs.map((l) => [l.timestamp, l.admin, l.action, l.resource, l.resourceId, l.status, l.ipAddress, l.details.replace(/"/g, '""')]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const actions = [
    'User Suspended',
    'Product Approved',
    'Order Refund',
    'Seller KYC Rejected',
    'Promotion Created',
    'Report Generated',
    'Settings Updated'
  ];

  const getStatusBadge = (status: string) => {
    return status === 'success'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';
  };

  const getActionColor = (action: string) => {
    const colors: { [key: string]: string } = {
      'User Suspended': 'bg-red-100 text-red-800',
      'Product Approved': 'bg-green-100 text-green-800',
      'Order Refund': 'bg-blue-100 text-blue-800',
      'Seller KYC Rejected': 'bg-orange-100 text-orange-800',
      'Promotion Created': 'bg-purple-100 text-purple-800',
      'Report Generated': 'bg-indigo-100 text-indigo-800',
      'Settings Updated': 'bg-yellow-100 text-yellow-800'
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600 mt-2">Track all administrative actions and changes</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Action
              </label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={loadLogs} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
              <Filter className="w-4 h-4" />
              Refresh
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-2 text-green-600 hover:text-green-700 font-medium">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Timestamp</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Admin</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-gray-700">Resource</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-gray-700 hidden md:table-cell">IP Address</th>
                  <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-gray-700">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-900 font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">{log.admin}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">
                      {log.resource} ({log.resourceId ? formatFrontend12DigitId(log.resourceId) : '—'})
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(log.status)}`}>
                        {log.status === 'success' ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600 font-mono hidden md:table-cell">{log.ipAddress || '—'}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <button onClick={() => setSelectedLog(log)} className="text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {paginatedLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No audit logs found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredLogs.length === 0 ? 0 : (page - 1) * limit + 1}</span> to{' '}
              <span className="font-semibold">{Math.min(page * limit, filteredLogs.length)}</span> of{' '}
              <span className="font-semibold">{filteredLogs.length}</span> logs
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-600">Page {page} of {totalPages || 1}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Log Detail Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-4 sm:p-6 m-2 sm:m-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
                <button onClick={() => setSelectedLog(null)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="font-medium text-gray-600">ID:</span> <span className="font-mono">{formatFrontend12DigitId(selectedLog.id)}</span></div>
                <div><span className="font-medium text-gray-600">Timestamp:</span> {new Date(selectedLog.timestamp).toLocaleString()}</div>
                <div><span className="font-medium text-gray-600">Admin:</span> {selectedLog.admin}</div>
                <div><span className="font-medium text-gray-600">Action:</span> {selectedLog.action}</div>
                <div><span className="font-medium text-gray-600">Resource:</span> {selectedLog.resource}</div>
                <div><span className="font-medium text-gray-600">Resource ID:</span> <span className="font-mono">{selectedLog.resourceId ? formatFrontend12DigitId(selectedLog.resourceId) : '—'}</span></div>
                <div><span className="font-medium text-gray-600">Status:</span> <span className={selectedLog.status === 'success' ? 'text-green-600' : 'text-red-600'}>{selectedLog.status}</span></div>
                <div><span className="font-medium text-gray-600">IP Address:</span> <span className="font-mono">{selectedLog.ipAddress || '—'}</span></div>
                <div>
                  <span className="font-medium text-gray-600">Details:</span>
                  <pre className="mt-1 p-3 bg-gray-50 rounded text-xs overflow-x-auto whitespace-pre-wrap">{selectedLog.details || 'No details'}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Log Details Modal Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Need detailed information?</h3>
          <p className="text-blue-800 text-sm">
            Click "View" on any log to see complete details including request payload, response, and affected records.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
