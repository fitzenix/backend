import { z } from 'zod';

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const email = z.string().email().toLowerCase();

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email,
  password,
  phone: z.string().min(6).max(20).optional(),
  gymName: z.string().min(2).max(160),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export const logoutSchema = z.object({ refreshToken: z.string().min(10).optional() });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({
    email,
    otp: z.string().length(6, 'Reset code must be 6 digits'),
    password,
    confirmPassword: password,
  })
  .refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const otpPurpose = z.enum(['login', 'verify_email', 'reset', 'gym_transfer']);
export const requestOtpSchema = z.object({ email, purpose: otpPurpose.default('verify_email') });
export const verifyOtpSchema = z.object({
  email,
  otp: z.string().length(6),
  purpose: otpPurpose.default('verify_email'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type OtpPurpose = z.infer<typeof otpPurpose>;
