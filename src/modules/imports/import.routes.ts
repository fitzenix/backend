import { Router } from 'express';
import { importController } from './import.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { requireActiveGym } from '../../middleware/gymAccess';
import { uploadSpreadsheet } from '../../middleware/upload';
import { ROLES } from '../../config/constants';

const router = Router();

router.use(authenticate, resolveTenant, requireTenant, requireActiveGym);
router.use(authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER));

router.get('/template.:kind', importController.downloadTemplate);
router.post('/members', uploadSpreadsheet('file'), importController.importMembers);

export default router;
