import React from 'react';
import { Plus, Trash2, Gift, ShoppingCart, Loader2 } from 'lucide-react';
import { confirmOnce } from '../../../utils/confirmOnce';
import type { Country } from '../../../lib/shippingDataService';

// ---------- Types ----------

export interface SpecialDayOffer {
  id: string;
  specialDayName: string;
  discountPercent: string;
  startDate: string;
  endDate: string;
}

export interface QuantityOffer {
  id: string;
  offerType: 'buy_x_get_y' | 'bundle_discount';
  buyQuantity: string;
  getQuantity: string;
  discountPercent: string;
  bundleMinQty: string;
  bundleDiscount: string;
}

export interface OffersData {
  specialDayOffers: SpecialDayOffer[];
  quantityOffers: QuantityOffer[];
  ingredients: string[];
  directions: string;
  manufacturer_name: string;
  manufacturer_country: string;
  important_note: string;
}

interface Props {
  data: OffersData;
  onChange: (data: OffersData) => void;
  disabled?: boolean;
  isPrimeSeller?: boolean;
  allCountries: Country[];
}

let counter = 0;
const uid = () => `offer-${++counter}`;
const MAX_OFFER_RULES = 5;

const SPECIAL_DAYS = [
  'New Year',
  'Valentine\'s Day',
  'Holi',
  'Easter',
  'Eid',
  'Mother\'s Day',
  'Father\'s Day',
  'Independence Day',
  'Raksha Bandhan',
  'Diwali',
  'Navratri',
  'Halloween',
  'Black Friday',
  'Cyber Monday',
  'Christmas',
  'Boxing Day',
  'Republic Day',
  'Custom',
];

