import { Link } from 'react-router-dom';
import { Globe, Headphones, BarChart3, ShieldCheck, Truck, CreditCard, UserPlus, PackageSearch, Rocket, Banknote, ArrowRight } from 'lucide-react';

export const SellerLanding = () => {
  return (
    <div className="min-h-screen text-gray-900 bg-white">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 bg-blue-950/95 backdrop-blur border-b border-blue-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <img src="/images/logo/logo.png" alt="BZEAD" className="h-8 sm:h-10 w-auto object-contain" />
          </Link>
          <Link
            to="/seller/login"
            className="inline-flex items-center justify-center h-9 sm:h-10 px-4 sm:px-5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap bg-white text-blue-900 border border-blue-100 hover:bg-blue-50 transition-colors min-w-[124px]"
          >
            Existing Seller
          </Link>
        </div>
      </header>

      {/* ═══ HERO SECTION ═══ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900">
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-sky-400/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left copy */}
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/20 mb-5">
                <Globe className="w-3.5 h-3.5" /> Sell to customers worldwide
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white leading-[1.15] tracking-tight">
                Grow your business<br className="hidden sm:block" /> with <span className="text-amber-400">BZEAD</span>
              </h1>
              <p className="mt-4 text-base sm:text-lg text-blue-200/80 max-w-lg leading-relaxed">
                Reach buyers across 150+ countries. List your products, ship with our integrated partners, and receive secure payouts&nbsp;— all from one dashboard.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/seller/signup"
                  className="inline-flex items-center gap-2 h-12 px-7 rounded-lg text-sm font-bold bg-amber-400 text-blue-950 hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/25"
                >
                  Start Selling <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/seller/login"
                  className="inline-flex items-center gap-2 h-12 px-7 rounded-lg text-sm font-semibold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors"
                >
                  Sign In
                </Link>
              </div>
              {/* Trust stats */}
              <div className="mt-10 flex flex-wrap gap-6 sm:gap-10">
                {[
                  { num: '150+', label: 'Countries Served' },
                  { num: '3%', label: 'Low Commission' },
                  { num: '24/7', label: 'Seller Support' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-2xl sm:text-3xl font-extrabold text-white">{s.num}</p>
                    <p className="text-xs text-blue-300/70 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Right illustration */}
            <div className="hidden lg:flex justify-center">
              <div className="relative w-full max-w-md">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 to-sky-400/20 rounded-3xl blur-2xl" />
                <div className="relative bg-white/10 backdrop-blur border border-white/10 rounded-3xl p-8 space-y-5">
                  {[
                    { icon: '📦', text: 'List your products in minutes' },
                    { icon: '🌍', text: 'Reach buyers across the globe' },
                    { icon: '🚚', text: 'We handle shipping logistics' },
                    { icon: '💰', text: 'Get paid securely every cycle' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4 bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                      <span className="text-2xl">{item.icon}</span>
                      <p className="text-sm text-white/90 font-medium">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW TO SELL ON BZEAD — 4 Steps ═══ */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-center text-gray-900 mb-4">
            How to sell on BZEAD?
          </h2>
          <p className="text-center text-gray-500 text-sm sm:text-base max-w-xl mx-auto mb-12">
            Four simple steps to launch your global storefront — no tech skills needed.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {[
              {
                step: 1,
                icon: UserPlus,
                color: 'bg-blue-100 text-blue-600',
                ring: 'ring-blue-200',
                title: 'Create your account',
                desc: 'Sign up with your email, verify your identity, and add your bank details for payouts.',
              },
              {
                step: 2,
                icon: PackageSearch,
                color: 'bg-amber-100 text-amber-600',
                ring: 'ring-amber-200',
                title: 'List your products',
                desc: 'Upload photos, set prices in your local currency, and choose your shipping preferences.',
              },
              {
                step: 3,
                icon: Truck,
                color: 'bg-green-100 text-green-600',
                ring: 'ring-green-200',
                title: 'Ship with ease',
                desc: 'Use our integrated shipping partners — Shiprocket & Shippo — for domestic and international orders.',
              },
              {
                step: 4,
                icon: Banknote,
                color: 'bg-purple-100 text-purple-600',
                ring: 'ring-purple-200',
                title: 'Get paid on time',
                desc: 'Receive payouts every settlement cycle directly to your bank. Track everything from your wallet.',
              },
            ].map(({ step, icon: Icon, color, ring, title, desc }) => (
              <div key={step} className="relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-6 pt-10 text-center group">
                {/* Step badge */}
                <div className={`absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full ${color} ring-4 ${ring} flex items-center justify-center font-bold text-sm shadow`}>
                  {step}
                </div>
                <div className={`w-14 h-14 mx-auto rounded-xl ${color} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">STEP {step}: {title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY SELL ON BZEAD — 6 Features ═══ */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-gray-900 mb-3">
            Why sellers choose BZEAD
          </h2>
          <p className="text-center text-gray-500 text-sm sm:text-base max-w-lg mx-auto mb-12">
            Everything you need to run a successful online business, built right in.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[
              { icon: Globe, title: 'Global Reach', desc: 'Sell to buyers in 150+ countries with automatic currency conversion.' },
              { icon: BarChart3, title: 'Live Insights', desc: 'Real-time analytics on views, orders, revenue, and customer trends.' },
              { icon: Headphones, title: 'Dedicated Support', desc: 'Get help from our team anytime — chat, email, or phone.' },
              { icon: ShieldCheck, title: 'Secure Payouts', desc: 'Bank-grade encryption. Settlement paid every cycle, no delays.' },
              { icon: Truck, title: 'Integrated Shipping', desc: 'Shiprocket & Shippo built in. Auto rate calculation & tracking.' },
              { icon: CreditCard, title: 'Low Fees', desc: 'Only 3% platform commission — keep more of what you earn.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-gray-50 border border-gray-100 rounded-xl p-5 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ START SELLING TODAY — CTA Banner ═══ */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-950 to-indigo-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(251,191,36,0.08),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-[0.06]">
          <svg viewBox="0 0 400 400" className="w-full h-full" fill="none"><circle cx="200" cy="200" r="180" stroke="white" strokeWidth="0.5" /><circle cx="200" cy="200" r="120" stroke="white" strokeWidth="0.5" /><circle cx="200" cy="200" r="60" stroke="white" strokeWidth="0.5" /></svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl lg:text-[2.5rem] font-extrabold text-white leading-tight">
                Start selling today
              </h2>
              <p className="mt-4 text-base sm:text-lg text-blue-200/80 max-w-md leading-relaxed">
                Put your products in front of buyers across the world. Sign up free, list in minutes, and let BZEAD handle the rest.
              </p>
              <div className="mt-8">
                <Link
                  to="/seller/signup"
                  className="inline-flex items-center gap-2 h-12 px-8 rounded-lg text-sm font-bold bg-amber-400 text-blue-950 hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/25"
                >
                  <Rocket className="w-4 h-4" /> Create Free Account
                </Link>
              </div>
            </div>
            {/* Right side decorative cards */}
            <div className="hidden lg:flex justify-end">
              <div className="space-y-3 w-full max-w-sm">
                {[
                  { emoji: '🎯', text: 'Zero listing fees' },
                  { emoji: '📊', text: 'Real-time order dashboard' },
                  { emoji: '🔒', text: 'KYC-verified seller community' },
                  { emoji: '🌐', text: 'Multi-currency support' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 backdrop-blur rounded-xl px-5 py-3">
                    <span className="text-xl">{item.emoji}</span>
                    <span className="text-sm text-white/90 font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-blue-950 border-t border-blue-900 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-blue-400/60 text-sm">
          © 2026 BZEAD. All rights reserved by Beauzead Ltd.
        </div>
      </footer>
    </div>
  );
};
