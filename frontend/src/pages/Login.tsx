import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Clock, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      toast.success(`Valkommen, ${data.user.name}!`);
      navigate('/');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const highlights = [
    'Snabb tidrapportering i mobilen',
    'Veckooversikt och attest i samma flode',
    'Offline-stod nar du jobbar ute pa plats',
  ];

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hero-card flex flex-col justify-between">
          <div>
            <div className="inline-flex rounded-2xl bg-slate-900 p-3 text-white shadow-lg shadow-slate-900/10">
              <Clock className="h-7 w-7" />
            </div>
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">TidApp</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Enkel tidrapportering for hantverksteam.
              </h1>
              <p className="mt-4 max-w-xl text-base text-slate-600">
                Samla rapportering, veckovy, attest och projektlage i ett lugnare arbetsflode som fungerar bra pa byggmoten, i bilen och pa kontoret.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="soft-panel p-4">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Tryggt flode</p>
              <p className="mt-1 text-sm text-slate-500">Spara lokalt och synka nar uppkopplingen ar tillbaka.</p>
            </div>
            <div className="soft-panel p-4">
              <Sparkles className="h-5 w-5 text-primary-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Fa klick</p>
              <p className="mt-1 text-sm text-slate-500">Byggt for snabb registrering med tydliga val.</p>
            </div>
            <div className="soft-panel p-4">
              <ArrowRight className="h-5 w-5 text-amber-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Direkt vidare</p>
              <p className="mt-1 text-sm text-slate-500">Ga fran rapportering till veckovy utan att leta.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Logga in</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Fortsatt dar du slutade</h2>
              <p className="mt-2 text-sm text-slate-500">Anvand samma konto pa mobil och dator.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="label">E-post</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="din@email.se"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Losenord</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" disabled={loginMutation.isPending} className="btn-primary w-full py-3">
                {loginMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Logga in'}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Det har far du</p>
              <div className="mt-3 space-y-2">
                {highlights.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-primary-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
              Nytt foretag?{' '}
              <Link to="/register" className="font-semibold text-primary-700 hover:text-primary-600">
                Registrera er har
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
