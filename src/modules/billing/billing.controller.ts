import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/apiResponse';
import { billingService } from './billing.service';
import type { AuthedRequest } from '../../types/index';

export const billingController = {
  plans: asyncHandler(async (_req, res) => {
    sendSuccess(res, { data: billingService.listPlans() });
  }),

  status: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await billingService.status(req);
    sendSuccess(res, { data });
  }),

  checkout: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await billingService.checkout(req, req.body);
    sendCreated(res, { data: result, message: 'Checkout initiated' });
  }),

  verify: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await billingService.verify(req, req.body);
    sendSuccess(res, { data, message: 'Plan activated' });
  }),

  upiCollect: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await billingService.upiCollect(req, req.body);
    sendSuccess(res, { data, message: 'Plan activated via UPI' });
  }),

  complete: asyncHandler(async (req: Request, res: Response) => {
    const { orderId, paymentId, signature } = req.body as {
      orderId?: string;
      paymentId?: string;
      signature?: string;
    };
    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing fields' } });
      return;
    }
    await billingService.settleBySignature(orderId, paymentId, signature);
    sendSuccess(res, { data: { ok: true }, message: 'Plan activated' });
  }),

  checkoutHtml: asyncHandler(async (req: Request, res: Response) => {
    const orderId = String(req.query.orderId ?? '');
    if (!orderId) {
      res.status(400).send('Missing orderId');
      return;
    }
    const page = await billingService.checkoutPage(orderId);
    if ('alreadyPaid' in page) {
      res.type('html').send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"/><body style="background:#000;color:#22c55e;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center"><p>Already paid. Return to the Fitzenix app.</p></body>`,
      );
      return;
    }
    res.type('html').send(page.html);
  }),
};

export default billingController;
