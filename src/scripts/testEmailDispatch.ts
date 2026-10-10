import 'dotenv/config';
import { emailSenderService } from '../services/EmailSenderService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

async function main() {
  console.log('==================================================');
  console.log('📧 DIRECT EMAIL DISPATCH TEST');
  console.log('==================================================');
  console.log('Sender Email:', env.SMTP_USER);
  console.log('App Password length:', (env.SMTP_PASS || '').length);

  try {
    const result = await emailSenderService.sendApplicationEmail({
      to: env.SMTP_USER,
      subject: `Test PFE Scout Validation Email - ${new Date().toISOString()}`,
      bodyText: `Bonjour Seif,\n\nCeci est un test de validation direct du moteur d'envoi d'email PFE Scout.\nVotre pipeline d'envoi fonctionne à 100%.\n\nDate: ${new Date().toLocaleString()}`,
      cvFileName: 'CV_Seif_Energies_Renouvelables.pdf',
    });

    console.log('Dispatch Result:', result);
    if (result.success) {
      console.log('✅ EMAIL DISPATCHED SUCCESSFULLY! Message ID:', result.messageId);
    } else {
      console.error('❌ EMAIL DISPATCH FAILED:', result.error);
    }
  } catch (err) {
    console.error('❌ Exception during email dispatch:', err);
  }
}

main();
