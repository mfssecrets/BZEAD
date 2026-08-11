import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../../components/layout/Header';
import { Footer } from '../../../components/layout/Footer';
import { MobileNav } from '../../../components/layout/MobileNav';
import AddressForm from '../../../components/AddressForm';
import type { Address } from '../../../components/AddressForm';
import { MapPin, Edit2, Trash2, Eye, Search, ArrowLeft, Home, Briefcase } from 'lucide-react';
import * as adminApiService from '../../../lib/adminService';
import { confirmOnce } from '../../../utils/confirmOnce';
import { ListSkeleton } from '../../../components/common/Skeleton';

interface UserAddress {
  userId: string;
  userName: string;
  userEmail: string;
  addresses: Address[];
}

const AdminAddressManagement: React.FC = () => {
  const navigate = useNavigate();

  const [allAddresses, setAllAddresses] = useState<UserAddress[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    const loadAddresses = async () => {
      try {
        const { data } = await adminApiService.getAllUsersWithAddresses();
        setAllAddresses((data || []) as UserAddress[]);
      } catch {
        // silently handle
      } finally {
        setPageLoading(false);
      }
    };
    loadAddresses();
  }, []);

  const filteredUsers = allAddresses.filter((user) =>
    user.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedUserData = selectedUser ? allAddresses.find((u) => u.userId === selectedUser) : null;

  const handleUpdateAddress = async (data: Address) => {
    setIsLoading(true);
    try {
      const { error } = await adminApiService.updateUserAddress(data.id, {
        full_name: data.fullName,
        phone: data.phoneNumber,
        email: data.email,
        country: data.country,
        street_address_1: data.streetAddress1,
        street_address_2: data.streetAddress2,
        city: data.city,
        state: data.state,
        postal_code: data.postalCode,
        address_type: data.addressType,
        is_default: data.isDefault,
        delivery_notes: data.deliveryNotes,
      });
      if (error) throw new Error(error);
      setAllAddresses(
        allAddresses.map((user) => {
          if (user.userId === selectedUser) {
            return {
              ...user,
              addresses: user.addresses.map((a) => (a.id === data.id ? data : a)),
            };
          }
          return user;
        })
      );
      setEditingAddress(null);
      setShowForm(false);
    } catch {
      alert('Failed to update address');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirmOnce('Are you sure you want to delete this address?')) return;
    try {
      const { error } = await adminApiService.deleteUserAddress(addressId);
      if (error) throw new Error(error);
      setAllAddresses(
        allAddresses.map((user) => {
          if (user.userId === selectedUser) {
            return {
              ...user,
              addresses: user.addresses.filter((a) => a.id !== addressId),
            };
          }
          return user;
        })
      );
    } catch {
      alert('Failed to delete address');
    }
  };

  const getAddressTypeIcon = (type: 'home' | 'work' | 'other') => {
    switch (type) {
      case 'home':
        return <Home size={16} className="text-amber-600" />;
      case 'work':
        return <Briefcase size={16} className="text-amber-600" />;
      default:
        return <MapPin size={16} className="text-amber-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 pb-16 md:pb-0">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-amber-600 hover:text-yellow-400 transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Back</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Address Management</h1>
          <p className="text-gray-500">Admin panel - Manage user addresses</p>
        </div>

        {pageLoading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading addresses...</span>
            <ListSkeleton rows={6} />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users List */}
          <div className="lg:col-span-1">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-amber-600 mb-4">Users with Addresses</h2>

              {/* Search */}
              <div className="relative mb-4">
                <Search size={18} className="absolute left-3 top-3 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
                />
              </div>

              {/* Users List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredUsers.map((user) => (
                  <button
                    key={user.userId}
                    onClick={() => setSelectedUser(user.userId)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors text-sm ${
                      selectedUser === user.userId
                        ? 'bg-amber-500 text-black font-semibold'
                        : 'bg-gray-100 hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <p className="font-medium">{user.userName}</p>
                    <p className="text-xs opacity-75">{user.userEmail}</p>
                    <p className="text-xs opacity-50 mt-1">{user.addresses.length} address(es)</p>
                  </button>
                ))}

                {filteredUsers.length === 0 && (
                  <p className="text-center text-gray-500 text-sm py-4">No users found</p>
                )}
              </div>
            </div>
          </div>

          {/* Address Details */}
          <div className="lg:col-span-2">
            {selectedUserData ? (
              <div className="space-y-6">
                {/* User Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-amber-600 mb-4">User Information</h3>
                  <div className="space-y-2">
                    <p>
                      <span className="text-gray-500">Name:</span>{' '}
                      <span className="font-medium">{selectedUserData.userName}</span>
                    </p>
                    <p>
                      <span className="text-gray-500">Email:</span>{' '}
                      <span className="font-medium">{selectedUserData.userEmail}</span>
                    </p>
                    <p>
                      <span className="text-gray-500">Addresses:</span>{' '}
                      <span className="font-medium">{selectedUserData.addresses.length}</span>
                    </p>
                  </div>
                </div>

                {/* Form */}
                {showForm && editingAddress && (
                  <AddressForm
                    initialData={editingAddress}
                    onSubmit={handleUpdateAddress}
                    onCancel={() => {
                      setShowForm(false);
                      setEditingAddress(null);
                    }}
                    isLoading={isLoading}
                  />
                )}

                {/* Addresses List */}
                {selectedUserData.addresses.length > 0 ? (
                  <div className="space-y-4">
                    {selectedUserData.addresses.map((address) => (
                      <div
                        key={address.id}
                        className="bg-gray-50 border border-gray-200 rounded-2xl p-6"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-2">
                            {getAddressTypeIcon(address.addressType)}
                            <span className="font-semibold capitalize">{address.addressType}</span>
                          </div>
                          {address.isDefault && (
                            <span className="bg-amber-500 text-black text-xs font-semibold px-2 py-1 rounded">
                              Default
                            </span>
                          )}
                        </div>

                        {/* Address Content */}
                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                          <div>
                            <p className="text-gray-500">Name</p>
                            <p className="font-medium">{address.fullName}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Phone</p>
                            <p className="font-medium">{address.phoneNumber}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Email</p>
                            <p className="font-medium break-all">{address.email}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Country</p>
                            <p className="font-medium">{address.country}</p>
                          </div>
                        </div>

                        <div className="mb-4 text-sm">
                          <p className="text-gray-500">Address</p>
                          <p className="font-medium">
                            {address.streetAddress1}
                            {address.streetAddress2 && `, ${address.streetAddress2}`}
                          </p>
                          <p className="font-medium">
                            {address.city}, {address.state} {address.postalCode}
                          </p>
                        </div>

                        {address.deliveryNotes && (
                          <div className="mb-4 text-sm">
                            <p className="text-gray-500">Delivery Notes</p>
                            <p className="font-medium text-gray-600">{address.deliveryNotes}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => {
                              setEditingAddress(address);
                              setShowForm(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
                          >
                            <Edit2 size={16} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAddress(address.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-red-900 rounded-lg transition-colors text-sm font-medium"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
                    <MapPin size={36} className="mx-auto mb-4 text-gray-600" />
                    <p className="text-gray-500">No addresses for this user</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center">
                <Eye size={36} className="mx-auto mb-4 text-gray-600" />
                <p className="text-gray-500">Select a user to view their addresses</p>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default AdminAddressManagement;
