import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield } from 'lucide-react';
import * as adminApiService from '../../../lib/adminService';
import { confirmOnce } from '../../../utils/confirmOnce';
import { TableSkeleton } from '../../../components/common/Skeleton';

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export const AdminManagement: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [showPromote, setShowPromote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await adminApiService.getAdminUsers();
      setAdmins((data || []) as AdminUser[]);
      setLoading(false);
    };
    load();
  }, []);

  const handleDemote = async (id: string) => {
    if (!confirmOnce('Remove admin privileges for this user?')) return;
    try {
      const { error: err } = await adminApiService.deleteAdminUser(id);
      if (err) throw new Error(err);
      setAdmins(admins.filter((a) => a.id !== id));
      setSuccess('Admin removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to remove admin');
    }
  };

  const handlePromote = async () => {
    if (!promoteEmail.trim()) return;
    try {
      // Find user by email first
      const { data: users } = await adminApiService.getAdminUsers();
      // Actually we need to search profiles by email
      const { supabase } = await import('../../../lib/supabase');
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', promoteEmail.trim())
        .single();
      if (!profile) {
        setError('User not found with that email');
        return;
      }
      const { error: err } = await adminApiService.updateAdminRole(profile.id, 'admin');
      if (err) throw new Error(err);
      setAdmins([...admins, { ...profile, role: 'admin', created_at: new Date().toISOString() } as AdminUser]);
      setPromoteEmail('');
      setShowPromote(false);
      setSuccess('User promoted to admin');
      setTimeout(() => setSuccess(null), 3000);
      void users;
    } catch {
      setError('Failed to promote user');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Admin Management</h2>
        <button
          onClick={() => setShowPromote(true)}
          className="px-4 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Admin
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>}

      {showPromote && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 border">
          <h3 className="font-semibold text-gray-900 mb-3">Promote User to Admin</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              placeholder="Enter user email"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
            />
            <button onClick={handlePromote} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">Promote</button>
            <button onClick={() => setShowPromote(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading admins...</span>
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden sm:table-cell">Role</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Joined</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50">
                  <td className="px-2 sm:px-4 py-4 text-sm font-medium text-gray-900 flex items-center gap-2">
                    <Shield size={16} className="text-blue-600" />
                    {admin.full_name || 'Unknown'}
                  </td>
                  <td className="px-2 sm:px-4 py-4 text-xs sm:text-sm text-gray-600 break-all">{admin.email}</td>
                  <td className="px-2 sm:px-4 py-4 text-sm hidden sm:table-cell">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium uppercase">{admin.role}</span>
                  </td>
                  <td className="px-2 sm:px-4 py-4 text-sm text-gray-500 hidden md:table-cell">{admin.created_at ? new Date(admin.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-2 sm:px-4 py-4 text-center">
                    <button onClick={() => handleDemote(admin.id)} className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-700" title="Remove admin">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">No admin users found</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManagement;
