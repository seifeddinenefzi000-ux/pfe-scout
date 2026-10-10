import axios from 'axios';
import { env } from '../config/env.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { ApplicationDraft } from '../services/ApplicationTailoringService.js';
import { logger } from '../utils/logger.js';

export class TelegramNotifier {
  private get botUrl(): string {
    return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  private isConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN !== 'mock-bot-token' && env.TELEGRAM_CHAT_ID);
  }

  /**
   * Send the daily digest of top verified opportunities
   */
  async sendDailyDigest(
    analyzedCount: number,
    filteredCount: number,
    topItems: CanonicalInternship[]
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.info(`[Mock Telegram Notifier] PFE Scout digest: ${topItems.length} verified internships.`);
      return true;
    }

    const top5 = topItems.slice(0, 5);
    const medalIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    let topRecsSection = '';

    top5.forEach((item, idx) => {
      const icon = medalIcons[idx] || '🔹';
      const matchPct = item.overallScore || item.resumeScore || 85;

      topRecsSection += `
${icon} <b>${this.escapeHtml(item.title)}</b>
🏢 <b>Organisme :</b> ${this.escapeHtml(item.companyName)}
🌍 <b>Lieu :</b> ${this.escapeHtml(item.location || item.country || 'France')}
🟢 <b>Adéquation Profil :</b> <b>${matchPct}%</b>${item.stipendText ? `\n💰 <b>Gratification :</b> ${this.escapeHtml(item.stipendText)}` : ''}
💡 <b>Focus :</b> ${this.escapeHtml(item.matchExplanation || 'Génie Énergétique / Master Recherche ENIM')}
🔗 <a href="${item.applyUrl}">Consulter l'offre officielle</a>
-----------------------------------
`;
    });

    const message = `
🇫🇷 <b>PFE Scout — Quotidien d'Opportunités PFE Énergétique</b>

📊 <b>Analyse du jour :</b>
• Offres brutes analysées : <b>${analyzedCount}</b>
• Retenues après filtrage strict : <b>${filteredCount}</b> (Priorité France & labs d'énergie, Tunisie & Allemagne exclues)

🏆 <b>TOP OPPORTUNITÉS SÉLECTIONNÉES :</b>
${topRecsSection}
📱 <b>Validation des candidatures :</b>
Consultez les fiches détaillées ci-dessous et cliquez sur <b>Approuver</b> pour déclencher l'envoi personnalisé de votre candidature avec CV adapté.
`.trim();

    return this.postHtmlMessage(message);
  }

  /**
   * Send an interactive application approval card for Telegram
   */
  async sendApplicationApprovalCard(draft: ApplicationDraft): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.info(`[Mock Telegram Notifier] Approval Card for ${draft.type}: ${draft.targetTitle} -> ${draft.targetOrganization}`);
      return true;
    }

    const isCold = draft.type === 'COLD_SUPERVISOR';
    const header = isCold
      ? '📬 <b>CANDIDATURE SPONTANÉE CHERCHEUR (COLD OUTREACH)</b>'
      : '📋 <b>OFFRE DE STAGE PFE PUBLIÉE</b>';

    const letterName = draft.coverLetterPdfName || (draft.language === 'FR' ? 'Lettre_Motivation_Seif_Eddine_Nefzi.pdf' : 'Cover_Letter_Seif_Eddine_Nefzi.pdf');
    const isDirectEmail = Boolean(draft.targetContact && draft.targetContact.includes('@'));
    const supervisorLine = draft.targetSupervisor
      ? `👨‍🏫 <b>Encadrant / Superviseur direct :</b> ${this.escapeHtml(draft.targetSupervisor)}\n`
      : '';
    const contactLine = isDirectEmail
      ? `${supervisorLine}👤 <b>Destinataire Direct :</b> <code>${this.escapeHtml(draft.targetContact)}</code>\n🚀 <b>Mode :</b> 📨 Candidature directe par Email`
      : `${supervisorLine}🌐 <b>Portail Web :</b> <a href="${this.escapeHtml(draft.targetContact)}">${this.escapeHtml(draft.targetContact)}</a>\nℹ️ <b>Mode :</b> 🌐 Candidature via formulaire / portail de l'organisme`;

    const buttonRow: any[] = [];
    if (isDirectEmail) {
      buttonRow.push({ text: '✅ Approuver & Envoyer à l\'Organisme', callback_data: `approve_${draft.id}` });
    } else {
      buttonRow.push({ text: '🌐 Ouvrir Portail', url: draft.targetContact });
      buttonRow.push({ text: '📥 M\'envoyer le Pack', callback_data: `approve_${draft.id}` });
    }
    buttonRow.push({ text: '❌ Rejeter', callback_data: `reject_${draft.id}` });

    const message = `
${header}

🎯 <b>Sujet :</b> ${this.escapeHtml(draft.targetTitle)}
🏛️ <b>Établissement / Lab :</b> ${this.escapeHtml(draft.targetOrganization)}
📍 <b>Pays :</b> ${this.escapeHtml(draft.targetCountry)}
${contactLine}

📎 <b>Documents joints :</b>
• <code>${this.escapeHtml(draft.cvAttachmentName || 'cv_Seif_Eddine_Nefzi.pdf')}</code>
• <code>${this.escapeHtml(letterName)}</code>

✉️ <b>Objet Email :</b> <code>${this.escapeHtml(draft.emailSubject)}</code>

📝 <b>Aperçu du message :</b>
<pre>${this.escapeHtml(draft.coverLetterOrEmailBody.substring(0, 450))}...</pre>
`.trim();

    const inlineKeyboard = {
      inline_keyboard: [buttonRow],
    };

    try {
      await axios.post(`${this.botUrl}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard,
        disable_web_page_preview: true,
      });
      return true;
    } catch (err) {
      logger.error('Failed sending approval card', { error: String(err) });
      return false;
    }
  }

  /**
   * Send the 30-daily batch summary card (10 posted + 20 supervisors)
   */
  async sendDailyBatchSummary(
    postedCount: number,
    supervisorCount: number
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.info(`[Mock Telegram] Daily Target: ${postedCount} posted + ${supervisorCount} cold outreach.`);
      return true;
    }

    const message = `
⚡ <b>PFE Scout — Bilan Quotidien de Prospection (Objectif 30)</b>

🎯 <b>Statut de la session :</b>
• Offres de stage publiées qualifiées : <b>${postedCount} / 10</b>
• Contacts chercheurs / superviseurs ciblés : <b>${supervisorCount} / 20</b>
• Total opportunités prêtes pour revue : <b>${postedCount + supervisorCount} / 30</b>

🛡️ <b>Sécurité et contrôle :</b>
Toutes les candidatures nécessitent votre validation explicite avant tout envoi d'email depuis votre adresse <code>${this.escapeHtml(env.SMTP_USER)}</code>.
`.trim();

    return this.postHtmlMessage(message);
  }

  async sendInternshipAlert(item: CanonicalInternship): Promise<boolean> {
    return this.sendDailyDigest(1, 1, [item]);
  }

  private async postHtmlMessage(html: string): Promise<boolean> {
    try {
      await axios.post(`${this.botUrl}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      return true;
    } catch (err) {
      logger.error('Failed to send Telegram message', { error: String(err) });
      return false;
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

export const telegramNotifier = new TelegramNotifier();