import { env } from '../../config/env';
import { DemoRequest, type DemoRequestDocument } from './demoRequest.model';
import type { CreateDemoRequestInput } from './demoRequest.validators';
import { mailService } from '../../services/mail/mail.service';
import {
  demoRequestAcknowledgementEmail,
  demoRequestLeadEmail,
} from '../../services/mail/templates';

export const demoRequestService = {
  async create(input: CreateDemoRequestInput): Promise<DemoRequestDocument> {
    const demoRequest = await DemoRequest.create({ ...input, source: 'website' });

    void Promise.all([
      mailService.send(
        demoRequest.email,
        demoRequestAcknowledgementEmail({ name: demoRequest.name, gymName: demoRequest.gymName }),
      ),
      mailService.send(env.app.leadsEmail, demoRequestLeadEmail(demoRequest)),
    ]);

    return demoRequest;
  },
};

export default demoRequestService;