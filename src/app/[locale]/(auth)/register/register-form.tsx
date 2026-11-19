'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn, getSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError, Select } from '@/components/ui/input';
import { SPECIALTIES } from '@/lib/constants';
import { apiFetch, errorCode } from '@/lib/client';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    fullName: z.string().trim().min(3),
    email: z.string().email(),
    phone: z.string().trim().optional(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    specialty: z.string().optional(),
    licenseNumber: z.string().trim().optional(),
    clinicName: z.string().trim().optional(),
    city: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });

type FormValues = z.infer<typeof schema>;
type RoleChoice = 'PATIENT' | 'DOCTOR';

export function RegisterForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const [role, setRole] = useState<RoleChoice | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      specialty: '',
      licenseNumber: '',
      clinicName: '',
      city: '',
    },
  });

  function chooseRole(value: RoleChoice) {
    setRole(value);
    setStep(2);
  }

  async function onSubmit(values: FormValues) {
    if (!role) return;
    setPending(true);
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        json: {
          role,
          fullName: values.fullName,
          email: values.email,
          phone: values.phone || undefined,
          password: values.password,
          locale,
          specialty: role === 'DOCTOR' ? values.specialty : undefined,
          licenseNumber: role === 'DOCTOR' ? values.licenseNumber : undefined,
          clinicName: role === 'DOCTOR' ? values.clinicName : undefined,
          city: role === 'DOCTOR' ? values.city : undefined,
        },
      });

      const result = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (!result || result.error) {
        toast.success(tc('success'));
        router.push(`/${locale}/login`);
        return;
      }
      await getSession();
      router.replace(`/${locale}/${role === 'DOCTOR' ? 'doctor' : 'patient'}`);
      router.refresh();
    } catch (error) {
      const code = errorCode(error);
      if (code === 'EMAIL_EXISTS') {
        setError('email', { message: te('EMAIL_EXISTS') });
        setStep(2);
      } else {
        toast.error(te(code as 'GENERIC') || tc('error'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[36px] bg-white shadow-card ring-1 ring-white/60">
      <div className="flex flex-col gap-3 border-b border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Logo href={`/${locale}/login`} />
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold',
              step === 1 ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-600',
            )}
          >
            {step > 1 ? <Check className="h-3.5 w-3.5" /> : '1'}
          </span>
          <span className="h-px w-8 bg-primary-200" />
          <span
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold',
              step === 2 ? 'bg-primary-600 text-white' : 'bg-primary-50 text-ink-400',
            )}
          >
            2
          </span>
        </div>
      </div>

      {step === 1 ? (
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-primary-500">{t('registerTitle')}</p>
            <h1 className="mt-2 text-[28px] font-bold tracking-tight">{t('roleTitle')}</h1>
            <p className="mt-2 text-sm text-ink-500">{t('roleSubtitle')}</p>
          </div>

          <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            {(
              [
                {
                  value: 'PATIENT' as const,
                  icon: UserRound,
                  title: t('patientRole'),
                  desc: t('patientRoleDesc'),
                  tone: 'primary',
                },
                {
                  value: 'DOCTOR' as const,
                  icon: Stethoscope,
                  title: t('doctorRole'),
                  desc: t('doctorRoleDesc'),
                  tone: 'accent',
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseRole(option.value)}
                className={cn(
                  'group relative overflow-hidden rounded-3xl p-6 text-start ring-1 transition-all duration-200 hover:-translate-y-1 hover:shadow-soft',
                  role === option.value
                    ? 'bg-primary-50 ring-primary-300'
                    : 'bg-primary-50/40 ring-line hover:bg-primary-50',
                )}
              >
                <span
                  className={cn(
                    'grid h-14 w-14 place-items-center rounded-2xl',
                    option.tone === 'accent' ? 'bg-accent-100 text-accent-500' : 'bg-primary-100 text-primary-600',
                  )}
                >
                  <option.icon className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-lg font-bold">{option.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{option.desc}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600">
                  {t('createAccount')}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                </span>
                {role === option.value ? (
                  <span className="absolute end-4 top-4 grid h-6 w-6 place-items-center rounded-full bg-primary-600 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-ink-500">
            {t('haveAccount')}{' '}
            <Link href={`/${locale}/login`} className="font-semibold text-primary-600 hover:text-primary-800">
              {t('loginCta')}
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_1.15fr]">
          <div className="hidden bg-gradient-to-br from-primary-50 to-white p-8 lg:block">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-800"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {tc('back')}
            </button>

            <div className="mt-8 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line">
              <span
                className={cn(
                  'grid h-12 w-12 place-items-center rounded-2xl',
                  role === 'DOCTOR' ? 'bg-accent-100 text-accent-500' : 'bg-primary-100 text-primary-600',
                )}
              >
                {role === 'DOCTOR' ? <Stethoscope className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
              </span>
              <h2 className="mt-4 text-lg font-bold">
                {role === 'DOCTOR' ? t('doctorRole') : t('patientRole')}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                {role === 'DOCTOR' ? t('doctorRoleDesc') : t('patientRoleDesc')}
              </p>
              <div className="mt-5 space-y-2.5">
                {(role === 'DOCTOR'
                  ? [t('specialty'), t('licenseNumber'), t('clinicName')]
                  : [t('email'), t('phone'), t('passwordHint')]
                ).map((item) => (
                  <div key={item} className="flex items-center gap-2 text-[11px] font-medium text-ink-500">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-50 text-primary-500">
                      <Check className="h-3 w-3" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-primary-100/60 p-3.5">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
              <p className="text-[10px] leading-relaxed text-primary-800/70">{t('secureBody')}</p>
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-800 lg:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {tc('back')}
            </button>

            <p className="eyebrow text-primary-500">{t('registerTitle')}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {role === 'DOCTOR' ? t('doctorRole') : t('patientRole')}
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">{t('registerSubtitle')}</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
              <div>
                <Label htmlFor="fullName" required>
                  {t('fullName')}
                </Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                  <Input id="fullName" className="ps-11" placeholder="Ahmed Berrada" {...register('fullName')} />
                </div>
                <FieldError>{errors.fullName ? tc('required') : undefined}</FieldError>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="email" required>
                    {t('email')}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                    <Input
                      id="email"
                      type="email"
                      className="ps-11"
                      placeholder="vous@exemple.com"
                      {...register('email')}
                    />
                  </div>
                  <FieldError>{errors.email ? tc('required') : undefined}</FieldError>
                </div>
                <div>
                  <Label htmlFor="phone">{t('phone')}</Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                    <Input id="phone" className="ps-11" placeholder="+212 6…" {...register('phone')} />
                  </div>
                </div>
              </div>

              {role === 'DOCTOR' ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="specialty" required>
                        {t('specialty')}
                      </Label>
                      <Select id="specialty" {...register('specialty')}>
                        <option value="">—</option>
                        {SPECIALTIES.map((specialty) => (
                          <option key={specialty} value={specialty}>
                            {specialty}
                          </option>
                        ))}
                      </Select>
                      <FieldError>{errors.specialty ? tc('required') : undefined}</FieldError>
                    </div>
                    <div>
                      <Label htmlFor="licenseNumber">{t('licenseNumber')}</Label>
                      <div className="relative">
                        <BadgeCheck className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                        <Input id="licenseNumber" className="ps-11" placeholder="MA-10452" {...register('licenseNumber')} />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="clinicName">{t('clinicName')}</Label>
                      <div className="relative">
                        <Building2 className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                        <Input id="clinicName" className="ps-11" placeholder="Cabinet…" {...register('clinicName')} />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="city">{t('city')}</Label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                        <Input id="city" className="ps-11" placeholder="Casablanca" {...register('city')} />
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="password" required>
                    {t('password')}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...register('password')}
                  />
                  <p className="mt-1.5 text-[10px] text-ink-400">{t('passwordHint')}</p>
                  <FieldError>{errors.password ? t('weakPassword') : undefined}</FieldError>
                </div>
                <div>
                  <Label htmlFor="confirmPassword" required>
                    {t('confirmPassword')}
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...register('confirmPassword')}
                  />
                  <FieldError>{errors.confirmPassword ? t('passwordMismatch') : undefined}</FieldError>
                </div>
              </div>

              <p className="flex items-start gap-2 rounded-2xl bg-primary-50/70 p-3 text-[10px] leading-relaxed text-ink-500">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
                {t('accept')}
              </p>

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || !role}>
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('registering')}
                  </>
                ) : (
                  <>
                    {t('registerCta')}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-ink-500">
                {t('haveAccount')}{' '}
                <Link href={`/${locale}/login`} className="font-semibold text-primary-600 hover:text-primary-800">
                  {t('loginCta')}
                </Link>
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
