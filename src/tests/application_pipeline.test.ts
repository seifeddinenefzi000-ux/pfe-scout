import { describe, it, expect } from 'vitest';
import { EligibilityFilterStage } from '../pipeline/EligibilityFilterStage.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { applicationTailoringService } from '../services/ApplicationTailoringService.js';
import { supervisorScoutService } from '../services/SupervisorScoutService.js';

describe('PFE Scout Core Pipeline Tests', () => {
  it('EligibilityFilter: should exclude Tunisia and Germany, and accept & prioritize France', () => {
    const filter = new EligibilityFilterStage();

    const sampleItems: CanonicalInternship[] = [
      {
        id: '1',
        title: 'Stage PFE Modélisation Solaire',
        companyName: 'CNRS PROMES',
        location: 'Font-Romeu, France',
        applyUrl: 'https://promes.cnrs.fr/1',
        canonicalUrl: 'https://promes.cnrs.fr/1',
        contentHash: 'hash1',
        skills: ['Solar'],
        isRemote: false,
        status: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        title: 'Energy Intern',
        companyName: 'Tunis Energy',
        location: 'Tunis, Tunisia',
        applyUrl: 'https://tunis.tn/1',
        canonicalUrl: 'https://tunis.tn/1',
        contentHash: 'hash2',
        skills: ['Solar'],
        isRemote: false,
        status: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        title: 'Photovoltaic Thesis Intern',
        companyName: 'Fraunhofer ISE',
        location: 'Freiburg, Germany',
        applyUrl: 'https://fraunhofer.de/1',
        canonicalUrl: 'https://fraunhofer.de/1',
        contentHash: 'hash3',
        skills: ['Solar'],
        isRemote: false,
        status: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
    ];

    const result = filter.process(sampleItems);
    expect(result.filtered.length).toBe(1);
    expect(result.filtered[0].companyName).toBe('CNRS PROMES');
    expect(result.filtered[0].country).toBe('France');
    expect(result.rejectedCount).toBe(2);
  });

  it('ApplicationTailoringService: should pick the correct CV track for thermal vs microgrid offers', () => {
    const thermalPick = applicationTailoringService.selectBestCvTrack('Optimisation échangeurs de chaleur et bilan thermique');
    expect(thermalPick.track).toBe('CV_Seif_Thermicien');
    expect(thermalPick.fileName).toBe('CV_Seif_Thermicien.pdf');

    const microgridPick = applicationTailoringService.selectBestCvTrack('Microgrid control and battery storage management');
    expect(microgridPick.track).toBe('CV_Seif_Reseaux_Microgrids');
    expect(microgridPick.fileName).toBe('CV_Seif_Reseaux_Microgrids.pdf');

    const solarPick = applicationTailoringService.selectBestCvTrack('Modélisation système photovoltaïque et production hydrogène');
    expect(solarPick.track).toBe('CV_Seif_Energies_Renouvelables');
    expect(solarPick.fileName).toBe('CV_Seif_Energies_Renouvelables.pdf');
  });

  it('SupervisorScoutService: should filter out TN and DE and load French & International supervisors', () => {
    const list = supervisorScoutService.loadSupervisors();
    expect(list.length).toBeGreaterThan(0);
    // Ensure no excluded country is in the processed list
    const hasTunisia = list.some(s => s.country === 'TN' || s.country === 'Tunisia');
    const hasGermany = list.some(s => s.country === 'DE' || s.country === 'Germany');
    expect(hasTunisia).toBe(false);
    expect(hasGermany).toBe(false);
  });

  it('EmailSenderService: should resolve valid CV file path and handle mock sending', async () => {
    const { emailSenderService } = await import('../services/EmailSenderService.js');
    const cvPath = emailSenderService.resolveCvPath('CV_Seif_Thermicien.pdf');
    expect(cvPath).toContain('CV_Seif_Thermicien.pdf');

    const result = await emailSenderService.sendApplicationEmail({
      to: 'supervisor@lab.fr',
      subject: 'Candidature Stage PFE',
      bodyText: 'Madame, Monsieur...',
      cvFileName: 'CV_Seif_Thermicien.pdf',
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });

  it('MatchingEngine: should give high matching score (>80%) for French energy and CEA research internships', async () => {
    const { matchingEngine } = await import('../services/MatchingEngine.js');
    const { resumeParserService } = await import('../services/ResumeParserService.js');

    const sampleResume = (resumeParserService as any).extractStructuredProfile(
      'Seif Eddine Nefzi ENIM Ecole Nationale Ingenieurs Monastir Master Recherche Energetique Solaire PV Thermique Echangeur MATLAB Python'
    );

    const ceaInternship: CanonicalInternship = {
      id: 'cea-1',
      title: 'Stage 6 mois Ingénieur/Master – Fabrication additive laser-fil : Etude des stratégies de dépôt H/F',
      companyName: 'CEA',
      location: 'France',
      description: 'Domaine : Mécanique et thermique Contrat : Stage Modélisation et simulation transfert thermique laser',
      skills: ['Mécanique et thermique', 'Stage'],
      applyUrl: 'https://cea.fr/stage1',
      canonicalUrl: 'https://cea.fr/stage1',
      contentHash: 'hash-cea',
      isRemote: false,
      status: 'VERIFIED',
      createdAt: new Date().toISOString(),
    };

    const match = await matchingEngine.evaluateMatch(ceaInternship, sampleResume);
    expect(match.score).toBeGreaterThanOrEqual(80);
    expect(match.skillMatchScore).toBeGreaterThanOrEqual(70);
  });

  it('ApplicationTailoringService: should generate tailored paragraphs for STEP and Mechanical Storage', () => {
    const stepDraft = (applicationTailoringService as any).buildTechnicalDomainParagraph(
      'Stage STEP et stockage hydroélectrique par pompage-turbinage'
    );
    expect(stepDraft).toContain('STEP');
    expect(stepDraft).toContain('pompage');

    const flywheelDraft = (applicationTailoringService as any).buildTechnicalDomainParagraph(
      'Stockage mécanique par volant d’inertie pour microgrid'
    );
    expect(flywheelDraft).toContain('volants d\'inertie');
  });

  it('SupervisorScoutService: should contain authentic French lab supervisor emails', () => {
    const supervisors = supervisorScoutService.loadSupervisors();
    const hasPromes = supervisors.some(s => s.email.includes('@promes.cnrs.fr'));
    const hasG2Elab = supervisors.some(s => s.email.includes('@g2elab.grenoble-inp.fr') || s.email.includes('@grenoble-inp.fr'));
    const hasFemto = supervisors.some(s => s.email.includes('@univ-fcomte.fr'));
    const hasLaplace = supervisors.some(s => s.email.includes('@laplace.univ-tlse.fr'));

    expect(hasPromes).toBe(true);
    expect(hasG2Elab).toBe(true);
    expect(hasFemto).toBe(true);
    expect(hasLaplace).toBe(true);
  });

  it('ArchiveService: should archive offers into permanent closed folder and prevent repetition', async () => {
    const { archiveService } = await import('../services/ArchiveService.js');

    const testOffer: CanonicalInternship = {
      id: 'test-arch-1',
      title: 'Stage STEP & Hydroélectricité CNR',
      companyName: 'CNR',
      location: 'Lyon, France',
      applyUrl: 'https://cnr.tm.fr/stage-hydro-unique-123',
      canonicalUrl: 'https://cnr.tm.fr/stage-hydro-unique-123',
      contentHash: 'hash-unique-123',
      isRemote: false,
      status: 'VERIFIED',
      createdAt: new Date().toISOString(),
    };

    // Initially not archived
    archiveService.archiveOffers([testOffer]);
    expect(archiveService.isOfferArchived(testOffer)).toBe(true);
  });
});
