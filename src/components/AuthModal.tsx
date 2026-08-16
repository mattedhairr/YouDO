import { useEffect, useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, X, AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
}

export function AuthModal({ open, initialMode = 'signin', onClose }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
            },
          },
        });
        if (signUpErr) throw signUpErr;
        setSuccess('✓ Account created successfully! Cloud backup is enabled.');
        setTimeout(onClose, 1200);
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        setSuccess('✓ Signed in successfully!');
        setTimeout(onClose, 800);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay open={open} onClose={onClose} align="center">
      <div className="panel sheet-up p-5 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft border border-primary/30 flex items-center justify-center text-primary font-semibold text-lg shadow-inner">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-content-primary leading-tight">
                {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-[11px] font-medium text-content-secondary">Sync goals &amp; progress safely</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-base p-1 rounded-[12px] border border-subtle mb-4">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mode === 'signin'
                ? 'bg-primary text-on-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            <LogIn size={13} /> Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mode === 'signup'
                ? 'bg-primary text-on-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            <UserPlus size={13} /> Create Account
          </button>
        </div>

        {/* Error / Success Banners */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-error-soft border border-error/30 text-error text-xs font-medium flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-2xl bg-secondary/10 border border-secondary/30 text-secondary text-xs font-medium flex items-start gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-primary mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-content-secondary" />
                <input
                  type="text"
                  required={mode === 'signup'}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aspirant's Name"
                  className="w-full bg-surface border border-subtle rounded-2xl pl-9 pr-3 py-2.5 text-xs text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-primary transition font-medium"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-primary mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-content-secondary" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aspirant@example.com"
                className="w-full bg-surface border border-subtle rounded-2xl pl-9 pr-3 py-2.5 text-xs text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-primary transition font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-primary mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-content-secondary" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface border border-subtle rounded-2xl pl-9 pr-10 py-2.5 text-xs text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-primary transition font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-3 text-content-secondary hover:text-content-primary transition"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : mode === 'signin' ? (
              <>
                <LogIn className="w-4 h-4" />
                Sign In to Account
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Create Free Account
              </>
            )}
          </button>
        </form>
      </div>
    </Overlay>
  );
}
