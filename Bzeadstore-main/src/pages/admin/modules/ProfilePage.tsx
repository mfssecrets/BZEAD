import React, { useEffect, useState } from 'react';
import { Loading, ErrorMessage } from '../components/StatusIndicators';
import type { Admin } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import * as adminApiService from '../../../lib/adminService';

export const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!user?.id) { setError('Not authenticated'); setLoading(false); return; }
        const result = await adminApiService.getAdminProfile(user.id);
        if (result.data) {
          setProfile(result.data as unknown as Admin);
          setError(null);
        } else {
          setError(result.error || 'Failed to load profile');
        }
      } catch (_err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Loading message="Loading profile..." />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900">Profile</h2>

      {error && <ErrorMessage message={error} />}

      {profile && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
            <div>
              <p className="text-sm text-gray-600">Admin Name</p>
              <p className="text-lg font-semibold text-gray-900">{profile.full_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="text-lg font-semibold text-gray-900">{profile.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">UID</p>
              <p className="text-lg font-semibold text-gray-900">{profile.id}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
