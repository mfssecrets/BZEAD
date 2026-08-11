import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StorefrontHeader } from '../components/layout/StorefrontHeader';
import { MegaMenu } from '../components/layout/MegaMenu';
import { HeroCarousel } from '../components/layout/HeroCarousel';
import { Footer } from '../components/layout/Footer';
import { WelcomeBackBar } from '../components/layout/WelcomeBackBar';
import { Categories } from '../components/layout/Categories';
import { MobileNav } from '../components/layout/MobileNav';
import { VideoAdsBanner } from '../components/layout/VideoAdsBanner';
import { ProductCard } from '../components/products/ProductCard';
import type { HeaderDetectedLocation } from '../components/layout/Header';
import {
  getActiveSponsoredProductsBySection,
} from '../lib/sponsoredProductsService';
import { fetchPublicProductPrices } from '../lib/pricingService';
import { fetchProductsBySection } from '../lib/productService';

/** Max products shown per homepage section row (Featured / Hot Deals / Trending). */
const HOMEPAGE_SECTION_MAX = 100;
import { useDestinationCountry } from '../hooks/useDestinationCountry';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';

const AdBanner: React.FC<{ src: string; alt: string; link?: string }> = ({ src, alt, link }) => {
  const img = (
    <img
      src={src}
      alt={alt}
      className="w-full rounded-xl shadow-sm"
      style={{ maxHeight: '150px', objectFit: 'cover' }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
  return link ? <a href={link}>{img}</a> : img;
};

/** Auto-rotating ad banner carousel — rotates every 7s if more than one banner */
const AdBannerCarousel: React.FC<{ banners: { id: string; src: string; alt: string; link?: string }[] }> = ({ banners }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setCurrent((p) => (p + 1) % banners.length), 7000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="w-full my-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative overflow-hidden rounded-xl">
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {banners.map((b) => (
            <div key={b.id} className="w-full flex-shrink-0">
              <AdBanner src={b.src} alt={b.alt} link={b.link} />
            </div>
          ))}
        </div>
        {banners.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-amber-500 w-4' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ProductSectionRow: React.FC<{
  title: string;
  products: Product[];
  seeMoreLink: string;
  publicPriceMap: Record<string, number>;
  publicMrpMap: Record<string, number>;
  publicPriceLoading?: boolean;
  loading?: boolean;
  maxVisible?: number;
  isSponsored?: boolean;
}> = ({ title, products, seeMoreLink, publicPriceMap, publicMrpMap, publicPriceLoading = false, loading, maxVisible = 8, isSponsored = false }) => (
  <div className="py-6">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
          {isSponsored && (
            <span className="bg-red-600 text-white text-[9px] leading-none font-semibold uppercase tracking-wide px-1.5 py-1 rounded">
              Sponsored
            </span>
          )}
          <Link
            to={seeMoreLink}
            className="flex items-center space-x-2 text-amber-600 hover:text-amber-700 transition-colors"
          >
            <span className="text-sm font-medium">See More</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl animate-pulse aspect-[4/5]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No products yet</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {products.slice(0, maxVisible).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              publicUnitPrice={publicPriceMap[product.id]}
              markupMrp={publicMrpMap[product.id]}
              priceLoading={publicPriceLoading}
            />
          ))}
        </div>
      )}
    </div>
  </div>
);

