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
    <div aria-hidden="true" className={`animate-spin rounded-full border-2 border-graphite-200 border-t-primary-600 motion-reduce:animate-none ${sizeClasses[size]}`} />
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        {spinner}
        <span className="sr-only">Laddar innehåll</span>
      </div>
    );
  }

  return <span className="inline-flex" role="status" aria-live="polite">{spinner}<span className="sr-only">Laddar</span></span>;
}
