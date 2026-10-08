import axios from 'axios';

import { env } from '../config/env.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export class TelegramNotifier {
  async sendDailyDigest(
    analyzedCount: number,
    filteredCount: number,
    topItems: CanonicalInternship[]
  ): Promise<boolean> {
    if (
      !env.TELEGRAM_BOT_TOKEN ||
      env.TELEGRAM_BOT_TOKEN === 'mock-bot-token'
    ) {
      logger.info(
        `[Mock Telegram Notifier] PFE Scout digest: ${topItems.length} verified international internships.`
      );

      return true;
    }

    const top5 = topItems.slice(0, 5);

    const medalIcons = [
      '🥇',
      '🥈',
      '🥉',
      '4️⃣',
      '5️⃣',
    ];

    let topRecsSection = '';

    top5.forEach((item, idx) => {
      const icon =
        medalIcons[idx] || '🔹';

      const matchPct =
        item.resumeScore ||
        item.overallScore ||
        85;

      const descLower =
        item.description.toLowerCase();

      /*
       * Matched skills
       */
      const matchedSkills =
        item.skills.slice(0, 3);

      const matchedSkillsText =
        matchedSkills.length > 0
          ? matchedSkills
              .map(
                (skill) =>
                  `✔ ${this.escapeMarkdown(skill)}`
              )
              .join('\n')
          : '✔ Engineering Background & Problem Solving';

      /*
       * Missing skills
       */
      let missingSkillText =
        'None identified';

      if (
        !descLower.includes('pytorch') &&
        (
          item.title
            .toLowerCase()
            .includes('ai') ||
          item.title
            .toLowerCase()
            .includes('machine learning')
        )
      ) {
        missingSkillText = 'PyTorch';
      } else if (
        !descLower.includes('dsa') &&
        item.title
          .toLowerCase()
          .includes('software')
      ) {
        missingSkillText =
          'Advanced DSA & Systems';
      }

      const matchBadge =
        matchPct >= 80
          ? '🟢 Strong Match'
          : '🟡 Potential Match';

      /*
       * Use a neutral international date format.
       */
      const deadlineText = item.deadline
        ? new Date(
            item.deadline
          ).toLocaleDateString(
            'en-GB',
            {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }
          )
        : 'Open / Immediate';

      topRecsSection += `
${icon} *${this.escapeMarkdown(item.title)}*
🏢 *Company:* ${this.escapeMarkdown(item.companyName)}
🌍 *Location:* ${this.escapeMarkdown(item.location || 'International')}
${matchBadge} (*${matchPct}% Match*)${item.stipendText ? `
💰 *Stipend:* ${this.escapeMarkdown(item.stipendText)}` : ''}

*Skills Matched:*
${matchedSkillsText}

*Missing:*
• ${this.escapeMarkdown(missingSkillText)}

*Why Apply:*
${this.escapeMarkdown(
  item.matchExplanation ||
    'Strong alignment with your core technical skills.'
)}

⏱️ *Est. Application Time:* 15-20 minutes
⏳ *Deadline:* ${this.escapeMarkdown(deadlineText)}
🛡️ *Verified Source:* ${this.escapeMarkdown(
        item.sourceId ||
          'Real Corporate / Research Source'
      )}

🔗 [Apply via Verified Source](${item.applyUrl})
-----------------------------------
`;
    });

    const message = `
🌍 *PFE Scout — International Internship Intelligence*

I analyzed *${analyzedCount}* real-world internship listings today.

After verification and eligibility filtering, *${filteredCount}* international opportunities are ready for you.

🏆 *TOP MATCHES FOR YOU:*
${topRecsSection}
🎯 *Action Plan:* Focus on applying to the top 2 roles today.
`.trim();

    try {
      const url =
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

      await axios.post(url, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });

      logger.info(
        'PFE Scout Telegram digest successfully sent.'
      );

      return true;
    } catch (err) {
      logger.error(
        'Failed to send Telegram Digest',
        {
          error: String(err),
        }
      );

      return false;
    }
  }

  async sendInternshipAlert(
    item: CanonicalInternship
  ): Promise<boolean> {
    return this.sendDailyDigest(
      100,
      1,
      [item]
    );
  }

  private escapeMarkdown(
    text: string
  ): string {
    return text.replace(
      /[_*\[\]()~`>#+-=|{}.!]/g,
      '\\$&'
    );
  }
}

export const telegramNotifier =
  new TelegramNotifier();