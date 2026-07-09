import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export default function Register() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setAuth } = useAuthStore();
  const [companyName, setCompanyName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { data: registrationStatus, isLoading: isLoadingRegistrationStatus } = useQuery({
    queryKey: ['registration-status'],
    queryFn: authApi.registrationStatus,
    staleTime: Infinity,
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      authApi.register({
        companyName,
        orgNumber: orgNumber || undefined,
        name,
        email,
        password,
      }),
    onSuccess: (data) => {
      queryClient.clear();
      setAuth(data.token, data.user);
      toast.success(`Välkommen, ${data.user.name}! Ditt företag är registrerat.`);
      navigate('/');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Lösenorden matchar inte');
      return;
    }
    registerMutation.mutate();
  };

  if (!isLoadingRegistrationStatus && !registrationStatus?.enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 text-graphite-900">
        <section className="w-full max-w-lg border-y border-graphite-200 bg-white px-5 py-8 text-center sm:border">
          <ShieldCheck className="mx-auto h-6 w-6 text-primary-700" />
          <h1 className="mt-3 text-2xl font-semibold text-graphite-950">Registrering är avstängd</h1>
          <p className="mt-2 text-sm leading-6 text-graphite-600">Nya konton skapas av administratören i TidApp.</p>
          <Link to="/login" className="btn-primary mt-5 inline-flex">Till inloggningen</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-8 text-graphite-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
        <section className="border-b border-graphite-200 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-12">
          <img src="/anderssons-logo.svg" alt="Anderssons Isolering" className="h-14 w-fit object-contain" />
          <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-primary-700">Nytt konto</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-normal text-graphite-950 sm:text-5xl">
            Starta TidApp för företaget.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-graphite-600">
            Skapa företaget, lägg till administratören och fortsätt sedan direkt in i samma rena arbetsyta som används för projekt, tid och rapporter.
          </p>

          <dl className="mt-8 space-y-3 text-sm leading-6 text-graphite-700">
            <div className="border-t border-graphite-200 pt-3">
              <dt className="font-semibold text-graphite-950">1. Företagsuppgifter</dt>
              <dd>Företagsnamn och organisationsnummer.</dd>
            </div>
            <div className="border-t border-graphite-200 pt-3">
              <dt className="font-semibold text-graphite-950">2. Administratör</dt>
              <dd>Den första användaren får åtkomst direkt efter registrering.</dd>
            </div>
          </dl>
        </section>

        <section className="w-full">
          <form onSubmit={handleSubmit} className="border-y border-graphite-200 bg-white px-1 py-5 sm:border sm:p-6">
            <div className="mb-5">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary-800">
                <Building2 className="h-4 w-4" />
                Registrera företag
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-graphite-950">Företag och konto</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="companyName" className="label">Företagsnamn *</label>
                <input
                  type="text"
                  id="companyName"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="input"
                  placeholder="Mitt Företag AB"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="orgNumber" className="label">Org.nummer</label>
                <input
                  type="text"
                  id="orgNumber"
                  value={orgNumber}
                  onChange={(event) => setOrgNumber(event.target.value)}
                  className="input"
                  placeholder="556XXX-XXXX"
                />
              </div>

              <div className="md:col-span-2 border-t border-graphite-200 pt-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-950">
                  <ShieldCheck className="h-4 w-4 text-primary-700" />
                  Administratör
                </p>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="name" className="label">Ditt namn *</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input"
                  placeholder="Förnamn Efternamn"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="email" className="label">E-post *</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input"
                  placeholder="din@email.se"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Lösenord *</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input"
                  placeholder="Minst 6 tecken"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="label">Bekräfta lösenord *</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="input"
                  placeholder="Upprepa lösenord"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="btn-primary mt-5 w-full py-3"
            >
              {registerMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Registrera företag'}
            </button>

            <p className="mt-5 text-center text-sm text-graphite-500">
              Har redan ett konto?{' '}
              <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-600">
                Logga in
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
