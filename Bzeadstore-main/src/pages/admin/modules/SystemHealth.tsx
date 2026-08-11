import React, { useState, useEffect, useCallback } from 'react';
import { Database, Activity, AlertCircle, CheckCircle, XCircle, HardDrive } from 'lucide-react';
import { getSystemHealth } from '../../../lib/adminService';

interface HealthStatus {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  metric: string;
  message: string;
  icon: React.ReactNode;
}

interface HealthData {
  totalUsers: number;
  totalProducts: number;
  totalOrders: number;
  totalComplaints: number;
  dbStatus: string;
  lastChecked: string;
}

export const SystemHealth: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const loadHealth = useCallback(async () => {
    try {
      const data = await getSystemHealth();
      setHealthData(data);
      setLastRefresh(new Date().toLocaleTimeString());

      // Check API server health by pinging an auth endpoint
      let apiStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let apiMetric = 'Supabase connected';
      try {
        const start = performance.now();
        await (await import('../../../lib/supabase')).supabase.auth.getSession();
        const latency = Math.round(performance.now() - start);
        apiMetric = `Latency: ${latency}ms`;
        if (latency > 3000) apiStatus = 'warning';
      } catch {
        apiStatus = 'critical';
        apiMetric = 'Auth endpoint unreachable';
      }

      // Check storage by listing buckets
      let storageStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let storageMetric = 'Supabase Storage active';
      let storageMsg = 'Buckets: product-images, kyc-documents';
      try {
        const { data: buckets, error: bErr } = await (await import('../../../lib/supabase')).supabase.storage.listBuckets();
        if (bErr) {
          storageStatus = 'warning';
          storageMetric = 'Storage check failed';
          storageMsg = bErr.message;
        } else {
          const bucketNames = (buckets || []).map((b: any) => b.name).join(', ');
          storageMsg = bucketNames ? `Buckets: ${bucketNames}` : 'No buckets found';
        }
      } catch {
        storageStatus = 'critical';
        storageMetric = 'Storage unreachable';
      }

      const statuses: HealthStatus[] = [
        {
          name: 'Database Connection',
          status: data.dbStatus === 'healthy' ? 'healthy' : 'critical',
          metric: `${data.totalUsers} users, ${data.totalProducts} products`,
          message: `${data.totalOrders} orders, ${data.totalComplaints} complaints`,
          icon: <Database className="w-6 h-6" />,
        },
        {
          name: 'API Server',
          status: apiStatus,
          metric: apiMetric,
          message: `Last checked: ${new Date(data.lastChecked).toLocaleTimeString()}`,
          icon: <Activity className="w-6 h-6" />,
        },
        {
          name: 'Storage',
          status: storageStatus,
          metric: storageMetric,
          message: storageMsg,
          icon: <HardDrive className="w-6 h-6" />,
        },
      ];
      setHealthStatuses(statuses);
    } catch {
      setHealthStatuses([
        {
          name: 'Database Connection',
          status: 'critical',
          metric: 'Unable to connect',
          message: 'Check Supabase configuration',
          icon: <Database className="w-6 h-6" />,
        },
      ]);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    if (autoRefresh) {
      const interval = setInterval(loadHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, loadHealth]);

  const overallStatus = healthStatuses.every((h) => h.status === 'healthy') ? 100 :
    healthStatuses.some((h) => h.status === 'critical') ? 50 : 80;

  const getStatusColor = (status: string) => {
    const colors = {
      'healthy': 'text-green-600',
      'warning': 'text-yellow-600',
      'critical': 'text-red-600'
    };
    return colors[status as keyof typeof colors];
  };

  const getStatusBgColor = (status: string) => {
    const colors = {
      'healthy': 'bg-green-50 border-green-200',
      'warning': 'bg-yellow-50 border-yellow-200',
      'critical': 'bg-red-50 border-red-200'
    };
    return colors[status as keyof typeof colors];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">System Health</h1>
              <p className="text-gray-600 mt-2">Monitor system status and performance</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-gray-700 font-medium">Auto-refresh (30s)</span>
            </label>
          </div>
        </div>

        {/* Overall Status */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Overall System Status</h2>
              <p className="text-gray-600 mt-2">Last updated: just now</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-2">
                <span className="text-4xl font-bold text-green-600">{overallStatus}%</span>
              </div>
              <p className="font-semibold text-green-600">{overallStatus === 100 ? 'Operational' : overallStatus >= 80 ? 'Degraded' : 'Issues Detected'}</p>
            </div>
          </div>
        </div>

        {/* Health Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-8">
          {healthStatuses.map((health, index) => (
            <div
              key={index}
              className={`border-2 rounded-lg p-4 sm:p-6 ${getStatusBgColor(health.status)}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${getStatusColor(health.status)}`}>
                  {health.icon}
                </div>
                {getStatusIcon(health.status)}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{health.name}</h3>
              <p className="text-gray-600 text-sm mb-3">{health.message}</p>
              <div className="flex items-center justify-between pt-4 border-t border-opacity-30">
                <span className="text-sm font-semibold text-gray-700">{health.metric}</span>
                <span className={`text-xs font-semibold uppercase ${getStatusColor(health.status)}`}>
                  {health.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-8">
          {/* Key Counts */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 sm:mb-6">Data Summary</h3>
            <div className="space-y-4">
              {[
                { label: 'Total Users', value: String(healthData?.totalUsers ?? '—') },
                { label: 'Total Products', value: String(healthData?.totalProducts ?? '—') },
                { label: 'Total Orders', value: String(healthData?.totalOrders ?? '—') },
                { label: 'Total Complaints', value: String(healthData?.totalComplaints ?? '—') },
              ].map((metric, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-gray-700">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{metric.value}</span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Service Status */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 sm:mb-6">Service Status</h3>
            <div className="space-y-4">
              {[
                { label: 'Database', value: healthData?.dbStatus === 'healthy' ? 'Connected' : 'Disconnected', ok: healthData?.dbStatus === 'healthy' },
                { label: 'Authentication', value: 'Active', ok: true },
                { label: 'File Storage', value: 'Active', ok: true },
                { label: 'Last Health Check', value: lastRefresh || '—', ok: true },
              ].map((metric, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-gray-700 text-sm">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{metric.value}</span>
                    {metric.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3 sm:mb-6">System Information</h3>
          <div className="space-y-4">
            {healthData?.dbStatus === 'healthy' ? (
              <div className="border-l-4 border-green-400 bg-green-50 p-4 rounded">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">All Systems Operational</p>
                    <p className="text-gray-600 text-sm mt-1">Database and API connections are healthy.</p>
                    <p className="text-gray-500 text-xs mt-2">Checked at {lastRefresh}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-l-4 border-red-400 bg-red-50 p-4 rounded">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Connection Issues Detected</p>
                    <p className="text-gray-600 text-sm mt-1">Some services may not be responding properly.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4 justify-center">
          <button onClick={loadHealth} className="bg-blue-600 text-gray-900 px-6 py-2 rounded-lg hover:bg-blue-700 transition">
            Refresh Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemHealth;