const OffersStep: React.FC<Props> = ({ data, onChange, disabled, isPrimeSeller = false, allCountries }) => {
  void isPrimeSeller;
  const [nowTs] = React.useState(() => Date.now());

  const totalRules = data.specialDayOffers.length + data.quantityOffers.length;
  const reachedOfferLimit = totalRules >= MAX_OFFER_RULES;

  const sanitizeInteger = (value: string) => value.replace(/[^0-9]/g, '');

  // ----- Ingredient helpers -----
  const addIngredient = () => {
    if (data.ingredients.length >= 50) return;
    onChange({ ...data, ingredients: [...data.ingredients, ''] });
  };
  const updateIngredient = (index: number, value: string) => {
    const next = [...data.ingredients];
    next[index] = value;
    onChange({ ...data, ingredients: next });
  };
  const removeIngredient = (index: number) => {
    onChange({ ...data, ingredients: data.ingredients.filter((_, i) => i !== index) });
  };

  // ----- Special Day Offers -----
  const addSpecialDay = () => {
    if (reachedOfferLimit) return;
    onChange({
      ...data,
      specialDayOffers: [
        ...data.specialDayOffers,
        { id: uid(), specialDayName: '', discountPercent: '', startDate: '', endDate: '' },
      ],
    });
  };

  const removeSpecialDay = (id: string) => {
    if (!confirmOnce('Delete this special day offer rule?')) return;
    onChange({ ...data, specialDayOffers: data.specialDayOffers.filter((o) => o.id !== id) });
  };

  const updateSpecialDay = (id: string, field: keyof SpecialDayOffer, value: string) => {
    onChange({
      ...data,
      specialDayOffers: data.specialDayOffers.map((o) =>
        o.id === id ? { ...o, [field]: value } : o
      ),
    });
  };

  // ----- Quantity / Bundle Offers -----
  const addQuantityOffer = () => {
    if (reachedOfferLimit) return;
    onChange({
      ...data,
      quantityOffers: [
        ...data.quantityOffers,
        {
          id: uid(),
          offerType: 'buy_x_get_y',
          buyQuantity: '',
          getQuantity: '',
          discountPercent: '',
          bundleMinQty: '',
          bundleDiscount: '',
        },
      ],
    });
  };

  const removeQuantityOffer = (id: string) => {
    if (!confirmOnce('Delete this quantity offer rule?')) return;
    onChange({ ...data, quantityOffers: data.quantityOffers.filter((o) => o.id !== id) });
  };

  const updateQuantityOffer = (id: string, field: keyof QuantityOffer, value: string) => {
    onChange({
      ...data,
      quantityOffers: data.quantityOffers.map((o) =>
        o.id === id ? { ...o, [field]: value } : o
      ),
    });
  };

  // Validate dates — must be at least 48 hours in the future
  const getMinStartDate = () => {
    const d = new Date();
    d.setHours(d.getHours() + 48);
    return d.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-8">

      {/* ==================== PRODUCT CONTENT ==================== */}
      <div className="space-y-6 pb-8 border-b border-gray-200">
        <div className="flex justify-center">
          <div className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-sm">Product Content</div>
        </div>

        {/* Manufacturer Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Manufacturer Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.manufacturer_name}
            onChange={(e) => onChange({ ...data, manufacturer_name: e.target.value })}
            placeholder="Enter manufacturer name"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">Auto-filled from KYC when available, and editable.</p>
        </div>

        {/* Manufacturer Country */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Manufacturer Country <span className="text-red-500">*</span>
          </label>
          {allCountries.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
              <Loader2 size={16} className="animate-spin" /> Loading countries...
            </div>
          ) : (
            <select
              value={data.manufacturer_country}
              onChange={(e) => onChange({ ...data, manufacturer_country: e.target.value })}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
              disabled={disabled}
            >
              <option value="">Select Manufacturer Country</option>
              {allCountries.map((c) => (
                <option key={c.id} value={c.country_name}>{c.country_name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Ingredients */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Ingredients <span className="text-gray-500 text-xs">(Max 50)</span>
          </label>
          <div className="space-y-2">
            {data.ingredients.map((ingredient, index) => (
              <div key={`ingredient-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ingredient}
                  onChange={(e) => updateIngredient(index, e.target.value)}
                  placeholder={`Ingredient ${index + 1}`}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(index)}
                  disabled={disabled}
                  className="p-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  aria-label={`Remove ingredient ${index + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addIngredient}
              disabled={disabled || data.ingredients.length >= 50}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg text-sm font-semibold text-blue-600 hover:border-blue-500 disabled:opacity-50"
            >
              <Plus size={16} /> Add Ingredient
            </button>
            <p className="text-xs text-gray-500">{data.ingredients.length}/50 ingredient rows added.</p>
          </div>
        </div>

        {/* Directions */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Directions <span className="text-gray-500 text-xs">(Max 1000 chars)</span>
          </label>
          <textarea
            value={data.directions}
            onChange={(e) => onChange({ ...data, directions: e.target.value.slice(0, 1000) })}
            placeholder="Usage directions, preparation method, or application steps..."
            maxLength={1000}
            rows={4}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">{data.directions.length}/1000 characters</p>
        </div>

        {/* Important Note */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Important Note <span className="text-gray-500 text-xs">(Max 1000 chars)</span>
          </label>
          <textarea
            value={data.important_note}
            onChange={(e) => onChange({ ...data, important_note: e.target.value.slice(0, 1000) })}
            placeholder="Important caution, storage warning, or buyer note..."
            maxLength={1000}
            rows={4}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">{data.important_note.length}/1000 characters</p>
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">Offers & Discounts</h3>
      <p className="text-xs text-gray-500 mb-4">
        Add special day offers and quantity-wise deals for your product.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        You can add up to {MAX_OFFER_RULES} offer rules per product.
      </div>

      {/* ==================== SPECIAL DAY OFFERS ==================== */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
          <Gift size={16} className="text-blue-500" /> Day-based Offers
        </label>

        {data.specialDayOffers.map((offer) => (
          <div key={offer.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Special Day Offer</span>
              <button
                type="button"
                onClick={() => removeSpecialDay(offer.id)}
                disabled={disabled}
                className="text-blue-600 hover:text-blue-800 transition-colors p-2"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">Special Day</label>
                <select
                  value={offer.specialDayName}
                  onChange={(e) => updateSpecialDay(offer.id, 'specialDayName', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                  disabled={disabled}
                >
                  <option value="">Select a day</option>
                  {SPECIAL_DAYS.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">Discount %</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={offer.discountPercent}
                  onChange={(e) => updateSpecialDay(offer.id, 'discountPercent', sanitizeInteger(e.target.value))}
                  placeholder="e.g. 15"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  disabled={disabled}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={offer.startDate}
                  onChange={(e) => updateSpecialDay(offer.id, 'startDate', e.target.value)}
                  min={getMinStartDate()}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  disabled={disabled}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={offer.endDate}
                  onChange={(e) => updateSpecialDay(offer.id, 'endDate', e.target.value)}
                  min={offer.startDate || getMinStartDate()}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  disabled={disabled}
                />
              </div>
            </div>

            {/* 48-hour rule warning */}
            {offer.startDate && new Date(offer.startDate).getTime() - nowTs < 48 * 60 * 60 * 1000 && (
              <p className="text-xs text-red-500">
                Offer must start at least 48 hours from now.
              </p>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addSpecialDay}
          disabled={disabled || reachedOfferLimit}
          className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-blue-600 hover:border-blue-500 hover:text-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={16} /> Add Special Day Offer
        </button>
      </div>

      {/* ==================== QUANTITY-WISE OFFERS ==================== */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
          <ShoppingCart size={16} className="text-blue-500" /> Quantity-wise Offers
        </label>
        <>
            {data.quantityOffers.map((offer) => (
              <div key={offer.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Quantity Offer</span>
                  <button
                    type="button"
                    onClick={() => removeQuantityOffer(offer.id)}
                    disabled={disabled}
                    className="text-blue-600 hover:text-blue-800 transition-colors p-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Offer Type Toggle */}
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Offer Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantityOffer(offer.id, 'offerType', 'buy_x_get_y')}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                        offer.offerType === 'buy_x_get_y'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                      disabled={disabled}
                    >
                      Buy X Get Y Free
                    </button>
                    <button
                      type="button"
                      onClick={() => updateQuantityOffer(offer.id, 'offerType', 'bundle_discount')}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                        offer.offerType === 'bundle_discount'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                      disabled={disabled}
                    >
                      Bundle Discount
                    </button>
                  </div>
                </div>

                {offer.offerType === 'buy_x_get_y' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Buy Quantity</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={offer.buyQuantity}
                        onChange={(e) => updateQuantityOffer(offer.id, 'buyQuantity', sanitizeInteger(e.target.value))}
                        placeholder="e.g. 2"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Get Free</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={offer.getQuantity}
                        onChange={(e) => updateQuantityOffer(offer.id, 'getQuantity', sanitizeInteger(e.target.value))}
                        placeholder="e.g. 1"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Discount %</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={offer.discountPercent}
                        onChange={(e) => updateQuantityOffer(offer.id, 'discountPercent', sanitizeInteger(e.target.value))}
                        placeholder="e.g. 100 (free)"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Minimum Quantity</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={offer.bundleMinQty}
                        onChange={(e) => updateQuantityOffer(offer.id, 'bundleMinQty', sanitizeInteger(e.target.value))}
                        placeholder="e.g. 5"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Bundle Discount %</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={offer.bundleDiscount}
                        onChange={(e) => updateQuantityOffer(offer.id, 'bundleDiscount', sanitizeInteger(e.target.value))}
                        placeholder="e.g. 10"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addQuantityOffer}
              disabled={disabled || reachedOfferLimit}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-blue-600 hover:border-blue-500 hover:text-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Add Quantity Offer
            </button>
        </>
      </div>
    </div>
  );
};

export default OffersStep;
