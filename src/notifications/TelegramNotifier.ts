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
      const matchPct = item.overallScore || 85;

      topRecsSection += `
${icon} *${this.escapeMarkdown(item.title)}*
🏢 *Organization:* ${this.escapeMarkdown(item.companyName)}
🌍 *Location:* ${this.escapeMarkdown(item.location || item.country || 'France')}
🟢 *Match Score:* ${matchPct}%${item.stipendText ? `\n💰 *Gratification:* ${this.escapeMarkdown(item.stipendText)}` : ''}
💡 *Key Focus:* ${this.escapeMarkdown(item.matchExplanation || 'Energy Engineering alignment')}
🔗 [Consulter l'offre](${item.applyUrl})
-----------------------------------
`;
    });

    const message = `
🇫🇷 *PFE Scout — Quotidien d'Opportunités PFE Énergétique*

📊 *Analyse du jour :*
• Offres brutes analysées : *${analyzedCount}*
• Retenues après filtrage strict : *${filteredCount}* (Priorité France & labs d'énergie, Tunisie & Allemagne exclues)

🏆 *TOP OFFRES SÉLECTIONNÉES :*
${topRecsSection}
📱 *Validation requise :* Utilisez les fiches d'approbation ci-dessous pour valider les candidatures.
`.trim();

    return this.postMessage(message);
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
    const header = isCold ? '📬 *CANDIDATURE SPONTANÉE CHERCHEUR (COLD OUTREACH)*' : '📋 *OFFRE DE STAGE PFE PUBLIÉE*';

    const message = `
${header}

🎯 *Cible :* ${this.escapeMarkdown(draft.targetTitle)}
🏛️ *Établissement / Lab :* ${this.escapeMarkdown(draft.targetOrganization)}
📍 *Pays :* ${this.escapeMarkdown(draft.targetCountry)}
👤 *Contact :* ${this.escapeMarkdown(draft.targetContact)}

📄 *CV Recommandé :* \`${draft.cvFileName}\`
✉️ *Objet de l'email :* \`${this.escapeMarkdown(draft.emailSubject)}\`

📝 *Extrait de la lettre / email :*
\`\`\`text
${draft.coverLetterOrEmailBody.substring(0, 450)}...
\`\`\`
`.trim();

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approuver & Préparer', callback_data: `approve_${draft.id}` },
          { text: '❌ Rejeter', callback_data: `reject_${draft.id}` },
        ],
      ],
    };

    try {
      await axios.post(`${this.botUrl}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
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
    supervisorCount: number,
    approvedCount: number = 0
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.info(`[Mock Telegram] Daily Target: ${postedCount} posted + ${supervisorCount} cold outreach.`);
      return true;
    }

    const message = `
⚡ *PFE Scout — Bilan Quotidien de Prospection (Cible 30)*

🎯 *Objectif quotidien atteint :*
• Offres de stage publiées qualifiées : *${postedCount} / 10*
• Contacts chercheurs / superviseurs ciblés : *${supervisorCount} / 20*
• Total opportunités prêtes pour revue : *${postedCount + supervisorCount} / 30*

🛡️ *Sécurité et contrôle :*
Aucun email ne sera expédié sans votre clic de validation sur Telegram.
`.trim();

    return this.postMessage(message);
  }

  async sendInternshipAlert(item: CanonicalInternship): Promise<boolean> {
    return this.sendDailyDigest(1, 1, [item]);
  }

  private async postMessage(text: string): Promise<boolean> {
    try {
      await axios.post(`${this.botUrl}/sendMessage`, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
      return true;
    } catch (err) {
      logger.error('Failed to send Telegram message', { error: String(err) });
      return false;
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*\[\]()~`>#+-=|{}.!]/g, '\\$&');
  }
}

export const telegramNotifier = new TelegramNotifier();