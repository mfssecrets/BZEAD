/**
 * SellerHelp.tsx
 * ──────────────
 * Help center with quick help categories, collapsible FAQ, and contact support options.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LifeBuoy, Package, Banknote, Truck, RotateCcw,
  ChevronDown, MessageSquare, Mail, Search, X, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FaWhatsapp } from 'react-icons/fa';

const WHATSAPP_NUMBER = '447555394997';

const faqItems = [
  {
    question: 'How do I list a new product?',
    answer: 'Go to Products → Click "Add New" → Follow the 7-step wizard to add product details, images, pricing, and shipping info. Your product will be reviewed within 24 hours.',
    category: 'Orders',
  },
  {
    question: 'When will I receive my payment?',
    answer: 'Payments are settled in 2 monthly cycles (1st–15th and 16th–End). After delivery confirmation, your earnings appear in the next settlement cycle, minus the platform fee.',
    category: 'Payments',
  },
  {
    question: 'How do I ship an order?',
    answer: 'Once an order is packed, click "Ship via Shiprocket" to create a shipment. AWB tracking is auto-assigned and shared with the buyer.',
    category: 'Shipping',
  },
  {
    question: 'What if a customer requests a return?',
    answer: 'Return requests appear in the "Returns" tab. You can approve (triggers auto-refund) or reject with reason. For approved returns, a return label can be generated via Shippo.',
    category: 'Returns',
  },
  {
    question: 'How do I withdraw my earnings?',
    answer: 'Go to Wallet → Click "Withdraw" → Enter the amount and confirm. Withdrawals are processed daily and funds typically reach your bank within 1-2 business days.',
    category: 'Payments',
  },
  {
    question: 'How do I update my bank details?',
    answer: 'Bank details are submitted during KYC verification. To update them, contact seller support with your verified identity.',
    category: 'Payments',
  },
];

const helpCategories = [
  { icon: <Package size={20} />, label: 'Orders', subtitle: 'Manage & track', bg: 'bg-blue-50', color: 'text-blue-600', hoverBorder: 'hover:border-blue-300' },
  { icon: <Banknote size={20} />, label: 'Payments', subtitle: 'Payouts & fees', bg: 'bg-green-50', color: 'text-green-600', hoverBorder: 'hover:border-green-300' },
  { icon: <Truck size={20} />, label: 'Shipping', subtitle: 'Labels & tracking', bg: 'bg-purple-50', color: 'text-purple-600', hoverBorder: 'hover:border-purple-300' },
  { icon: <RotateCcw size={20} />, label: 'Returns', subtitle: 'Refund policies', bg: 'bg-amber-50', color: 'text-amber-600', hoverBorder: 'hover:border-amber-300' },
];

const SellerHelp: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const sellerId = user?.id || currentAuthUser?.userId || 'Unknown';
  const sellerName = user?.full_name || currentAuthUser?.email || user?.email || 'Unknown Seller';
  const whatsappText = [
    'Hello Beauzead Support,',
    '',
    `Seller Name: ${sellerName}`,
    `Seller ID: ${sellerId}`,
    'Message: I need help',
  ].join('\n');
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}`;

  const filteredFaq = faqItems.filter((f) => {
    const matchesSearch = !searchQuery.trim() ||
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      {/* Header with search */}
      <div className="rounded-2xl text-white px-4 sm:px-6 pt-4 pb-6 sm:pb-10" style={{ background: 'linear-gradient(90deg, #0f172a 0%, #1e3a5f 100%)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <button
            onClick={() => navigate('/seller/dashboard')}
            className="lg:hidden p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Back to dashboard"
          >
            <ChevronLeft size={16} />
          </button>
          <LifeBuoy size={16} />
          <h2 className="text-sm font-bold">Help Center</h2>
        </div>
        <div className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
          <Search size={14} className="text-white/50" />
          <input
            type="text"
            placeholder="Search help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-xs text-white outline-none bg-transparent placeholder-white/50"
          />
        </div>
      </div>

      {/* Quick Help Cards – pulled up over header */}
      <div className="-mt-8 relative z-10 grid grid-cols-2 gap-3">
        {helpCategories.map((cat) => (
          <div
            key={cat.label}
            onClick={() => setSelectedCategory(selectedCategory === cat.label ? null : cat.label)}
            className={`bg-white border rounded-2xl p-4 text-center ${cat.hoverBorder} hover:shadow-md transition-all cursor-pointer ${selectedCategory === cat.label ? 'border-2 ' + cat.hoverBorder.replace('hover:', '') + ' shadow-md' : 'border-gray-200'}`}
          >
            <div className={`w-12 h-12 ${cat.bg} rounded-xl flex items-center justify-center mx-auto mb-2 ${cat.color}`}>
              {cat.icon}
            </div>
            <p className="text-xs font-bold text-gray-900">{cat.label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{cat.subtitle}</p>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Frequently Asked Questions</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredFaq.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-xs">
              No matching questions found. Try a different search term.
            </div>
          ) : (
            filteredFaq.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-900 pr-4">{faq.question}</span>
                  <ChevronDown
                    size={12}
                    className={`text-gray-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3 text-[11px] text-gray-600 leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Need More Help?</h3>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setShowChatModal(true)}
            className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 hover:bg-blue-100 transition-all text-left"
          >
            <div className="w-7 h-7 bg-blue-100 rounded-md flex items-center justify-center shrink-0">
              <MessageSquare size={13} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Live Chat</p>
              <p className="text-[11px] text-gray-500">Use support chat options</p>
            </div>
          </button>
          <a href="mailto:support@bzead.com" className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-3 hover:bg-green-100 transition-all">
            <div className="w-7 h-7 bg-green-100 rounded-md flex items-center justify-center shrink-0">
              <Mail size={13} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Email Support</p>
              <p className="text-[11px] text-gray-500">support@bzead.com</p>
            </div>
          </a>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3 hover:bg-emerald-100 transition-all text-left"
          >
            <div className="w-7 h-7 bg-emerald-100 rounded-md flex items-center justify-center shrink-0">
              <FaWhatsapp size={14} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">WhatsApp Support</p>
              <p className="text-[11px] text-gray-500">+44 7555 394997</p>
            </div>
          </a>
        </div>
      </div>

      {/* Live Chat Modal */}
      {showChatModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 relative">
            <button onClick={() => setShowChatModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={20} className="text-blue-600" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Live Chat</h3>
              <p className="text-xs text-gray-500 mb-4">
                For immediate help, use WhatsApp support or email us at support@bzead.com.
              </p>
              <a
                href="mailto:support@bzead.com"
                className="inline-block bg-blue-600 text-white text-xs font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Email Support Instead
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerHelp;
