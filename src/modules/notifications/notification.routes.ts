import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate } from '../../middleware/auth';
import { requireActiveGym } from '../../middleware/gymAccess';
import { validate } from '../../middleware/validate';
import { idParam } from '../../validators/common';
import { sendLimiter } from '../../middleware/rateLimit';
import {
  registerDeviceSchema,
  deleteDeviceSchema,
  sendNotificationSchema,
  bulkSendSchema,
  topicSendSchema,
  scheduleSchema,
  preferencesSchema,
  analyticsQuery,
  trackSchema,
  listNotificationsQuery,
} from './notification.validation';

const router = Router();

router.use(authenticate, requireActiveGym);

// Static paths first (before /:id)
router.get('/', validate({ query: listNotificationsQuery }), notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.post('/read-all', notificationController.markAllRead);
router.get('/preferences', notificationController.getPreferences);
router.patch('/preferences', validate({ body: preferencesSchema }), notificationController.updatePreferences);
router.get('/analytics', validate({ query: analyticsQuery }), notificationController.analytics);

router.post('/devices', validate({ body: registerDeviceSchema }), notificationController.registerDevice);
router.delete('/devices', validate({ body: deleteDeviceSchema }), notificationController.deleteDevice);

router.post('/send', sendLimiter, validate({ body: sendNotificationSchema }), notificationController.send);
router.post('/send/bulk', sendLimiter, validate({ body: bulkSendSchema }), notificationController.sendBulk);
router.post('/send/topic', sendLimiter, validate({ body: topicSendSchema }), notificationController.sendTopic);
router.post('/schedule', sendLimiter, validate({ body: scheduleSchema }), notificationController.schedule);

// Param routes last
router.patch('/:id/read', validate({ params: idParam }), notificationController.markRead);
router.post('/:id/track', validate({ params: idParam, body: trackSchema }), notificationController.track);
router.delete('/:id', validate({ params: idParam }), notificationController.remove);

export default router;
