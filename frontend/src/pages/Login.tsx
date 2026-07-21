import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, Loader2, ShieldCheck } from 'lucide-react';
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
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-8 text-graphite-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <section className="order-2 flex flex-col justify-center border-t border-graphite-200 pt-8 lg:order-1 lg:border-r lg:border-t-0 lg:pb-0 lg:pr-12 lg:pt-0">
          <img src="/anderssons-logo.svg" alt="Anderssons Isolering" className="h-14 w-fit object-contain" />
          <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-primary-700">TidApp</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-normal text-graphite-950 sm:text-5xl">
            Tidrapportering som känns rak, tydlig och lätt att lita på.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-graphite-600">
            Samma arbetsflöde för rapportering, veckovy, attest, projekt och löneunderlag. Byggt för att vara snabbt på plats och tydligt på kontoret.
          </p>

          <div className="mt-8 grid gap-3 text-sm leading-6 text-graphite-700 sm:grid-cols-3">
            <p><strong className="block text-graphite-950">Rapportera snabbt</strong>Få in dagens timmar utan onödiga steg.</p>
            <p><strong className="block text-graphite-950">Följ upp jobb</strong>Se risk, budget och senaste aktivitet direkt.</p>
            <p><strong className="block text-graphite-950">Exportera tryggt</strong>Löne- och revisorsunderlag ligger samlat.</p>
          </div>
        </section>

        <section className="order-1 w-full lg:order-2">
          <div className="border-y border-graphite-200 bg-white px-1 py-5 sm:border sm:p-6">
            <div className="mb-6">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary-800">
                <ShieldCheck className="h-4 w-4" />
                Logga in
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-graphite-950">Fortsätt arbetet</h2>
              <p className="mt-1 text-sm text-graphite-500">Använd samma konto på mobil och dator.</p>
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

            <div className="mt-6 border-t border-graphite-200 pt-4 text-sm leading-6 text-graphite-600">
              <p className="flex items-center gap-2 font-semibold text-graphite-950">
                <Clock className="h-4 w-4 text-primary-700" />
                Vecka, attest och rapporter i samma system
              </p>
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
