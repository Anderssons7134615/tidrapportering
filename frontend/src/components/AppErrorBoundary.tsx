import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TidApp kunde inte visa sidan', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#eef2f1] px-4 py-8">
        <div className="w-full max-w-lg rounded-lg border border-rose-200 bg-white px-5 py-6" role="alert">
          <h1 className="text-xl font-semibold text-graphite-950">Sidan kunde inte visas</h1>
          <p className="mt-2 text-sm leading-6 text-graphite-700">
            Ett oväntat fel uppstod. Ladda om och kontrollera aktuell status innan du försöker igen.
          </p>
          <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>
            Ladda om sidan
          </button>
        </div>
      </main>
    );
  }
}
