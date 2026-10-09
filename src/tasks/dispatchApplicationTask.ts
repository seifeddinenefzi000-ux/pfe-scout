import { task } from '@trigger.dev/sdk';
import { emailSenderService, SendApplicationOptions } from '../services/EmailSenderService.js';
import { logger } from '../utils/logger.js';

export const dispatchApplicationTask = task({
  id: 'dispatch-application',

  run: async (payload: SendApplicationOptions) => {
    logger.info(`Processing application dispatch request to: ${payload.to}`, {
      subject: payload.subject,
      cv: payload.cvFileName,
      applicationId: payload.applicationId,
    });

    const result = await emailSenderService.sendApplicationEmail(payload);

    if (!result.success) {
      throw new Error(`Email dispatch failed: ${result.error}`);
    }

    return {
      status: 'SENT',
      recipient: payload.to,
      messageId: result.messageId,
      cvAttached: payload.cvFileName,
    };
  },
});
