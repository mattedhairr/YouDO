import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { StoreProvider } from './store';
import { AuthProvider } from './contexts/AuthContext';
import { clearYouDoStorage } from './lib/storageKeys';
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
    clearYouDoStorage();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-base text-content-primary flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-error-soft border border-error/20 flex items-center justify-center text-error mb-4">
            ⚠️
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">Something went wrong</h2>
          <p className="text-xs text-content-secondary max-w-xs mb-6 leading-relaxed">
            An unhandled runtime error occurred on startup: {this.state.error?.message || 'Unknown error'}
          </p>
          <div className="flex gap-3 w-full max-w-xs">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-primary-glow font-bold text-xs text-white transition"
            >
              Reload App
            </button>
            <button
              onClick={this.handleReset}
              className="flex-1 py-3 px-4 rounded-xl bg-surface hover:bg-elevated border border-subtle font-bold text-xs text-content-primary transition"
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
