interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const variantClasses = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  return (
    <div
      className={`animate-pulse bg-slate-200 ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton width={200} height={28} className="mb-2" />
        <Skeleton width={180} height={16} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <div className="flex items-center gap-3">
              <Skeleton variant="rectangular" width={40} height={40} />
              <div className="space-y-2">
                <Skeleton width={60} height={24} />
                <Skeleton width={80} height={12} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Week overview */}
      <div className="card">
        <Skeleton width={140} height={20} className="mb-4" />
        <div className="grid grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} variant="rectangular" height={60} />
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <Skeleton variant="rectangular" height={72} />
        <Skeleton variant="rectangular" height={72} />
      </div>
    </div>
  );
}

export function WeekViewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="text-center space-y-2">
          <Skeleton width={100} height={24} className="mx-auto" />
          <Skeleton width={160} height={16} className="mx-auto" />
        </div>
        <Skeleton variant="circular" width={40} height={40} />
      </div>

      {/* Summary card */}
      <div className="card">
        <Skeleton width={80} height={14} className="mb-3" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton width={70} height={28} />
            <Skeleton width={60} height={14} />
          </div>
          <div className="space-y-2">
            <Skeleton width={70} height={28} />
            <Skeleton width={80} height={14} />
          </div>
        </div>
      </div>

      {/* Day cards */}
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Skeleton width={70} height={16} />
              <Skeleton width={30} height={14} />
            </div>
            <Skeleton width={40} height={16} />
          </div>
          {i <= 5 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <div className="space-y-1.5">
                  <Skeleton width={120} height={14} />
                  <Skeleton width={80} height={12} />
                </div>
                <Skeleton width={30} height={16} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      {/* Title + button */}
      <div className="flex items-center justify-between">
        <Skeleton width={140} height={28} />
        <Skeleton variant="rectangular" width={40} height={40} />
      </div>

      {/* List items */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton variant="rectangular" width={36} height={36} />
                <div className="space-y-2">
                  <Skeleton width={140 + Math.random() * 60} height={16} />
                  <Skeleton width={100 + Math.random() * 40} height={12} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton width={50} height={14} />
                <Skeleton variant="circular" width={28} height={28} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApprovalSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton width={120} height={28} />

      <div>
        <Skeleton width={80} height={18} className="mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton width={130} height={16} />
                  <Skeleton width={100} height={14} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right space-y-1">
                    <Skeleton width={50} height={16} />
                    <Skeleton width={70} height={12} />
                  </div>
                  <Skeleton variant="circular" width={24} height={24} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton width={160} height={28} />

      {/* Password card */}
      <div className="card space-y-4">
        <Skeleton width={120} height={20} />
        <div className="space-y-3">
          <Skeleton variant="rectangular" height={40} />
          <Skeleton variant="rectangular" height={40} />
          <Skeleton variant="rectangular" height={40} />
        </div>
        <Skeleton variant="rectangular" width={140} height={40} />
      </div>

      {/* Company card */}
      <div className="card space-y-4">
        <Skeleton width={180} height={20} />
        <Skeleton variant="rectangular" height={40} />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton variant="rectangular" height={40} />
          <Skeleton variant="rectangular" height={40} />
        </div>
        <Skeleton variant="rectangular" width={140} height={40} />
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <div className="space-y-2">
            <Skeleton width={130} height={16} />
            <Skeleton width={90} height={12} />
          </div>
          <Skeleton width={60} height={20} />
        </div>
      ))}
    </div>
  );
}
