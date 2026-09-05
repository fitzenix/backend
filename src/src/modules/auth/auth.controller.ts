import type { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/apiResponse';
import { authService, type RequestContext } from './auth.service';
import { transferService } from '../users/transfer.service';
import type { AuthedRequest } from '../../types/index';

const ctxOf = (req: Request): RequestContext => ({ userAgent: req.headers['user-agent'], ip: req.ip });

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, ctxOf(req));
    sendCreated(res, { data: result, message: 'Account created. Verify your email to sign in.' });
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, ctxOf(req));
    sendSuccess(res, { data: result, message: 'Logged in' });
  }),

  refresh: asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body, ctxOf(req));
    sendSuccess(res, { data: result, message: 'Token refreshed' });
  }),

  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.body);
    sendSuccess(res, { message: 'Logged out' });
  }),

  logoutAll: asyncHandler<AuthedRequest>(async (req, res) => {
    await authService.logoutAll(req.user._id);
    sendSuccess(res, { message: 'Logged out from all devices' });
  }),

  me: asyncHandler<AuthedRequest>(async (req, res) => {
    sendSuccess(res, { data: req.user, message: 'Current user' });
  }),

  changePassword: asyncHandler<AuthedRequest>(async (req, res) => {
    await authService.changePassword(req.user, req.body);
    sendSuccess(res, { message: 'Password changed' });
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body);
    sendSuccess(res, { data: result, message: 'Reset code sent to your email' });
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body);
    sendSuccess(res, { message: 'Password reset successful' });
  }),

  requestOtp: asyncHandler(async (req, res) => {
    const result = await authService.requestOtp(req.body);
    sendSuccess(res, { data: result, message: 'If the account exists, a code was emailed' });
  }),

  verifyOtp: asyncHandler(async (req, res) => {
    const result = await authService.verifyOtp(req.body, ctxOf(req));
    sendSuccess(res, { data: result, message: 'OTP verified' });
  }),

  pendingTransfers: asyncHandler<AuthedRequest>(async (req, res) => {
    const items = await transferService.pendingForMember(req.user._id);
    sendSuccess(res, { data: items });
  }),

  acceptTransfer: asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await transferService.accept(req.params.id, req.user);
    sendSuccess(res, { data: user, message: 'Gym transfer confirmed. Sign in again to use your new gym.' });
  }),

  declineTransfer: asyncHandler<AuthedRequest>(async (req, res) => {
    await transferService.decline(req.params.id, req.user);
    sendSuccess(res, { message: 'Gym transfer declined' });
  }),

  resendTransferOtp: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await transferService.resendOtp(req.params.id, req.user._id);
    sendSuccess(res, { data: result, message: 'A new confirmation code was emailed' });
  }),
};

export default authController;
