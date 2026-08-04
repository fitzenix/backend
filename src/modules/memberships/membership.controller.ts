import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { membershipService } from './membership.service';
import type { AuthedRequest } from '../../types/index';

export const membershipController = {
  // Plans
  listPlans: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await membershipService.listPlans(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
  createPlan: asyncHandler<AuthedRequest>(async (req, res) => {
    const plan = await membershipService.createPlan(req, req.body);
    sendCreated(res, { data: plan, message: 'Plan created' });
  }),
  getPlan: asyncHandler<AuthedRequest>(async (req, res) => {
    const plan = await membershipService.getPlan(req, req.params.id);
    sendSuccess(res, { data: plan });
  }),
  updatePlan: asyncHandler<AuthedRequest>(async (req, res) => {
    const plan = await membershipService.updatePlan(req, req.params.id, req.body);
    sendSuccess(res, { data: plan, message: 'Plan updated' });
  }),
  removePlan: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await membershipService.removePlan(req, req.params.id);
    sendSuccess(res, { data: result, message: 'Plan removed' });
  }),

  // Subscriptions
  listSubscriptions: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await membershipService.listSubscriptions(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
  createSubscription: asyncHandler<AuthedRequest>(async (req, res) => {
    const sub = await membershipService.createSubscription(req, req.body);
    sendCreated(res, { data: sub, message: 'Subscription created' });
  }),
  cancelSubscription: asyncHandler<AuthedRequest>(async (req, res) => {
    const sub = await membershipService.cancelSubscription(req, req.params.id);
    sendSuccess(res, { data: sub, message: 'Subscription cancelled' });
  }),
  myCurrent: asyncHandler<AuthedRequest>(async (req, res) => {
    const sub = await membershipService.currentForMember(req, req.user._id);
    sendSuccess(res, { data: sub });
  }),
  myPlan: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await membershipService.myPlan(req);
    sendSuccess(res, { data });
  }),
};

export default membershipController;
