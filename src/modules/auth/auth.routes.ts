import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from './auth.validators';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', validate({ body: logoutSchema }), authController.logout);

router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), authController.resetPassword);
router.post('/otp/request', authLimiter, validate({ body: requestOtpSchema }), authController.requestOtp);
router.post('/otp/verify', authLimiter, validate({ body: verifyOtpSchema }), authController.verifyOtp);

router.get('/me', authenticate, authController.me);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), authController.changePassword);
router.post('/logout-all', authenticate, authController.logoutAll);

export default router;
