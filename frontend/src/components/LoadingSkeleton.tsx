import React from 'react';

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full divide-y divide-slate-100 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-4 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-1/3">
            <div className="w-8 h-8 rounded-full bg-slate-200"></div>
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 bg-slate-200 rounded w-4/5"></div>
              <div className="h-2.5 bg-slate-100 rounded w-1/2"></div>
            </div>
          </div>
          <div className="h-3 bg-slate-200 rounded w-1/4"></div>
          <div className="h-6 bg-slate-100 rounded-full w-20"></div>
          <div className="h-4 bg-slate-200 rounded w-16"></div>
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm animate-pulse space-y-3">
      <div className="flex justify-between items-center">
        <div className="h-3 bg-slate-200 rounded w-24"></div>
        <div className="w-8 h-8 rounded-lg bg-slate-100"></div>
      </div>
      <div className="h-7 bg-slate-200 rounded w-16"></div>
      <div className="h-2.5 bg-slate-100 rounded w-32"></div>
    </div>
  );
};
