import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { emailSenderService } from './EmailSenderService.js';
import { getSupabaseClient } from '../database/client.js';
import { draftRegistry } from './ApplicationTailoringService.js';

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

    logger.info(`📥 [Telegram Callback] Action triggered: "${callbackData}" from chat ${chatId}`);

    // Acknowledge the callback immediately to remove loading spinner in Telegram
    try {
      await axios.post(`${this.botUrl}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
        text: 'Action reçue ! Traitement en cours...',
      });
    } catch (e) {
      logger.warn('Could not acknowledge callback query', { error: String(e) });
    }

    const timestamp = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

    if (callbackData.startsWith('approve_')) {
      const appId = callbackData.replace('approve_', '');
      logger.info(`⚡ [Telegram Approval] Processing application ID: ${appId}`);

      try {
        const inMemDraft = draftRegistry.get(appId);
        let targetName = inMemDraft?.targetTitle || appId;
        let orgName = inMemDraft?.targetOrganization || 'Établissement';
        let recipient = inMemDraft?.targetContact || '';
        let cvName = inMemDraft ? inMemDraft.cvFileName : 'CV_Seif_Energies_Renouvelables.pdf';
        let subject = inMemDraft?.emailSubject || 'Candidature Stage PFE';
        let body = inMemDraft?.coverLetterOrEmailBody || '';

        if (!inMemDraft) {
          try {
            const { data: application } = await this.supabase
              .from('applications')
              .select('*')
              .eq('id', appId)
              .single();

            if (application) {
              targetName = application.target_name || targetName;
              orgName = application.organization || orgName;
              recipient = application.contact_info || recipient;
              cvName = application.cv_track_used ? `${application.cv_track_used}.pdf` : cvName;
              subject = application.email_subject || subject;
              body = application.letter_content || body;
            }
          } catch (dbErr) {
            logger.warn('Draft not found in Supabase DB, falling back to defaults', { error: String(dbErr) });
          }
        }

        let isDirectEmail = Boolean(recipient && recipient.includes('@'));
        let targetEmail = isDirectEmail ? recipient : env.SMTP_USER;
        let targetSubject = isDirectEmail ? subject : `[Dossier Prêt] ${subject}`;
        let targetBody = isDirectEmail
          ? body
          : `Bonjour Seif,\n\nVoici votre dossier prêt pour l'offre "${targetName}" chez ${orgName}.\nLien pour postuler : ${recipient}\n\n--- Lettre de motivation personnalisée ---\n\n${body}`;

        logger.info(`📤 [Telegram Email Dispatch] Sending to: ${targetEmail} with CV: ${cvName}`);

        const sendRes = await emailSenderService.sendApplicationEmail({
          applicationId: appId,
          to: targetEmail,
          subject: targetSubject,
          bodyText: targetBody,
          cvFileName: cvName,
        });

        logger.info(`✅ [Telegram Email Dispatch] Result: success=${sendRes.success}, messageId=${sendRes.messageId || 'none'}`);

        try {
          await this.supabase
            .from('applications')
            .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
            .eq('id', appId);
        } catch {}

        const updatedCard = `
✅ <b>CANDIDATURE APPROUVÉE AVEC SUCCÈS !</b>

🎯 <b>Sujet :</b> ${this.escapeHtml(targetName)}
🏛️ <b>Organisme :</b> ${this.escapeHtml(orgName)}
📧 <b>Destinataire :</b> <code>${this.escapeHtml(targetEmail)}</code>
📄 <b>CV joint :</b> <code>${this.escapeHtml(cvName)}</code>
📤 <b>Expéditeur :</b> <code>${this.escapeHtml(env.SMTP_USER)}</code>
⏰ <b>Date de traitement :</b> <i>${timestamp}</i>
`.trim();

        // Edit the message in-place on Telegram and remove buttons
        await axios.post(`${this.botUrl}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: updatedCard,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        });

        logger.info(`📱 [Telegram Card Updated] Message ${messageId} successfully transformed to APPROVED.`);
      } catch (err) {
        logger.error('❌ Error handling approval callback', { error: String(err) });
      }
    } else if (callbackData.startsWith('reject_')) {
      const appId = callbackData.replace('reject_', '');
      logger.info(`🚫 [Telegram Rejection] Processing application ID: ${appId}`);

      try {
        const inMemDraft = draftRegistry.get(appId);
        let targetName = inMemDraft?.targetTitle || appId;
        let orgName = inMemDraft?.targetOrganization || 'Établissement';

        if (!inMemDraft) {
          try {
            const { data: application } = await this.supabase
              .from('applications')
              .select('target_name, organization')
              .eq('id', appId)
              .single();

            if (application) {
              targetName = application.target_name || targetName;
              orgName = application.organization || orgName;
            }
          } catch {}
        }

        try {
          await this.supabase
            .from('applications')
            .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
            .eq('id', appId);
        } catch {}

        const updatedCard = `
❌ <b>CANDIDATURE REJETÉE ET ARCHIVÉE</b>

🎯 <b>Sujet :</b> ${this.escapeHtml(targetName)}
🏛️ <b>Organisme :</b> ${this.escapeHtml(orgName)}
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

        logger.info(`📱 [Telegram Card Updated] Message ${messageId} successfully transformed to REJECTED.`);
      } catch (err) {
        logger.error('❌ Error handling reject callback', { error: String(err) });
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
