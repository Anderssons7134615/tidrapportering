import { AlertTriangle, RefreshCw } from 'lucide-react';

export function QueryError({
  title = 'Kunde inte hämta informationen',
  description = 'Kontrollera anslutningen och försök igen.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="border-y border-rose-200 bg-rose-50/70 px-4 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div>
            <p className="font-semibold text-graphite-950">{title}</p>
            <p className="mt-1 text-sm text-graphite-600">{description}</p>
          </div>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-secondary shrink-0 self-start sm:self-auto">
            <RefreshCw className="h-4 w-4" />
            Försök igen
          </button>
        )}
      </div>
    </div>
  );
}
