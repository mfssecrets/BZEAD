import React from 'react';

export interface StateChargeRow {
  state_id: string;
  state_name: string;
  shipping_charge: string;
  expected_delivery_days: string;
}

export interface DomesticShippingData {
  courierTypeId: string;
  shippingChargeTypeId: string;
  shippingChargeTypeName: string;
  flatShippingCharge: string;
  flatDeliveryDays: string;
  stateCharges: StateChargeRow[];
  shipsInternationally: boolean;
}

interface Props {
  data: DomesticShippingData;
  onChange: (data: DomesticShippingData) => void;
  originCountryId: string;
  disabled?: boolean;
}

const DomesticShippingStep: React.FC<Props> = ({ data, onChange, originCountryId, disabled }) => {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900 mb-1">Shipping</h3>

      {!originCountryId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Please select an Origin Country in Step 1 first.
        </div>
      )}

      {originCountryId && (
        <>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <p className="text-sm text-green-800 font-semibold">
              Shipping rates are calculated automatically at checkout based on package weight, dimensions, and buyer location.
            </p>
          </div>

          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold text-gray-900">Ship Internationally?</span>
              <button
                type="button"
                onClick={() => onChange({ ...data, shipsInternationally: true })}
                disabled={disabled}
                className={`px-4 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                  data.shipsInternationally
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...data, shipsInternationally: false })}
                disabled={disabled}
                className={`px-4 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                  !data.shipsInternationally
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                No
              </button>
            </div>

            {data.shipsInternationally && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <p className="text-sm text-green-800 font-semibold">
                  International shipping rates are calculated automatically at checkout. Your product will be available to buyers in all countries.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DomesticShippingStep;
