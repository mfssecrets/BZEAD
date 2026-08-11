import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Home, ShoppingCart, Package, DollarSign, Inbox } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from './components/AdminHeader';
import AdminSidebar from './components/AdminSidebar';
import { PageSkeleton } from '../../components/common/Skeleton';

export const AdminLayout: React.FC = () => {
  const { currentAuthUser, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [inboxToast, setInboxToast] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // While auth is resolving (profile fetch in progress), show nothing.
  // This prevents the flash-of-error when user_metadata role differs
  // from the DB role (e.g. admin role is only in profiles, not JWT).
  if (loading) {
    return <PageSkeleton variant="plain" />;
  }

  // Check admin role — only trust the DB profile role, not user_metadata.
  // user.role comes from the profiles table fetch; authRole may briefly
  // reflect user_metadata before the profile fetch completes.
  if (!user?.role || user.role !== 'admin') {
    return <Navigate to="/seller/login" replace />;
  }

  const adminName = user?.full_name || currentAuthUser?.username || 'Admin';
  const adminId = user?.id || (currentAuthUser as any)?.userId || '';

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const bottomNavItems: Array<{ icon: React.ReactNode; label: string; path: string; placeholder?: boolean }> = [
    { icon: <Home size={18} />, label: 'Dashboard', path: '/admin' },
    { icon: <ShoppingCart size={18} />, label: 'Orders', path: '/admin/orders' },
    { icon: <Package size={18} />, label: 'Products', path: '/admin/products' },
    { icon: <DollarSign size={18} />, label: 'Accounts', path: '/admin/accounts' },
    { icon: <Inbox size={18} />, label: 'Inbox', path: '/admin/inbox', placeholder: true },
  ];

  return (
    <div className="flex min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Sidebar */}
      <AdminSidebar isOpen={sidebarOpen || !isMobile} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <AdminHeader
          adminName={adminName}
          adminId={adminId}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Page Content */}
        <main
          data-native-safe-area="admin-main"
          className="flex-1 overflow-x-hidden overflow-y-auto pt-20 pb-20 lg:pb-4"
        >
          <div className="px-3 py-4 sm:px-4 md:px-6 max-w-7xl mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Fixed mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] z-50"
        aria-label="Admin navigation"
      >
        <div data-native-shrink="nav" className="h-14 flex items-stretch justify-around">
        {bottomNavItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                if (item.placeholder) {
                  setInboxToast(true);
                  window.setTimeout(() => setInboxToast(false), 2000);
                  return;
                }
                navigate(item.path);
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-amber-700' : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        </div>
      </nav>

      {/* Inbox placeholder toast */}
      {inboxToast && (
        <div className="lg:hidden fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-medium shadow-lg">
          Inbox — coming soon
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
