import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Package,
  ShoppingCart,
  Settings,
  BarChart3,
  AlertCircle,
  DollarSign,
  Shield,
  User,
  Bell,
  ChevronDown,
  X,
  Megaphone,
  Image,
  FolderTree,
  Truck,
  Building2,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    icon: <Home size={20} />,
    path: '/admin',
  },
  {
    label: 'Seller KYC',
    icon: <Shield size={20} />,
    path: '/admin/seller-kyc',
  },
  {
    label: 'Products',
    icon: <Package size={20} />,
    path: '/admin/products',
  },
  {
    label: 'Sponsored Products',
    icon: <Megaphone size={20} />,
    path: '/admin/sponsored-products',
  },
  {
    label: 'Product Variants',
    icon: <Package size={20} />,
    path: '/admin/variants',
  },
  {
    label: 'Orders',
    icon: <ShoppingCart size={20} />,
    path: '/admin/orders',
  },
  {
    label: 'Sellers',
    icon: <Shield size={20} />,
    path: '/admin/sellers',
  },
  {
    label: 'Seller Warehouse',
    icon: <Building2 size={20} />,
    path: '/admin/seller-warehouses',
  },
  {
    label: 'Complaints',
    icon: <AlertCircle size={20} />,
    path: '/admin/complaints',
  },
  {
    label: 'Accounts',
    icon: <DollarSign size={20} />,
    path: '/admin/accounts',
  },
  {
    label: 'Reports',
    icon: <BarChart3 size={20} />,
    path: '/admin/reports',
  },
  {
    label: 'Admin Management',
    icon: <Shield size={20} />,
    path: '/admin/admins',
  },
  {
    label: 'Profile',
    icon: <User size={20} />,
    path: '/admin/profile',
  },
  {
    label: 'Settings',
    icon: <Settings size={20} />,
    path: '/admin/settings',
  },
  {
    label: 'Notifications',
    icon: <Bell size={20} />,
    path: '/admin/notifications',
  },
  {
    label: 'Shipping Management',
    icon: <Truck size={20} />,
    path: '/admin/shipping-management',
  },
  {
    label: 'Banner Management',
    icon: <Image size={20} />,
    path: '/admin/banners',
  },
  {
    label: 'Category Management',
    icon: <FolderTree size={20} />,
    path: '/admin/categories',
  },
];

export const AdminSidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname === path;

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const toggleSubmenu = (label: string) => {
    setExpandedMenu(expandedMenu === label ? null : label);
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 w-64 h-[calc(100vh-64px)] bg-[#0d0f12] border-r border-black/40 overflow-y-auto transition-transform duration-300 z-40 lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button for mobile */}
        <div className="lg:hidden p-4 border-b border-white/10">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.path}>
                <button
                  onClick={() => {
                    if (item.children) {
                      toggleSubmenu(item.label);
                    } else {
                      handleNavigate(item.path);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    isActive(item.path)
                      ? 'bg-gradient-to-r from-[#2bb0f3] to-[#1565d8] text-white font-semibold shadow-lg shadow-blue-900/40'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 font-medium">{item.label}</span>
                  {item.children && (
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${
                        expandedMenu === item.label ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </button>

                {/* Submenu */}
                {item.children && expandedMenu === item.label && (
                  <ul className="mt-1 ml-4 space-y-1 border-l-2 border-white/10 pl-2">
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <button
                          onClick={() => handleNavigate(child.path)}
                          className={`w-full px-4 py-2 rounded-lg text-sm text-left transition-colors ${
                            isActive(child.path)
                              ? 'bg-white/15 text-white font-semibold'
                              : 'text-gray-400 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {child.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default AdminSidebar;
