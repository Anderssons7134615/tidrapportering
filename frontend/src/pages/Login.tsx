import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Building2 } from 'lucide-react';
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
    <main className="flex min-h-[100dvh] items-center justify-center bg-graphite-50 px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-graphite-200 bg-white p-6 sm:p-8" aria-label="Inloggning">
          <div>
            <div className="mb-6">
              <Building2 className="mb-4 h-7 w-7 text-primary-700" aria-hidden="true" />
              <h1 className="text-2xl font-semibold text-graphite-950">Anderssons Isolering</h1>
              <p className="mt-2 text-sm text-graphite-600">Logga in för att se dina projekt och rapportera tid.</p>
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
    </main>
  );
}
