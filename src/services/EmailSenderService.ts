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
  cvFileName?: string;
  sourceCvPath?: string;
  coverLetterPath?: string;
  coverLetterName?: string;
  replyTo?: string;
  bcc?: string;
}

export interface SendApplicationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attachmentsSent?: string[];
}

export class EmailSenderService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const cleanPass = (env.SMTP_PASS || '').replace(/\s+/g, '');
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
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
  resolveCvPath(cvFileName?: string, sourceCvPath?: string): string {
    if (sourceCvPath && fs.existsSync(sourceCvPath)) {
      return sourceCvPath;
    }

    const candidatePaths = [
      path.join(process.cwd(), 'data', 'resumes', 'SeifEddine_Nefzi_Resume_FR.pdf'),
      path.join(process.cwd(), 'data', 'resumes', 'SeifEddine_Nefzi_Resume_EN.pdf'),
      path.join(process.cwd(), 'SeifEddine_Nefzi_Resume_FR.pdf'),
      path.join(process.cwd(), 'SeifEddine_Nefzi_Resume_EN.pdf'),
    ];

    if (cvFileName) {
      candidatePaths.unshift(path.join(process.cwd(), 'data', 'resumes', cvFileName));
      candidatePaths.unshift(path.join(process.cwd(), 'data', cvFileName));
    }

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return candidatePaths[0];
  }

  /**
   * Send application email with attached CV and tailored cover letter
   */
  async sendApplicationEmail(options: SendApplicationOptions): Promise<SendApplicationResult> {
    const { applicationId, to, subject, bodyText, cvFileName, sourceCvPath, coverLetterPath, coverLetterName, replyTo } = options;

    if (!to || !to.includes('@')) {
      const errMsg = `Invalid recipient email address: "${to}"`;
      logger.warn(errMsg);
      return { success: false, error: errMsg };
    }

    const resolvedCvPath = this.resolveCvPath(cvFileName, sourceCvPath);
    const attachments: Array<{ filename: string; path?: string; content?: Buffer }> = [];
    const attachmentsSent: string[] = [];

    // 1. Attach CV — strictly named cv_Seif_Eddine_Nefzi.pdf
    if (fs.existsSync(resolvedCvPath)) {
      attachments.push({
        filename: 'cv_Seif_Eddine_Nefzi.pdf',
        path: resolvedCvPath,
      });
      attachmentsSent.push('cv_Seif_Eddine_Nefzi.pdf');
    } else {
      logger.warn(`CV attachment file not found at ${resolvedCvPath}.`);
    }

    // 2. Attach tailored LaTeX Cover Letter PDF
    if (coverLetterPath && fs.existsSync(coverLetterPath)) {
      const letterFileName = coverLetterName || path.basename(coverLetterPath);
      attachments.push({
        filename: letterFileName,
        path: coverLetterPath,
      });
      attachmentsSent.push(letterFileName);
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
    Élève-Ingénieur en Génie Énergétique (ENIM) & Master de Recherche en Systèmes Énergétiques<br />
    Tél : (+216) 20 016 808 | Email : ${env.SMTP_USER}<br />
    LinkedIn : <a href="https://linkedin.com/in/nefzi-seifeddine">linkedin.com/in/nefzi-seifeddine</a>
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
      logger.info(`[Mock EmailSenderService] Dispatched application to ${to} with attachments: ${attachmentsSent.join(', ')}`);
      if (applicationId) {
        await applicationTrackingRepo.updateStatus(applicationId, 'APPLIED');
      }
      return {
        success: true,
        messageId: `mock-msg-${Date.now()}`,
        attachmentsSent,
      };
    }

    try {
      const transporter = this.getTransporter();
      const mailOptions: any = {
        from: `"${env.SMTP_SENDER_NAME}" <${env.SMTP_USER}>`,
        to,
        replyTo: replyTo || env.SMTP_USER,
        subject,
        text: bodyText,
        html: htmlBody,
        attachments,
      };

      if (options.bcc) {
        mailOptions.bcc = options.bcc;
      }

      const info = await transporter.sendMail(mailOptions);
      logger.info(`✅ Successfully dispatched application email to ${to}`, {
        messageId: info.messageId,
        subject,
        attachments: attachmentsSent,
      });

      if (applicationId) {
        await applicationTrackingRepo.updateStatus(applicationId, 'APPLIED');
      }

      return {
        success: true,
        messageId: info.messageId,
        attachmentsSent,
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