export const BzeadHomePage: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const isLoggedIn = !!user;

  const [featured, setFeatured] = useState<Product[]>([]);
  const [deals, setDeals] = useState<Product[]>([]);
  const [trending, setTrending] = useState<Product[]>([]);
  const [publicPriceMap, setPublicPriceMap] = useState<Record<string, number>>({});
  const [publicMrpMap, setPublicMrpMap] = useState<Record<string, number>>({});
  const [publicPriceLoading, setPublicPriceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasSponsored, setHasSponsored] = useState(false);
  type AdItem = { id: string; src: string; alt: string; link: string };
  const [adSlot1, setAdSlot1] = useState<AdItem[]>([]);
  const [adSlot2, setAdSlot2] = useState<AdItem[]>([]);
  const [adSlot3, setAdSlot3] = useState<AdItem[]>([]);
  const [detectedCountry, setDetectedCountry] = useState(() => {
    const cached = localStorage.getItem('beauzead_detected_country');
    return cached || '';
  });

  const handleLocationDetected = (location: HeaderDetectedLocation) => {
    setDetectedCountry(location.country || '');
  };

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  }) || detectedCountry;

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setInterval> | null = null;

    const loadSponsored = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      const active = await getActiveSponsoredProductsBySection();

      const noSponsoredData =
        active.featured.length === 0 &&
        active['hot-deals'].length === 0 &&
        active.trending.length === 0;

      if (noSponsoredData) {
        const [featuredFallback, dealsFallback, trendingFallback] = await Promise.all([
          fetchProductsBySection('featured', HOMEPAGE_SECTION_MAX),
          fetchProductsBySection('hot-deals', HOMEPAGE_SECTION_MAX),
          fetchProductsBySection('trending', HOMEPAGE_SECTION_MAX),
        ]);

        if (!cancelled) {
          setFeatured((featuredFallback.data || []) as Product[]);
          setDeals((dealsFallback.data || []) as Product[]);
          setTrending((trendingFallback.data || []) as Product[]);
          setHasSponsored(false);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setFeatured(active.featured);
        setDeals(active['hot-deals']);
        setTrending(active.trending);
        setHasSponsored(true);
        setLoading(false);
      }
    };

    (async () => {
      await loadSponsored(true);
      timerId = setInterval(() => {
        void loadSponsored(false);
      }, 60000);
    })();

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    supabase
      .from('banners')
      .select('id, title, image_url, link, ad_slot')
      .eq('is_active', true)
      .eq('banner_type', 'ad')
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const toItem = (b: any): AdItem => ({ id: b.id, src: b.image_url, alt: b.title, link: b.link || '' });
        setAdSlot1(data.filter((b) => b.ad_slot === 1).map(toItem));
        setAdSlot2(data.filter((b) => b.ad_slot === 2).map(toItem));
        setAdSlot3(data.filter((b) => b.ad_slot === 3).map(toItem));
      });
  }, []);

  useEffect(() => {
    const loadPublicPrices = async () => {
      if (!selectedCountry) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(true);
        return;
      }

      const productIds = Array.from(new Set([
        ...featured.map((product) => product.id),
        ...deals.map((product) => product.id),
        ...trending.map((product) => product.id),
      ]));

      if (productIds.length === 0) {
        setPublicPriceMap({});
        setPublicMrpMap({});
        setPublicPriceLoading(false);
        return;
      }

      setPublicPriceLoading(true);
      const { data } = await fetchPublicProductPrices(productIds, selectedCountry);

      const map: Record<string, number> = {};
      const mrpMap: Record<string, number> = {};
      (data || []).forEach((item) => {
        map[item.productId] = item.publicUnitPrice;
        if (item.markupMrp > 0) mrpMap[item.productId] = item.markupMrp;
      });

      setPublicPriceMap(map);
      setPublicMrpMap(mrpMap);
      setPublicPriceLoading(false);
    };

    void loadPublicPrices();
  }, [featured, deals, trending, selectedCountry]);

  const featuredMax = Math.min(featured.length, HOMEPAGE_SECTION_MAX);
  const dealsMax = Math.min(deals.length, HOMEPAGE_SECTION_MAX);
  const trendingMax = Math.min(trending.length, HOMEPAGE_SECTION_MAX);

  return (
    // overflow-x-clip (not -hidden) prevents this wrapper from becoming a scroll container,
    // which would otherwise demote the sticky <Header> inside it (sticky needs a non-scrolling ancestor).
    <div className="min-h-screen bg-white pb-16 md:pb-0 overflow-x-clip">
      <StorefrontHeader enableLocationAutoDetect onLocationDetected={handleLocationDetected} />

      {/* Categories Mega Menu */}
      <MegaMenu />

      {/* Hero Carousel */}
      <HeroCarousel />

      <WelcomeBackBar
        isLoggedIn={isLoggedIn}
        displayName={user?.full_name || user?.email?.split('@')[0] || 'User'}
      />

      {/* Category Shortcuts - properly aligned with other sections */}
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <Categories />
      </div>

      {/* Featured Products */}
      <ProductSectionRow
        title="Featured Products"
        products={featured}
        seeMoreLink="/products/featured"
        publicPriceMap={publicPriceMap}
        publicMrpMap={publicMrpMap}
        publicPriceLoading={publicPriceLoading}
        loading={loading}
        maxVisible={featuredMax}
        isSponsored={hasSponsored}
      />

      {/* Ad Banner Slot 1 */}
      <AdBannerCarousel banners={adSlot1} />

      {/* Hot Deals */}
      <ProductSectionRow
        title="Hot Deals 🔥"
        products={deals}
        seeMoreLink="/products/hot-deals"
        publicPriceMap={publicPriceMap}
        publicMrpMap={publicMrpMap}
        publicPriceLoading={publicPriceLoading}
        loading={loading}
        maxVisible={dealsMax}
        isSponsored={hasSponsored}
      />

      {/* Ad Banner Slot 2 */}
      <AdBannerCarousel banners={adSlot2} />

      {/* Trending Deals */}
      <ProductSectionRow
        title="Trending Now 📈"
        products={trending}
        seeMoreLink="/products/section/trending"
        publicPriceMap={publicPriceMap}
        publicMrpMap={publicMrpMap}
        publicPriceLoading={publicPriceLoading}
        loading={loading}
        maxVisible={trendingMax}
        isSponsored={hasSponsored}
      />

      {/* Ad Banner Slot 3 */}
      <AdBannerCarousel banners={adSlot3} />

      {/* Become a Seller CTA - Only show for guests and regular users */}
      {(!isLoggedIn || user?.role === 'user') && (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 py-16 my-8 rounded-none">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-black mb-4">
            Start Selling on BZEAD
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of successful sellers and grow your business globally
          </p>
          <Link
            to="/seller"
            className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white text-lg px-5 py-3 rounded-lg font-semibold transition-colors"
          >
            Get Started Now
          </Link>
        </div>
      </div>
      )}

      {/* Video Ads — above footer */}
      <VideoAdsBanner />

      {/* Footer */}
      <Footer />

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};
