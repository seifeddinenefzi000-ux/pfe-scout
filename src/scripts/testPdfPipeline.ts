import 'dotenv/config';
import { env } from '../config/env.js';
import { applicationTailoringService } from '../services/ApplicationTailoringService.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

async function main() {
  console.log('\n=====================================================================');
  console.log('🔬 TEST DU MOTEUR PFE SCOUT — FICHE PDF DE LABORATOIRE');
  console.log('=====================================================================\n');

  // 1. Simulation d'une fiche de stage PFE extraite d'un PDF officiel de laboratoire
  const samplePdfOffer: CanonicalInternship = {
    id: `offer_pdf_lab_${Date.now()}`,
    title: 'Optimisation de la gestion d’énergie d’un microgrid hybride photovoltaïque avec stockage par batteries',
    companyName: 'INES - CEA LITEN',
    country: 'France',
    location: 'Le Bourget-du-Lac (Savoie), France',
    isRemote: false,
    applyUrl: 'https://www.ines-solaire.org/offres/stage-pfe-microgrids-2027.pdf',
    canonicalUrl: 'https://www.ines-solaire.org/offres/stage-pfe-microgrids-2027.pdf',
    contentHash: `hash_pdf_lab_${Date.now()}`,
    description: `Modélisation sous Python et MATLAB d’un microréseau hybride couplant génération solaire et BESS. Conception d’algorithmes d’optimisation (programmation dynamique, algorithmes génétiques) pour minimiser le coût d’exploitation.

Encadrant scientifique :
Dr. Stéphane Averty
Email : stephane.averty@cea.fr
Laboratoire LITEN, INES`,
    status: 'NORMALIZED',
    stipendMin: 650,
    stipendMax: 650,
    stipendCurrency: 'EUR',
    stipendText: 'Gratification légale (France)',
    deadline: null,
    skills: ['Microgrids & EMS', 'Python (FastAPI, NumPy, SciPy)', 'Optimisation énergétique (DP, GA, PSO, LP)', 'Stockage par batteries (BESS)'],
    metadata: {
      isPdfOffer: true,
      supervisorName: 'Dr. Stéphane Averty',
      supervisorEmail: env.SMTP_USER, // Mode test : envoyé directement à votre adresse pour validation sans bounce 550
      contactEmail: env.SMTP_USER,
      isDirectEmail: true,
      isTestOffer: true,
    },
  };

  console.log('1️⃣ Personnalisation du dossier avec accroche Fact Bank & compilation LaTeX...');
  const draft = await applicationTailoringService.tailorForPostedOffer(samplePdfOffer);

  console.log('   ✓ ID Dossier :         ', draft.id);
  console.log('   ✓ Superviseur direct : ', draft.targetSupervisor);
  console.log('   ✓ Destinataire direct :', draft.targetContact);
  console.log('   ✓ CV joint :           ', draft.cvAttachmentName);
  console.log('   ✓ Lettre PDF générée : ', draft.coverLetterPdfName);
  console.log('   ✓ Objet Email :        ', draft.emailSubject);

  console.log('\n2️⃣ Envoi de la carte interactive d\'approbation sur Telegram...');
  const sent = await telegramNotifier.sendApplicationApprovalCard(draft);

  if (sent) {
    console.log('\n✅ SUCCÈS ! La carte interactive a été envoyée sur votre Telegram.');
    console.log('👉 Ouvrez votre Telegram et appuyez sur : [✅ Approuver & Envoyer à l\'Organisme]');
    console.log(`👉 En mode test, le bot expédiera le dossier complet directement sur votre boîte (${env.SMTP_USER}) pour inspection sans bounce !`);
  } else {
    console.log('❌ Échec de l\'envoi Telegram. Vérifiez vos identifiants bot.');
  }

  console.log('=====================================================================\n');
}

main().catch((err) => {
  logger.error('Error during test execution', { error: String(err) });
});
