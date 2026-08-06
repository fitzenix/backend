import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { fitnessService } from './fitness.service';
import type { AuthedRequest, Ctx } from '../../types/index';

interface CrudSub {
  list(ctx: Ctx): Promise<{ items: unknown[]; page: number; limit: number; total: number }>;
  get(ctx: Ctx, id: string): Promise<unknown>;
  create(ctx: Ctx, data: { memberId?: string; title: string } & Record<string, unknown>): Promise<unknown>;
  update(ctx: Ctx, id: string, data: Record<string, unknown>): Promise<unknown>;
  remove(ctx: Ctx, id: string): Promise<{ deleted: true }>;
}

function crudController(sub: CrudSub) {
  return {
    list: asyncHandler<AuthedRequest>(async (req, res) => {
      const { items, page, limit, total } = await sub.list(req);
      sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
    }),
    get: asyncHandler<AuthedRequest>(async (req, res) => {
      const doc = await sub.get(req, req.params.id);
      sendSuccess(res, { data: doc });
    }),
    create: asyncHandler<AuthedRequest>(async (req, res) => {
      const doc = await sub.create(req, req.body);
      sendCreated(res, { data: doc, message: 'Created' });
    }),
    update: asyncHandler<AuthedRequest>(async (req, res) => {
      const doc = await sub.update(req, req.params.id, req.body);
      sendSuccess(res, { data: doc, message: 'Updated' });
    }),
    remove: asyncHandler<AuthedRequest>(async (req, res) => {
      const result = await sub.remove(req, req.params.id);
      sendSuccess(res, { data: result, message: 'Removed' });
    }),
  };
}

export const workoutController = {
  ...crudController(fitnessService.workouts),
  templates: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await fitnessService.listCustomTemplates(req);
    sendSuccess(res, { data });
  }),
  templateStarters: asyncHandler<AuthedRequest>(async (_req, res) => {
    const data = fitnessService.listBuiltinStarters();
    sendSuccess(res, { data });
  }),
  getTemplate: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await fitnessService.getCustomTemplate(req, req.params.id);
    sendSuccess(res, { data });
  }),
  createTemplate: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await fitnessService.createCustomTemplate(req, req.body);
    sendCreated(res, { data, message: 'Workout template created' });
  }),
  updateTemplate: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await fitnessService.updateCustomTemplate(req, req.params.id, req.body);
    sendSuccess(res, { data, message: 'Workout template updated' });
  }),
  removeTemplate: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await fitnessService.removeCustomTemplate(req, req.params.id);
    sendSuccess(res, { data, message: 'Workout template removed' });
  }),
  bulkAssign: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await fitnessService.bulkAssignWorkouts(req, req.body);
    sendCreated(res, { data, message: `Assigned to ${data.assigned} member(s)` });
  }),
};
export const dietController = crudController(fitnessService.diets);

export const scheduleController = {
  memberSchedule: asyncHandler<AuthedRequest>(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const data = await fitnessService.memberSchedule(req, date);
    sendSuccess(res, { data });
  }),
};

export const progressController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await fitnessService.listProgress(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
  series: asyncHandler<AuthedRequest>(async (req, res) => {
    const q = (req.validatedQuery ?? req.query) as { range?: 'week' | 'month' | 'year'; memberId?: string };
    const data = await fitnessService.progressSeries(req, q.range ?? 'week', q.memberId);
    sendSuccess(res, { data });
  }),
  create: asyncHandler<AuthedRequest>(async (req, res) => {
    const doc = await fitnessService.createProgress(req, req.body);
    sendCreated(res, { data: doc, message: 'Progress logged' });
  }),
  remove: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await fitnessService.removeProgress(req, req.params.id);
    sendSuccess(res, { data: result, message: 'Progress log removed' });
  }),
};
