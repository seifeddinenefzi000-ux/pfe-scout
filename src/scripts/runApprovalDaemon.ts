import 'dotenv/config';
import { telegramApprovalListener } from '../services/TelegramApprovalListener.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

console.log('=====================================================================');
console.log('🤖 PFE SCOUT — TELEGRAM APPROVAL DAEMON');
console.log('=====================================================================');
console.log(`Bot Token: ${env.TELEGRAM_BOT_TOKEN ? '✓ Configured' : '❌ Missing'}`);
console.log(`Chat ID:   ${env.TELEGRAM_CHAT_ID}`);
console.log(`SMTP User: ${env.SMTP_USER}`);
console.log('---------------------------------------------------------------------');
console.log('Listening for Telegram button clicks (Approve / Reject)...');
console.log('Press Ctrl+C to terminate daemon.\n');

telegramApprovalListener.startPolling();

// Keep process alive indefinitely
setInterval(() => {
  // Heartbeat logging every 10 minutes
}, 600000);

process.on('SIGINT', () => {
  logger.info('Stopping Telegram approval listener daemon...');
  telegramApprovalListener.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Terminating Telegram approval listener daemon...');
  telegramApprovalListener.stopPolling();
  process.exit(0);
});
