import { task } from '@trigger.dev/sdk';
import { telegramApprovalListener } from '../services/TelegramApprovalListener.js';
import { logger } from '../utils/logger.js';

export const processTelegramActionsTask = task({
  id: 'process-telegram-actions',

  run: async () => {
    logger.info('Checking for pending Telegram approval/rejection button clicks...');
    const processedCount = await telegramApprovalListener.processUpdatesOnce();
    return {
      processedActions: processedCount,
    };
  },
});
