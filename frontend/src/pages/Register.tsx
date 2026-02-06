import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { Clock, Loader2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [companyName, setCompanyName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
      setAuth(data.token, data.user);
      toast.success(`Välkommen, ${data.user.name}! Ditt företag är registrerat.`);
      navigate('/');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Lösenorden matchar inte');
      return;
    }
    registerMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <Clock className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-white">TidApp</h1>
          <p className="text-primary-200">Registrera nytt företag</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary-600 mb-2">
            <Building2 className="w-5 h-5" />
            <span className="font-semibold text-sm">Företagsuppgifter</span>
          </div>

          <div>
            <label htmlFor="companyName" className="label">
              Företagsnamn *
            </label>
            <input
              type="text"
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="input"
              placeholder="Mitt Företag AB"
              required
            />
          </div>

          <div>
            <label htmlFor="orgNumber" className="label">
              Org.nummer
            </label>
            <input
              type="text"
              id="orgNumber"
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
              className="input"
              placeholder="556XXX-XXXX"
            />
          </div>

          <hr className="border-gray-200" />

          <div>
            <label htmlFor="name" className="label">
              Ditt namn *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Förnamn Efternamn"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="label">
              E-post *
            </label>
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
            <label htmlFor="password" className="label">
              Lösenord *
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Minst 6 tecken"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="label">
              Bekräfta lösenord *
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="Upprepa lösenord"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="btn-primary w-full py-3"
          >
            {registerMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Registrera företag'
            )}
          </button>
        </form>

        <p className="text-center text-primary-200 text-sm mt-6">
          Har redan ett konto?{' '}
          <Link to="/login" className="text-white underline hover:no-underline">
            Logga in
          </Link>
        </p>
      </div>
    </div>
  );
}
