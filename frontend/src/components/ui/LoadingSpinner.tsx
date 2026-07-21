interface LoadingSpinnerProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export default function LoadingSpinner({ fullScreen, size = 'md' }: LoadingSpinnerProps) {
  const spinner = (
    <div className={`animate-spin rounded-full border-2 border-graphite-200 border-t-primary-600 ${sizeClasses[size]}`} />
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {spinner}
      </div>
    );
  }

  return spinner;
}
