import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { demoRequestLimiter } from '../../middleware/rateLimit';
import { demoRequestController } from './demoRequest.controller';
import { createDemoRequestSchema } from './demoRequest.validators';

const router = Router();

router.post('/', demoRequestLimiter, validate({ body: createDemoRequestSchema }), demoRequestController.create);

export default router;