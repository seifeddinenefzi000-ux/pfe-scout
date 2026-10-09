import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { emailSenderService } from './EmailSenderService.js';
import { getSupabaseClient } from '../database/client.js';

export class TelegramApprovalListener {
  private offset = 0;
  private isPolling = false;
  private supabase = getSupabaseClient();

  private get botUrl(): string {
    return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  /**
   * Process a batch of Telegram updates
   */
  async processUpdatesOnce(): Promise<number> {
    if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === 'mock-bot-token') {
      return 0;
    }

    try {
      const response = await axios.get(`${this.botUrl}/getUpdates`, {
        params: {
          offset: this.offset,
          timeout: 5,
        },
      });

      const updates = response.data.result || [];
      for (const update of updates) {
        this.offset = update.update_id + 1;

        if (update.callback_query) {
          await this.handleCallbackQuery(update.callback_query);
        }
      }

      return updates.length;
    } catch (err) {
      logger.error('Error polling Telegram updates', { error: String(err) });
      return 0;
    }
  }

  private async handleCallbackQuery(callbackQuery: any): Promise<void> {
    const callbackData = callbackQuery.data as string;
    const messageId = callbackQuery.message?.message_id;
    const chatId = callbackQuery.message?.chat?.id;

    if (!callbackData) return;

    // Acknowledge the callback immediately to remove loading spinner in Telegram
    try {
      await axios.post(`${this.botUrl}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
      });
    } catch {}

    if (callbackData.startsWith('approve_')) {
      const appId = callbackData.replace('approve_', '');
      logger.info(`Telegram approval received for application: ${appId}`);

      // Fetch application from Supabase
      try {
        const { data: application } = await this.supabase
          .from('applications')
          .select('*')
          .eq('id', appId)
          .single();

        if (application) {
          const cvFileName = `${application.cv_track_used}.pdf`;
          const sendResult = await emailSenderService.sendApplicationEmail({
            applicationId: application.id,
            to: application.contact_info,
            subject: application.email_subject,
            bodyText: application.letter_content,
            cvFileName: cvFileName,
          });

          const statusText = sendResult.success
            ? `✅ <b>Candidature envoyée avec succès par email !</b>\n📧 <i>Destinataire :</i> ${application.contact_info}\n📄 <i>CV Joint :</i> <code>${cvFileName}</code>`
            : `⚠️ <b>Échec de l'envoi email :</b> ${sendResult.error}`;

          await axios.post(`${this.botUrl}/sendMessage`, {
            chat_id: chatId,
            text: statusText,
            parse_mode: 'HTML',
            reply_to_message_id: messageId,
          });
        } else {
          await axios.post(`${this.botUrl}/sendMessage`, {
            chat_id: chatId,
            text: `✅ <b>Candidature ${appId} approuvée !</b> Préparation de l'envoi en cours.`,
            parse_mode: 'HTML',
            reply_to_message_id: messageId,
          });
        }
      } catch (err) {
        logger.error('Error handling approval callback', { error: String(err) });
      }
    } else if (callbackData.startsWith('reject_')) {
      const appId = callbackData.replace('reject_', '');
      logger.info(`Telegram rejection received for application: ${appId}`);

      try {
        await this.supabase
          .from('applications')
          .update({ status: 'REJECTED' })
          .eq('id', appId);

        await axios.post(`${this.botUrl}/sendMessage`, {
          chat_id: chatId,
          text: `❌ <i>Candidature rejetée et archivée.</i>`,
          parse_mode: 'HTML',
          reply_to_message_id: messageId,
        });
      } catch {}
    }
  }
}

export const telegramApprovalListener = new TelegramApprovalListener();
