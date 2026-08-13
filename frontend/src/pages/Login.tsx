import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { data: registrationStatus } = useQuery({
    queryKey: ['registration-status'],
    queryFn: authApi.registrationStatus,
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: (data) => {
      setFormError(null);
      queryClient.clear();
      setAuth(data.token, data.user);
      toast.success(`Välkommen, ${data.user.name}!`);
      navigate('/');
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast.error(error.message);
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    loginMutation.mutate();
  };

  return (
    <main className="login-shell">
      <div className="login-frame">
        <section className="login-brand-panel order-2 lg:order-1">
          <div className="relative z-10">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white text-primary-800" aria-hidden="true"><Building2 className="h-5 w-5" /></div>
            <p className="mt-12 text-sm font-semibold text-primary-100">Arbetsyta</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              Arbetstid. Projekt. Kontroll.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/68 sm:text-lg">
              Ett arbetsverktyg byggt för platsen, kontoret och ett tryggt löneunderlag.
            </p>
          </div>

          <div className="relative z-10 mt-12 max-w-xl space-y-0 divide-y divide-white/10 lg:mt-20">
            {[
              'Rapportera dagens timmar utan onödiga steg',
              'Följ projekt, budget och aktivitet i samma vy',
              'Ta fram attest och underlag med full spårbarhet',
            ].map((item) => (
              <p key={item} className="flex items-center gap-3 py-3.5 text-sm font-semibold text-white/80">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-300" strokeWidth={2} />
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className="login-form-panel order-1 lg:order-2">
          <div className="login-form-surface">
            <div className="mb-6">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-primary-800">
                <ShieldCheck className="h-4 w-4" />
                Säker inloggning
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-graphite-950">Välkommen tillbaka</h2>
              <p className="mt-2 text-sm leading-6 text-graphite-600">Logga in med samma konto på mobil och dator.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && <p role="alert" className="border-y border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{formError}</p>}
              <div>
                <label htmlFor="email" className="label">E-post</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input"
                  placeholder="din@email.se"
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(formError)}
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Lösenord</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input"
                  placeholder="Minst 6 tecken"
                  required
                  autoComplete="current-password"
                  aria-invalid={Boolean(formError)}
                />
              </div>

              <button type="submit" disabled={loginMutation.isPending} className="btn-primary w-full py-3">
                {loginMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    Logga in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-2 border-t border-graphite-200 pt-4 text-sm font-semibold text-graphite-600">
              <Clock className="h-4 w-4 text-primary-600" />
              Din arbetsdag samlad på ett ställe
            </div>

            {registrationStatus?.enabled && (
              <p className="mt-5 text-center text-sm text-graphite-500">
                Nytt företag?{' '}
                <Link to="/register" className="font-semibold text-primary-700 hover:text-primary-600">
                  Registrera er här
                </Link>
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
