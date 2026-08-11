import React from 'react';
import { Skeleton, TableSkeleton } from '../../../components/common/Skeleton';

interface LoadingProps {
  message?: string;
}

// Neutral content-fetch skeleton. Most consumers are data tables, so we render
// a few header bars followed by a table placeholder. The original message is
// preserved for screen readers via an sr-only live region.
export const Loading: React.FC<LoadingProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="min-h-[400px] space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{message}</span>
      <div className="flex items-center gap-3">
        <Skeleton rounded="md" className="h-7 w-7" />
        <Skeleton rounded="sm" className="h-5 w-48" />
      </div>
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
};

export const ErrorMessage: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      {message}
    </div>
  );
};

export const SuccessMessage: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
      {message}
    </div>
  );
};

export default { Loading, ErrorMessage, SuccessMessage };
