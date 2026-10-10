import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { emailSenderService } from './EmailSenderService.js';
import { getSupabaseClient } from '../database/client.js';
import { draftStorageService, ApplicationDraft } from './DraftStorageService.js';
import { archiveService } from './ArchiveService.js';

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
          // Catch any connection issues and retry
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
          timeout: 10,
        },
        timeout: 15000,
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
        let draft: ApplicationDraft | null = draftStorageService.getDraft(appId);

        // Fallback: check Supabase if not found locally
        if (!draft) {
          try {
            const { data: application } = await this.supabase
              .from('applications')
              .select('*')
              .eq('id', appId)
              .single();

            if (application) {
              draft = {
                id: application.id,
                type: application.type || 'POSTED_OFFER',
                language: 'FR',
                targetTitle: application.target_name || appId,
                targetOrganization: application.organization || 'Établissement',
                targetContact: application.contact_info || '',
                targetCountry: application.country || 'France',
                sourceResumePath: '',
                cvAttachmentName: 'cv_Seif_Eddine_Nefzi.pdf',
                coverLetterPdfPath: '',
                coverLetterPdfName: 'Lettre_Motivation_Seif_Eddine_Nefzi.pdf',
                emailSubject: application.email_subject || 'Candidature Stage PFE',
                coverLetterOrEmailBody: application.letter_content || '',
                status: 'PENDING_APPROVAL',
                generatedAt: application.created_at || new Date().toISOString(),
              };
            }
          } catch {}
        }

        const targetTitle = draft?.targetTitle || appId;
        const orgName = draft?.targetOrganization || 'Organisme';
        const rawContact = draft?.targetContact || '';
        const isDirectEmail = Boolean(rawContact && rawContact.includes('@'));

        const targetEmail = isDirectEmail ? rawContact : env.SMTP_USER;
        const targetSubject = isDirectEmail ? draft?.emailSubject || `Candidature - ${targetTitle}` : `[Dossier Prêt] ${draft?.emailSubject || targetTitle}`;
        const targetBody = isDirectEmail
          ? draft?.coverLetterOrEmailBody || ''
          : `Bonjour Seif,\n\nVotre candidature pour l'offre "${targetTitle}" chez ${orgName} a été validée !\nLien pour postuler : ${rawContact}\n\nVous trouverez ci-joint votre CV et votre lettre de motivation personnalisée au format PDF, prêts pour votre candidature.\n\n--- Corps du message d'accompagnement ---\n\n${draft?.coverLetterOrEmailBody || ''}`;

        logger.info(`📤 [Telegram Email Dispatch] Sending to: ${targetEmail}`);

        const sendRes = await emailSenderService.sendApplicationEmail({
          applicationId: appId,
          to: targetEmail,
          bcc: undefined,
          subject: targetSubject,
          bodyText: targetBody,
          sourceCvPath: draft?.sourceResumePath,
          coverLetterPath: draft?.coverLetterPdfPath,
          coverLetterName: draft?.coverLetterPdfName,
        });

        logger.info(`✅ [Telegram Email Dispatch] Result: success=${sendRes.success}, messageId=${sendRes.messageId || 'none'}`);

        if (sendRes.success) {
          draftStorageService.updateDraftStatus(appId, 'APPLIED');

          // Prevent any duplicate proposals
          if (draft) {
            await archiveService.archiveOffers([
              {
                id: draft.id,
                title: draft.targetTitle,
                companyName: draft.targetOrganization,
                applyUrl: draft.targetContact,
                canonicalUrl: draft.targetContact,
                contentHash: draft.id,
                country: draft.targetCountry,
                isRemote: false,
                status: 'ARCHIVED' as const,
              } as any,
            ]);
          }

          const attachmentsText = (sendRes.attachmentsSent || ['cv_Seif_Eddine_Nefzi.pdf']).map((a) => `• 📎 <code>${this.escapeHtml(a)}</code>`).join('\n');

          const statusTitle = isDirectEmail
            ? '✅ <b>CANDIDATURE EXPÉDIÉE DIRECTEMENT À L\'ORGANISME !</b>'
            : '📥 <b>DOSSIER COMPLET TRANSMIS PAR EMAIL POUR POSTULATION SUR PORTAIL !</b>';

          const supervisorInfo = draft?.targetSupervisor
            ? `\n👨‍🏫 <b>Superviseur direct :</b> ${this.escapeHtml(draft.targetSupervisor)}`
            : '';

          const updatedCard = `
${statusTitle}

🎯 <b>Sujet :</b> ${this.escapeHtml(targetTitle)}
🏛️ <b>Organisme :</b> ${this.escapeHtml(orgName)}${supervisorInfo}
📧 <b>Destinataire :</b> <code>${this.escapeHtml(targetEmail)}</code>
📤 <b>Expéditeur :</b> <code>${this.escapeHtml(env.SMTP_USER)}</code>
📨 <b>Message ID :</b> <code>${this.escapeHtml(sendRes.messageId || 'dispatch-ok')}</code>

<b>Documents joints :</b>
${attachmentsText}

⏰ <b>Traitée le :</b> <i>${timestamp}</i>
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
        } else {
          // Report failure clearly on Telegram so user is never left in the dark
          const errorCard = `
⚠️ <b>ÉCHEC DE L'ENVOI DE LA CANDIDATURE</b>

🎯 <b>Sujet :</b> ${this.escapeHtml(targetTitle)}
🏛️ <b>Organisme :</b> ${this.escapeHtml(orgName)}
❌ <b>Erreur :</b> <code>${this.escapeHtml(sendRes.error || 'Erreur inconnue lors du dispatch SMTP')}</code>
⏰ <b>Date :</b> <i>${timestamp}</i>
`.trim();

          await axios.post(`${this.botUrl}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: errorCard,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Réessayer', callback_data: `approve_${appId}` }],
              ],
            },
          });
        }
      } catch (err) {
        logger.error('❌ Error handling approval callback', { error: String(err) });
      }
    } else if (callbackData.startsWith('reject_')) {
      const appId = callbackData.replace('reject_', '');
      logger.info(`🚫 [Telegram Rejection] Processing application ID: ${appId}`);

      try {
        const draft = draftStorageService.getDraft(appId);
        const targetTitle = draft?.targetTitle || appId;
        const orgName = draft?.targetOrganization || 'Établissement';

        draftStorageService.updateDraftStatus(appId, 'REJECTED');

        if (draft) {
          await archiveService.archiveOffers([
            {
              id: draft.id,
              title: draft.targetTitle,
              companyName: draft.targetOrganization,
              applyUrl: draft.targetContact,
              canonicalUrl: draft.targetContact,
              contentHash: draft.id,
              country: draft.targetCountry,
              isRemote: false,
              status: 'ARCHIVED' as const,
            } as any,
          ]);
        }

        const updatedCard = `
❌ <b>CANDIDATURE REJETÉE ET ARCHIVÉE</b>

🎯 <b>Sujet :</b> ${this.escapeHtml(targetTitle)}
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
