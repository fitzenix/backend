import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { paymentService } from './payment.service';
import { getPaymentGateway } from '../../services/payments/index';
import { logger } from '../../config/logger';
import type { AuthedRequest } from '../../types/index';

export const paymentController = {
  checkout: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await paymentService.checkout(req, req.body);
    sendCreated(res, { data: result, message: 'Checkout initiated' });
  }),

  verify: asyncHandler<AuthedRequest>(async (req, res) => {
    const payment = await paymentService.verify(req, req.body);
    sendSuccess(res, { data: payment, message: 'Payment verified' });
  }),

  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await paymentService.list(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  refund: asyncHandler<AuthedRequest>(async (req, res) => {
    const payment = await paymentService.refund(req, req.params.id);
    sendSuccess(res, { data: payment, message: 'Payment refunded' });
  }),

  listInvoices: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await paymentService.listInvoices(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  getInvoice: asyncHandler<AuthedRequest>(async (req, res) => {
    const invoice = await paymentService.getInvoice(req, req.params.id);
    sendSuccess(res, { data: invoice });
  }),

  /**
   * Razorpay webhook. Uses the raw body (captured by the JSON parser's verify
   * hook in app.ts) to verify the signature, then processes the event.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const gateway = getPaymentGateway();
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    if (!gateway.verifyWebhookSignature({ rawBody, signature })) {
      logger.warn('Invalid webhook signature');
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid signature' } });
      return;
    }

    await paymentService.handleWebhookEvent(JSON.parse(rawBody));
    res.status(200).json({ success: true, message: 'ok' });
  }),
};

export default paymentController;
