import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { emailSenderService } from './EmailSenderService.js';
import { getSupabaseClient } from '../database/client.js';

export class TelegramApprovalListener {
  private offset = 0;
  private supabase = getSupabaseClient();
  private isPollingActive = false;

  private get botUrl(): string {
    return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  /**
   * Start background long-polling loop for real-time Telegram button handling
   */
  startPolling(): void {
    if (this.isPollingActive || !env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === 'mock-bot-token') {
      return;
    }

    this.isPollingActive = true;
    logger.info('🤖 Real-time Telegram approval listener started.');

    const pollLoop = async () => {
      while (this.isPollingActive) {
        try {
          await this.processUpdatesOnce();
        } catch (e) {
          // Non-blocking retry
        }
        await new Promise((res) => setTimeout(res, 800));
      }
    };

    pollLoop().catch((err) => logger.error('Polling loop error', { error: String(err) }));
  }

  stopPolling(): void {
    this.isPollingActive = false;
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
          timeout: 4,
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
      return 0;
    }
  }

  private async handleCallbackQuery(callbackQuery: any): Promise<void> {
    const callbackData = callbackQuery.data as string;
    const messageId = callbackQuery.message?.message_id;
    const chatId = callbackQuery.message?.chat?.id;

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
        let subject = application?.email_subject || 'Candidature Stage PFE';

        if (application && application.contact_info?.includes('@')) {
          await emailSenderService.sendApplicationEmail({
            applicationId: application.id,
            to: application.contact_info,
            subject: application.email_subject,
            bodyText: application.letter_content,
            cvFileName: cvName,
          });
        }

        const updatedCard = `
✅ <b>CANDIDATURE ENVOYÉE AVEC SUCCÈS !</b>

🎯 <b>Sujet :</b> ${this.escapeHtml(application?.target_name || appId)}
🏛️ <b>Organisme :</b> ${this.escapeHtml(application?.organization || 'Établissement')}
📧 <b>Destinataire :</b> <code>${this.escapeHtml(recipient)}</code>
📄 <b>CV joint :</b> <code>${this.escapeHtml(cvName)}</code>
📤 <b>Expéditeur :</b> <code>${this.escapeHtml(env.SMTP_USER)}</code>
⏰ <b>Date d'envoi :</b> <i>${timestamp}</i>
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

        const { data: application } = await this.supabase
          .from('applications')
          .select('target_name, organization')
          .eq('id', appId)
          .single();

        const updatedCard = `
❌ <b>CANDIDATURE REJETÉE ET ARCHIVÉE</b>

🎯 <b>Sujet :</b> ${this.escapeHtml(application?.target_name || appId)}
🏛️ <b>Organisme :</b> ${this.escapeHtml(application?.organization || 'Établissement')}
📁 <i>Cette opportunité a été classée dans votre dossier fermé et ne sera plus proposée.</i>
⏰ <b>Date :</b> <i>${timestamp}</i>
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

// Auto-start listener on boot
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  telegramApprovalListener.startPolling();
}
