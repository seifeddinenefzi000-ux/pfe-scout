import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { emailSenderService } from './EmailSenderService.js';
import { getSupabaseClient } from '../database/client.js';

export class TelegramApprovalListener {
  private offset = 0;
  private supabase = getSupabaseClient();

  private get botUrl(): string {
    return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  /**
   * Process pending Telegram updates
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
    const originalText = callbackQuery.message?.text || '';

    if (!callbackData) return;

    // Acknowledge the callback immediately
    try {
      await axios.post(`${this.botUrl}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
      });
    } catch {}

    const timestamp = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

    if (callbackData.startsWith('approve_')) {
      const appId = callbackData.replace('approve_', '');
      logger.info(`Telegram approval received for application: ${appId}`);

      try {
        const { data: application } = await this.supabase
          .from('applications')
          .select('*')
          .eq('id', appId)
          .single();

        let recipient = application?.contact_info || 'Destinataire';
        let cvName = application ? `${application.cv_track_used}.pdf` : 'CV_Seif_Energies_Renouvelables.pdf';
        let sendSuccess = true;

        if (application && application.contact_info?.includes('@')) {
          const sendResult = await emailSenderService.sendApplicationEmail({
            applicationId: application.id,
            to: application.contact_info,
            subject: application.email_subject,
            bodyText: application.letter_content,
            cvFileName: cvName,
          });
          sendSuccess = sendResult.success;
        }

        const updatedCard = `
✅ <b>CANDIDATURE ENVOYÉE AVEC SUCCÈS !</b>

📧 <b>Destinataire :</b> <code>${this.escapeHtml(recipient)}</code>
📄 <b>CV joint :</b> <code>${this.escapeHtml(cvName)}</code>
📤 <b>Expéditeur :</b> <code>${this.escapeHtml(env.SMTP_USER)}</code>
⏰ <b>Date d'envoi :</b> <i>${timestamp}</i>

<pre>${this.escapeHtml(originalText.substring(0, 300))}...</pre>
`.trim();

        // Edit the message in-place on Telegram and remove buttons
        await axios.post(`${this.botUrl}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: updatedCard,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        });
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

        const updatedCard = `
❌ <b>CANDIDATURE REJETÉE ET ARCHIVÉE</b>

📁 <i>Cette opportunité a été classée dans votre dossier fermé et ne sera plus proposée.</i>
⏰ <b>Date :</b> <i>${timestamp}</i>

<pre>${this.escapeHtml(originalText.substring(0, 300))}...</pre>
`.trim();

        // Edit the message in-place on Telegram and remove buttons
        await axios.post(`${this.botUrl}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: updatedCard,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        });
      } catch (err) {
        logger.error('Error handling reject callback', { error: String(err) });
      }
    }
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

export const telegramApprovalListener = new TelegramApprovalListener();
