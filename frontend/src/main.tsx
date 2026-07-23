import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { RefreshCw, X } from 'lucide-react';
import App from './App';
import './index.css';

const APP_UPDATE_EVENT = 'tidapp:update-ready';
let updateAvailable = false;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updateAvailable = true;
    window.dispatchEvent(new Event(APP_UPDATE_EVENT));
  });

  window.addEventListener('load', () => {
    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then((registration) => {
        registration?.update().catch(() => {});
      });
    };

    checkForUpdate();
    setInterval(checkForUpdate, 5 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
  });
}

function AppUpdateNotice() {
  const [visible, setVisible] = useState(updateAvailable);

  useEffect(() => {
    const showNotice = () => setVisible(true);
    if (updateAvailable) showNotice();
    window.addEventListener(APP_UPDATE_EVENT, showNotice);
    return () => window.removeEventListener(APP_UPDATE_EVENT, showNotice);
  }, []);

  if (!visible) return null;

  return (
    <div className="app-update-notice" role="status" aria-live="polite">
      <button type="button" onClick={() => setVisible(false)} className="app-update-dismiss" aria-label="Stäng uppdateringsmeddelande" title="Stäng">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div>
        <p className="font-semibold">En ny version av TidApp är klar</p>
        <p className="mt-1 text-sm text-white/75">Ladda om när du har sparat det du arbetar med.</p>
      </div>
      <button type="button" onClick={() => window.location.reload()} className="app-update-action">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Ladda om
      </button>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <AppUpdateNotice />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1a1a1a',
              color: '#fff',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
