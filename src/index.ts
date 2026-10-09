import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { telegramApprovalListener } from './services/TelegramApprovalListener.js';

logger.info('🚀 Atlas InternAI Engine Initialized');
logger.info(`Mode: ${env.NODE_ENV} | Log Level: ${env.LOG_LEVEL}`);
logger.info(`Supabase Target: ${env.SUPABASE_URL}`);
logger.info(`Max Gemini Calls/Run: ${env.MAX_GEMINI_CALLS_PER_RUN}`);

// Start real-time Telegram approval click listener
telegramApprovalListener.startPolling();
