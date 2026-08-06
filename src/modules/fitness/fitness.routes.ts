import { Router } from 'express';
import { workoutController, dietController, progressController, scheduleController } from './fitness.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
import {
  listQuery,
  createWorkoutSchema,
  bulkAssignWorkoutSchema,
  updateWorkoutSchema,
  createWorkoutTemplateSchema,
  updateWorkoutTemplateSchema,
  createDietSchema,
  updateDietSchema,
  createProgressSchema,
  progressSeriesQuery,
} from './fitness.validators';

const router = Router();
const STAFF = [ROLES.SUPER_ADMIN, ROLES.GYM_OWNER, ROLES.TRAINER] as const;

router.use(authenticate, resolveTenant, requireTenant);

// Member schedule (trainer plan OR default weekly rotation from MongoDB)
router.get('/member-schedule', scheduleController.memberSchedule);

// Custom workout templates + starters + bulk assign (before :id routes)
router.get('/workout-templates', authorize(...STAFF), workoutController.templates);
router.get('/workout-templates/starters', authorize(...STAFF), workoutController.templateStarters);
router.post(
  '/workout-templates',
  authorize(...STAFF),
  validate({ body: createWorkoutTemplateSchema }),
  workoutController.createTemplate,
);
router.get(
  '/workout-templates/:id',
  authorize(...STAFF),
  validate({ params: idParam }),
  workoutController.getTemplate,
);
router.patch(
  '/workout-templates/:id',
  authorize(...STAFF),
  validate({ params: idParam, body: updateWorkoutTemplateSchema }),
  workoutController.updateTemplate,
);
router.delete(
  '/workout-templates/:id',
  authorize(...STAFF),
  validate({ params: idParam }),
  workoutController.removeTemplate,
);
router.post(
  '/workouts/bulk',
  authorize(...STAFF),
  validate({ body: bulkAssignWorkoutSchema }),
  workoutController.bulkAssign,
);

// Workout plans
router.get('/workouts', validate({ query: listQuery }), workoutController.list);
router.get('/workouts/:id', validate({ params: idParam }), workoutController.get);
router.post('/workouts', authorize(...STAFF), validate({ body: createWorkoutSchema }), workoutController.create);
router.patch('/workouts/:id', authorize(...STAFF), validate({ params: idParam, body: updateWorkoutSchema }), workoutController.update);
router.delete('/workouts/:id', authorize(...STAFF), validate({ params: idParam }), workoutController.remove);

// Diet plans
router.get('/diets', validate({ query: listQuery }), dietController.list);
router.get('/diets/:id', validate({ params: idParam }), dietController.get);
router.post('/diets', authorize(...STAFF), validate({ body: createDietSchema }), dietController.create);
router.patch('/diets/:id', authorize(...STAFF), validate({ params: idParam, body: updateDietSchema }), dietController.update);
router.delete('/diets/:id', authorize(...STAFF), validate({ params: idParam }), dietController.remove);

// Progress logs (series before :id)
router.get('/progress/series', validate({ query: progressSeriesQuery }), progressController.series);
router.get('/progress', validate({ query: listQuery }), progressController.list);
router.post('/progress', validate({ body: createProgressSchema }), progressController.create);
router.delete('/progress/:id', validate({ params: idParam }), progressController.remove);

export default router;
