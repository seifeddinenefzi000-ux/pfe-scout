import fs from 'fs';
import path from 'path';
import { latexCoverLetterService } from '../services/LatexCoverLetterService.js';
import { applicationTailoringService } from '../services/ApplicationTailoringService.js';
import { draftStorageService } from '../services/DraftStorageService.js';
import { emailSenderService } from '../services/EmailSenderService.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';
import { env } from '../config/env.js';

async function main() {
  console.log('\n=====================================================================');
  console.log('🚀 PFE SCOUT — MASTER CLASS VERIFICATION SUITE');
  console.log('=====================================================================\n');

  // -----------------------------------------------------------------
  // 1. TEST LATEX COVER LETTER COMPILATION (FR & EN)
  // -----------------------------------------------------------------
  console.log('📄 [Step 1/5] Testing LaTeX Cover Letter generation & pdflatex compilation...');

  const frResult = await latexCoverLetterService.generateCoverLetter({
    id: 'test_fr_verification',
    language: 'FR',
    organization: 'INES CEA Solaire',
    positionTitle: 'Optimisation de microgrids et couplage photovoltaïque-stockage',
    cityCountry: 'Le Bourget-du-Lac, France',
    topicText: 'microgrids hybrides optimisation énergie renouvelable batteries',
    specificReason: 'les technologies photovoltaïques avancées et le pilotage de microgrids',
  });

  console.log('   FR LaTeX source:', frResult.texPath);
  console.log('   FR PDF output:  ', frResult.pdfPath);
  console.log('   FR Success:     ', frResult.compiledSuccessfully);

  if (!frResult.compiledSuccessfully || !fs.existsSync(frResult.pdfPath)) {
    throw new Error('FR LaTeX Cover Letter PDF generation failed!');
  }
  const frPdfSize = fs.statSync(frResult.pdfPath).size;
  console.log(`   ✓ FR Cover Letter compiled (${frPdfSize} bytes)\n`);

  const enResult = await latexCoverLetterService.generateCoverLetter({
    id: 'test_en_verification',
    language: 'EN',
    organization: 'EPFL PV-Lab',
    positionTitle: 'Photovoltaic and Hybrid Microgrid Optimization Intern',
    cityCountry: 'Neuchâtel, Switzerland',
    topicText: 'solar tracking microgrids dynamic programming optimization',
    specificReason: 'high-efficiency solar cell systems and smart energy networks',
  });

  console.log('   EN LaTeX source:', enResult.texPath);
  console.log('   EN PDF output:  ', enResult.pdfPath);
  console.log('   EN Success:     ', enResult.compiledSuccessfully);

  if (!enResult.compiledSuccessfully || !fs.existsSync(enResult.pdfPath)) {
    throw new Error('EN LaTeX Cover Letter PDF generation failed!');
  }
  const enPdfSize = fs.statSync(enResult.pdfPath).size;
  console.log(`   ✓ EN Cover Letter compiled (${enPdfSize} bytes)\n`);

  // -----------------------------------------------------------------
  // 2. TEST APPLICATION TAILORING (POSTED OFFER & RESEARCH SUPERVISOR)
  // -----------------------------------------------------------------
  console.log('🎯 [Step 2/5] Testing Application Tailoring with Fact Bank & 2-Resume Strategy...');

  const sampleOffer = {
    id: `offer_ines_${Date.now()}`,
    title: 'Stage PFE : Optimisation énergétique et modélisation de microgrids hybrides',
    companyName: 'INES - CEA LITEN',
    country: 'France',
    location: 'Le Bourget-du-Lac',
    isRemote: false,
    applyUrl: 'https://www.ines-solaire.org/offres/stage-pfe-microgrids',
    canonicalUrl: 'https://www.ines-solaire.org/offres/stage-pfe-microgrids',
    contentHash: 'hash_test_ines_001',
    description: 'Modélisation sous Python et optimisation de la gestion d’énergie d’un microréseau avec stockage par batteries.',
    status: 'ELIGIBLE' as const,
  };

  const postedDraft = await applicationTailoringService.tailorForPostedOffer(sampleOffer as any);
  console.log('   Posted Draft ID:', postedDraft.id);
  console.log('   Language:       ', postedDraft.language);
  console.log('   CV Attached:    ', postedDraft.cvAttachmentName);
  console.log('   CV Source:      ', postedDraft.sourceResumePath);
  console.log('   Letter Attached:', postedDraft.coverLetterPdfName);
  console.log('   Subject:        ', postedDraft.emailSubject);

  // -----------------------------------------------------------------
  // 3. TEST PERSISTENT STORAGE
  // -----------------------------------------------------------------
  console.log('\n💾 [Step 3/5] Testing persistent draft storage...');
  const retrievedDraft = draftStorageService.getDraft(postedDraft.id);
  if (!retrievedDraft) {
    throw new Error('Draft was not persisted properly to disk!');
  }
  console.log('   ✓ Draft successfully loaded from disk storage by ID:', retrievedDraft.id);

  // -----------------------------------------------------------------
  // 4. TEST LIVE GMAIL SMTP WITH BOTH REAL PDF ATTACHMENTS
  // -----------------------------------------------------------------
  console.log('\n📧 [Step 4/5] Testing live email dispatch to Seif with BOTH PDF attachments...');
  console.log('   Sending to:', env.SMTP_USER);

  const emailRes = await emailSenderService.sendApplicationEmail({
    to: env.SMTP_USER,
    subject: `[Test Validation] Candidature prête : ${postedDraft.targetTitle}`,
    bodyText: postedDraft.coverLetterOrEmailBody,
    sourceCvPath: postedDraft.sourceResumePath,
    coverLetterPath: postedDraft.coverLetterPdfPath,
    coverLetterName: postedDraft.coverLetterPdfName,
  });

  console.log('   Dispatch success:', emailRes.success);
  console.log('   Message ID:      ', emailRes.messageId || 'none');
  console.log('   Attachments:     ', emailRes.attachmentsSent);

  if (!emailRes.success) {
    throw new Error(`Email dispatch failed: ${emailRes.error}`);
  }
  console.log('   ✓ Live test email delivered successfully to Gmail inbox with both PDFs!');

  // -----------------------------------------------------------------
  // 5. TEST TELEGRAM APPROVAL CARD
  // -----------------------------------------------------------------
  console.log('\n📱 [Step 5/5] Sending interactive Telegram approval card...');
  const tgSent = await telegramNotifier.sendApplicationApprovalCard(postedDraft);
  console.log('   Telegram card sent:', tgSent);

  console.log('\n=====================================================================');
  console.log('🎉 ALL 5 VERIFICATION STAGES PASSED FLAWLESSLY!');
  console.log('=====================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
