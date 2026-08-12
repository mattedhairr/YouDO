import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { StoreProvider } from './store';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed with ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0D0B14] text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-slate-100 mb-2">Something went wrong</h2>
          <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
            An unhandled runtime error occurred on startup: {this.state.error?.message || 'Unknown error'}
          </p>
          <div className="flex gap-3 w-full max-w-xs">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-bold text-xs text-white transition"
            >
              Reload App
            </button>
            <button
              onClick={this.handleReset}
              className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-xs text-slate-300 transition"
            >
              Reset Data
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <AuthProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthProvider>
    </GlobalErrorBoundary>
  </StrictMode>
);

// Only register Service Worker on HTTP/HTTPS web origins, NOT in native Capacitor WebViews (capacitor:// / file://)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
