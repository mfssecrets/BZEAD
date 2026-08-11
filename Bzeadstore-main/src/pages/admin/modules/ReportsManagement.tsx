import React, { useState, useEffect } from 'react';
import { ErrorMessage, SuccessMessage } from '../components/StatusIndicators';
import * as adminApiService from '../../../lib/adminService';
import { supabase } from '../../../lib/supabase';

export const ReportsManagement: React.FC = () => {
  const [reportType, setReportType] = useState('sales');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [format, setFormat] = useState<'csv' | 'excel' | 'pdf'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [countries, setCountries] = useState<{ id: string; country_name: string }[]>([]);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (data) setCategories(data);
        else if (err) console.error('Failed to load categories:', err.message);
      });
    supabase
      .from('countries')
      .select('id, country_name')
      .order('country_name', { ascending: true })
      .then(({ data, error: err }) => {
        if (data) setCountries(data);
        else if (err) console.error('Failed to load countries:', err.message);
      });
  }, []);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const blob = await adminApiService.generateReport({
        type: reportType,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        format,
        category: category || undefined,
        country: country || undefined,
      });

      if (!blob) {
        setError('Failed to generate report');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bzead-${reportType}-report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setSuccess('Report generated and downloaded successfully');
    } catch (_err) {
      setError('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900">Reports</h2>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
            >
              <option value="sales">Sales</option>
              <option value="orders">Orders</option>
              <option value="users">Users</option>
              <option value="sellers">Sellers</option>
              <option value="products">Products</option>
              <option value="finance">Finance</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c.id} value={c.country_name}>{c.country_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'csv' | 'excel' | 'pdf')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-black"
            >
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleGenerate}
            disabled={loading || (!!startDate && !endDate) || (!startDate && !!endDate) || (!!startDate && !!endDate && startDate > endDate)}
            className="px-6 py-2 bg-blue-900 text-white font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportsManagement;
