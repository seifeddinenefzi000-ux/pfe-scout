import nodemailer, { type Transporter } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { applicationTrackingRepo } from '../repositories/ApplicationTrackingRepository.js';

export interface SendApplicationOptions {
  applicationId?: string;
  to: string;
  subject: string;
  bodyText: string;
  cvFileName: string;
  replyTo?: string;
}

export interface SendApplicationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailSenderService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const cleanPass = (env.SMTP_PASS || '').replace(/\s+/g, '');
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: env.SMTP_USER,
          pass: cleanPass,
        },
      });
    }
    return this.transporter;
  }

  /**
   * Resolve absolute path to the requested CV file
   */
  resolveCvPath(cvFileName: string): string {
    const candidatePaths = [
      path.join(process.cwd(), 'data', 'resumes', cvFileName),
      path.join(process.cwd(), 'data', cvFileName),
      path.join(process.cwd(), 'data', 'resumes', 'CV_Seif_Energies_Renouvelables.pdf'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return candidatePaths[0];
  }

  /**
   * Send application email with attached CV
   */
  async sendApplicationEmail(options: SendApplicationOptions): Promise<SendApplicationResult> {
    const { applicationId, to, subject, bodyText, cvFileName, replyTo } = options;

    if (!to || !to.includes('@')) {
      const errMsg = `Invalid recipient email address: "${to}"`;
      logger.warn(errMsg);
      return { success: false, error: errMsg };
    }

    const cvPath = this.resolveCvPath(cvFileName);
    const attachments: Array<{ filename: string; path?: string; content?: Buffer }> = [];

    if (fs.existsSync(cvPath)) {
      attachments.push({
        filename: path.basename(cvPath),
        path: cvPath,
      });
    } else {
      logger.warn(`CV attachment file not found at ${cvPath}. Sending email without attachment.`);
    }

    const htmlBody = `
<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a202c; line-height: 1.6;">
  ${bodyText
    .split('\n')
    .map((paragraph) => (paragraph.trim() ? `<p>${paragraph.trim()}</p>` : ''))
    .join('')}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0 15px 0;" />
  <div style="font-size: 13px; color: #4a5568;">
    <strong>Seif Eddine Nefzi</strong><br />
    Élève-Ingénieur en Génie Énergétique (ENIM) & Master de Recherche en Énergétique<br />
    Tél : (+216) 20 016 808 | Email : ${env.SMTP_USER}
  </div>
</div>
`.trim();

    // In test environment or mock credentials, simulate send
    if (
      process.env.VITEST ||
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      env.SMTP_USER === 'mock-user@gmail.com'
    ) {
      logger.info(`[Mock EmailSenderService] Dispatched application to ${to} with attachment ${cvFileName}`);
      if (applicationId) {
        await applicationTrackingRepo.updateStatus(applicationId, 'APPLIED');
      }
      return {
        success: true,
        messageId: `mock-msg-${Date.now()}`,
      };
    }

    try {
      const transporter = this.getTransporter();
      const mailOptions = {
        from: `"${env.SMTP_SENDER_NAME}" <${env.SMTP_USER}>`,
        to,
        replyTo: replyTo || env.SMTP_USER,
        subject,
        text: bodyText,
        html: htmlBody,
        attachments,
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info(`✅ Successfully dispatched application email to ${to}`, {
        messageId: info.messageId,
        subject,
        cv: cvFileName,
      });

      if (applicationId) {
        await applicationTrackingRepo.updateStatus(applicationId, 'APPLIED');
      }

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      const errorStr = String(err);
      logger.error(`❌ Failed to send email to ${to}: ${errorStr}`);
      return {
        success: false,
        error: errorStr,
      };
    }
  }
}

export const emailSenderService = new EmailSenderService();
