import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { LoginDto, Role } from '@hotel/shared';
import { useTranslation } from 'react-i18next';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const ROLE_REDIRECTS: Record<Role, string> = {
  [Role.ADMIN]: '/dashboard',
  [Role.RECEPTIONIST]: '/dashboard',
  [Role.MAINTENANCE]: '/tickets',
  [Role.FINANCE]: '/reports',
};

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginDto>({
    resolver: zodResolver(schema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginDto) => api.post('/auth/login', data),
    onSuccess: (res) => {
      queryClient.setQueryData(['auth', 'me'], res.data.user);
      navigate(ROLE_REDIRECTS[res.data.user.role as Role] ?? '/dashboard');
    },
    onError: () => toast.error('Invalid email or password'),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-primary">LuxStay Admin</h1>
          <p className="text-sm text-on-surface-variant mt-1">{t('auth.login')}</p>
        </div>
        <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-primary mb-1">
              {t('auth.email')}
            </label>
            <input
              {...register('email')}
              type="email"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            />
            {errors.email && <p className="text-error text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary mb-1">
              {t('auth.password')}
            </label>
            <input
              {...register('password')}
              type="password"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            />
            {errors.password && <p className="text-error text-xs mt-1">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-primary hover:bg-primary-container text-on-primary font-semibold rounded-lg py-2 text-sm transition disabled:opacity-60"
          >
            {loginMutation.isPending ? t('common.loading') : t('auth.loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
