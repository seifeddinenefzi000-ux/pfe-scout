import path from 'path';
import fs from 'fs';
import { CanonicalInternship } from '../models/DomainModels.js';
import { getSupabaseClient } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { latexCoverLetterService } from './LatexCoverLetterService.js';
import { draftStorageService, ApplicationDraft } from './DraftStorageService.js';

export type { ApplicationDraft } from './DraftStorageService.js';

export interface SupervisorRecord {
  name: string;
  email: string;
  institution: string;
  country: string;
  recentPublication: string;
  searchTopic: string;
  relevanceScore?: number;
}

// Backwards compatibility map proxying draftStorageService
export const draftRegistry = {
  get(id: string): ApplicationDraft | undefined {
    return draftStorageService.getDraft(id) || undefined;
  },
  set(id: string, draft: ApplicationDraft) {
    draftStorageService.saveDraft(draft);
  },
  has(id: string): boolean {
    return Boolean(draftStorageService.getDraft(id));
  },
};

export class ApplicationTailoringService {
  private supabase = getSupabaseClient();
  private resumesDir = path.join(process.cwd(), 'data', 'resumes');

  /**
   * Cleans text from raw symbols, job IDs, and markdown artifacts
   */
  cleanHumanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/^[0-9]{4}-[0-9]+\s*-\s*/, '')
      .replace(/\bH\/F\b|\bF\/H\b|\b(h\/f)\b/gi, '')
      .replace(/[_\*#`~\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Detect language (FR or EN) based on country and text
   */
  detectLanguage(country: string, text: string): 'FR' | 'EN' {
    const c = (country || '').toLowerCase();
    const t = (text || '').toLowerCase();

    if (c === 'france' || c === 'fr' || c === 'quebec' || c === 'suisse' || c === 'belgique') {
      return 'FR';
    }

    if (
      t.includes('stage') ||
      t.includes('candidature') ||
      t.includes('école') ||
      t.includes('ingénieur') ||
      t.includes('énergétique') ||
      t.includes('systèmes')
    ) {
      return 'FR';
    }

    return 'EN';
  }

  /**
   * Resolve Resume file path according to language
   * Both will always be attached as "cv_Seif_Eddine_Nefzi.pdf"
   */
  resolveResumeSource(language: 'FR' | 'EN'): string {
    const fileName = language === 'FR' ? 'SeifEddine_Nefzi_Resume_FR.pdf' : 'SeifEddine_Nefzi_Resume_EN.pdf';
    const localPath = path.join(this.resumesDir, fileName);

    if (fs.existsSync(localPath)) {
      return localPath;
    }

    // Fallback if not found in data/resumes
    const rootPath = path.join(process.cwd(), fileName);
    if (fs.existsSync(rootPath)) {
      return rootPath;
    }

    return localPath;
  }

  /**
   * Resolve best direct contact email or application URL for a published offer
   */
  resolveOfferContact(offer: CanonicalInternship): string {
    // 0. If already extracted from a laboratory PDF sheet or metadata
    if (offer.metadata?.contactEmail && typeof offer.metadata.contactEmail === 'string' && offer.metadata.contactEmail.includes('@')) {
      return offer.metadata.contactEmail;
    }
    if (offer.metadata?.supervisorEmail && typeof offer.metadata.supervisorEmail === 'string' && offer.metadata.supervisorEmail.includes('@')) {
      return offer.metadata.supervisorEmail;
    }

    // 1. Check if applyUrl is a direct mailto: link
    if (offer.applyUrl && offer.applyUrl.startsWith('mailto:')) {
      const email = offer.applyUrl.replace('mailto:', '').split('?')[0].trim();
      if (email.includes('@')) return email;
    }

    // 2. Scan offer description for an explicit recruiter or supervisor email
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const descMatches = (offer.description || '').match(emailRegex);
    if (descMatches && descMatches.length > 0) {
      const candidateEmail = descMatches.find((e) => !e.includes('nefzi') && !e.includes('gmail.com'));
      if (candidateEmail) return candidateEmail;
    }

    // 3. Known laboratory and company recruitment / internship directories
    const companyLower = (offer.companyName || '').toLowerCase();
    const titleLower = (offer.title || '').toLowerCase();

    const knownDirectory: Record<string, string> = {
      'ines': 'recrutement.liten@cea.fr',
      'cea': 'recrutement-etudiants@cea.fr',
      'cnrs': 'stages-recherche@cnrs.fr',
      'promes': 'contact@promes.cnrs.fr',
      'epfl': 'pvlab@epfl.ch',
      'sotulub': 'direction.technique@sotulub.com.tn',
      'zenith': 'contact@zenith-solar.com',
      'ctkcp': 'rh@ctkcp.com',
      'edf': 'stages-recrutement@edf.fr',
      'engie': 'carrieres.france@engie.com',
      'total': 'carrieres@totalenergies.com',
      'schneider': 'fr-carrieres@schneider-electric.com',
      'renac': 'info@renac.de',
    };

    for (const [key, email] of Object.entries(knownDirectory)) {
      if (companyLower.includes(key) || titleLower.includes(key)) {
        return email;
      }
    }

    // 4. Fallback to applyUrl / canonicalUrl
    return offer.applyUrl || offer.canonicalUrl || '';
  }

  /**
   * Select 2-3 matched requirement bullets for published offer (Section 4 menu)
   */
  private selectPublishedOfferBullets(combinedText: string, language: 'FR' | 'EN'): string[] {
    const t = combinedText.toLowerCase();
    const bullets: string[] = [];

    if (language === 'FR') {
      // 1. Optimisation / microgrids
      if (t.includes('microgrid') || t.includes('ems') || t.includes('optimis') || t.includes('réseau') || t.includes('reseau')) {
        bullets.push(
          "- Optimisation et gestion d'énergie : développement d'un système de gestion d'énergie pour un microgrid hybride sous Python, avec un backend FastAPI, comparant quatre méthodes d'optimisation (programmation dynamique, algorithme génétique, optimisation par essaim de particules et programmation linéaire)"
        );
      }

      // 2. Python / MATLAB / simulation
      if (t.includes('python') || t.includes('matlab') || t.includes('simul') || t.includes('modélis') || t.includes('modelis')) {
        bullets.push(
          "- Simulation et modélisation : simulation sous Python et MATLAB dans mes projets, dont la simulation de la performance annuelle d'un suiveur solaire pour Zarzis, Tunisie (résultats de simulation)"
        );
      }

      // 3. Photovoltaïque / Solaire
      if (t.includes('photovolta') || t.includes('solaire') || t.includes('solar') || t.includes('pv')) {
        bullets.push(
          "- Dimensionnement photovoltaïque : dimensionnement d'installations photovoltaïques et réalisation d'études techniques lors de mon stage chez Zenith Solar Engineering (juin 2026)"
        );
      }

      // 4. Efficacité énergétique / Chaleur fatale
      if (t.includes('efficacit') || t.includes('chaleur') || t.includes('procéd') || t.includes('proced') || t.includes('audit')) {
        bullets.push(
          "- Efficacité énergétique et procédés : analyse de la consommation énergétique d'un procédé de régénération d'huiles usagées et étude de la récupération de chaleur fatale lors de mon stage chez SOTULUB (Société Tunisienne des Lubrifiants, août 2025)"
        );
      }

      // 5. Stockage par batteries
      if (t.includes('batter') || t.includes('stockage') || t.includes('storage') || t.includes('bess')) {
        bullets.push(
          "- Stockage par batteries : formation en systèmes de stockage d'énergie par batteries pour les services système du réseau chez RENAC (Renewables Academy), score 96,67 %"
        );
      }

      // Fallback French bullets to guarantee 2-3 solid matches
      if (bullets.length < 2) {
        bullets.push(
          "- Modélisation de systèmes : simulation numérique sous Python et MATLAB de systèmes énergétiques et comparaison de méthodes d'optimisation"
        );
        bullets.push(
          "- Expérience concrète de terrain : études d'efficacité énergétique et de dimensionnement lors de stages industriels chez SOTULUB et Zenith Solar Engineering"
        );
      }
    } else {
      // English
      if (t.includes('microgrid') || t.includes('ems') || t.includes('optimis') || t.includes('grid')) {
        bullets.push(
          '- Optimization and energy management: built an energy management system for a hybrid microgrid in Python, with a FastAPI backend, comparing four optimization methods (dynamic programming, genetic algorithm, particle swarm optimization and linear programming)'
        );
      }

      if (t.includes('python') || t.includes('matlab') || t.includes('simul') || t.includes('model')) {
        bullets.push(
          '- Simulation and modelling: Python and MATLAB simulation in my projects, including the annual performance simulation of a solar tracker for Zarzis, Tunisia (simulation results)'
        );
      }

      if (t.includes('photovolta') || t.includes('solar') || t.includes('pv')) {
        bullets.push(
          '- Photovoltaic design and sizing: sized photovoltaic installations and carried out technical studies during my internship at Zenith Solar Engineering (June 2026)'
        );
      }

      if (t.includes('efficien') || t.includes('heat') || t.includes('process') || t.includes('audit')) {
        bullets.push(
          '- Energy efficiency and process: analysed the energy use of a used-oil regeneration process and studied waste heat recovery during my internship at SOTULUB (Tunisian Lubricants Company, August 2025)'
        );
      }

      if (t.includes('batter') || t.includes('storage') || t.includes('bess')) {
        bullets.push(
          '- Battery storage: trained in Battery Energy Storage Systems for Grid Ancillary Services at RENAC (Renewables Academy), score 96.67%'
        );
      }

      // Fallback English bullets
      if (bullets.length < 2) {
        bullets.push(
          '- Energy systems modelling: numerical simulation in Python and MATLAB, and benchmarking of optimization algorithms'
        );
        bullets.push(
          '- Practical engineering: hands-on sizing and industrial energy audit experience at Zenith Solar Engineering and SOTULUB'
        );
      }
    }

    return bullets.slice(0, 3);
  }

  /**
   * Tailor application for a PUBLISHED internship offer
   */
  async tailorForPostedOffer(offer: CanonicalInternship): Promise<ApplicationDraft> {
    const cleanTitle = this.cleanHumanText(offer.title);
    const cleanCompany = this.cleanHumanText(offer.companyName);
    const combined = `${cleanTitle} ${offer.description || ''} ${cleanCompany}`;
    const language = this.detectLanguage(offer.country, combined);
    const resumeSourcePath = this.resolveResumeSource(language);
    const cvAttachmentName = 'cv_Seif_Eddine_Nefzi.pdf';

    const draftId = offer.id || `offer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const supervisorName = (offer.metadata as any)?.supervisorName as string | undefined;

    // Generate customized LaTeX Cover Letter PDF
    const coverLetterResult = await latexCoverLetterService.generateCoverLetter({
      id: draftId,
      language,
      organization: cleanCompany,
      positionTitle: cleanTitle,
      recipientTitle: supervisorName ? `À l'attention de ${supervisorName}` : undefined,
      cityCountry: offer.location || offer.country,
      topicText: offer.description,
      specificReason: cleanTitle,
    });

    const bullets = this.selectPublishedOfferBullets(combined, language);
    let subject = '';
    let emailBody = '';

    if (language === 'FR') {
      const salutation = supervisorName ? `Bonjour ${supervisorName},` : 'Madame, Monsieur,';
      subject = `Candidature - ${cleanTitle} - Seif Eddine Nefzi`;
      emailBody = `${salutation}

Je vous adresse ma candidature pour l'offre « ${cleanTitle} » chez ${cleanCompany}. Je suis en dernière année du cycle ingénieur en Génie Énergétique, spécialité Énergies Renouvelables, à l'ENIM (École Nationale d'Ingénieurs de Monastir), en parallèle d'un Master de recherche en Gestion des Systèmes Énergétiques, et je suis disponible pour 4 à 6 mois à partir de janvier 2027.

Votre offre correspond à mon parcours sur les points essentiels :
${bullets.join('\n')}

Ce qui m'attire dans cette offre, c'est le travail sur ${cleanTitle}, directement relié à mes compétences en simulation et dimensionnement de systèmes énergétiques.

Vous trouverez ci-joint mon CV et ma lettre de motivation. Je serais ravi de vous présenter ma candidature lors d'un entretien, à la date qui vous conviendrait.

Je vous remercie de l'attention portée à ma candidature.

Bien cordialement,
Seif Eddine Nefzi
ENIM (École Nationale d'Ingénieurs de Monastir) - Génie Énergétique
(+216) 20 016 808
seifeddinenefzi000@gmail.com
linkedin.com/in/nefzi-seifeddine`;
    } else {
      subject = `Application - ${cleanTitle} - Seif Eddine Nefzi`;
      emailBody = `Dear Hiring Team,

I am applying for the ${cleanTitle} role at ${cleanCompany}. I am in my final year of the Engineering Degree in Energy Engineering (Renewable Energies track) at ENIM (National Engineering School of Monastir), alongside a Research Master's in Energy Systems Management, and I am available for 4 to 6 months from January 2027.

Your offer matches my background on the points that matter most:
${bullets.join('\n')}

What attracts me in this offer is the focus on ${cleanTitle}, which is closely aligned with my work in simulation and energy systems modelling.

Please find attached my CV and my cover letter. I would be glad to discuss my application in an interview, at a time that suits you.

Thank you for your time and consideration.

Kind regards,
Seif Eddine Nefzi
ENIM (National Engineering School of Monastir) - Energy Engineering
(+216) 20 016 808
seifeddinenefzi000@gmail.com
linkedin.com/in/nefzi-seifeddine`;
    }

    const draft: ApplicationDraft = {
      id: draftId,
      type: 'POSTED_OFFER',
      language,
      targetTitle: cleanTitle,
      targetOrganization: cleanCompany,
      targetContact: this.resolveOfferContact(offer),
      targetCountry: offer.country || 'France',
      sourceResumePath: resumeSourcePath,
      cvAttachmentName,
      coverLetterPdfPath: coverLetterResult.pdfPath,
      coverLetterPdfName: coverLetterResult.pdfFileName,
      coverLetterTexPath: coverLetterResult.texPath,
      emailSubject: subject,
      coverLetterOrEmailBody: emailBody,
      status: 'PENDING_APPROVAL',
      generatedAt: new Date().toISOString(),
    };

    // Save to persistent storage
    draftStorageService.saveDraft(draft);

    // Save to Supabase if available
    try {
      await this.supabase.from('applications').upsert({
        id: draft.id,
        type: draft.type,
        target_name: draft.targetTitle,
        organization: draft.targetOrganization,
        contact_info: draft.targetContact,
        country: draft.targetCountry,
        cv_track_used: cvAttachmentName,
        email_subject: draft.emailSubject,
        letter_content: draft.coverLetterOrEmailBody,
        status: 'PENDING_APPROVAL',
        created_at: draft.generatedAt,
        updated_at: draft.generatedAt,
      });
    } catch {}

    return draft;
  }

  /**
   * Tailor application for a COLD SUPERVISOR outreach
   */
  async tailorForSupervisor(supervisor: SupervisorRecord): Promise<ApplicationDraft> {
    const cleanPub = this.cleanHumanText(supervisor.recentPublication);
    const cleanTopic = this.cleanHumanText(supervisor.searchTopic);
    const cleanInst = this.cleanHumanText(supervisor.institution);
    const cleanName = supervisor.name.replace(/^Prof\.\s*|^Dr\.\s*/i, '').trim();
    const salutationName = supervisor.name.startsWith('Prof') ? `Professeur ${cleanName}` : `Docteur ${cleanName}`;
    const salutationNameEn = supervisor.name.startsWith('Prof') ? `Professor ${cleanName}` : `Dr. ${cleanName}`;

    const combined = `${cleanPub} ${cleanTopic} ${cleanInst}`;
    const language = this.detectLanguage(supervisor.country, combined);
    const resumeSourcePath = this.resolveResumeSource(language);
    const cvAttachmentName = 'cv_Seif_Eddine_Nefzi.pdf';

    const draftId = `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Generate customized LaTeX Cover Letter PDF
    const coverLetterResult = await latexCoverLetterService.generateCoverLetter({
      id: draftId,
      language,
      organization: cleanInst,
      positionTitle: `Stage Master 2 / PFE : ${cleanTopic}`,
      cityCountry: supervisor.country,
      topicText: `${cleanTopic} ${cleanPub}`,
      specificReason: cleanPub,
    });

    let subject = '';
    let emailBody = '';

    if (language === 'FR') {
      subject = `Candidature stage Master 2 / PFE — ${cleanTopic} — Seif Eddine Nefzi`;

      let p3Proof =
        "j'ai développé un système de gestion d'énergie pour microréseau hybride sous Python, comparant quatre méthodes d'optimisation (programmation dynamique, algorithme génétique, essaim de particules, programmation linéaire)";
      const t = combined.toLowerCase();
      if (t.includes('solaire') || t.includes('solar') || t.includes('tracker')) {
        p3Proof =
          "j'ai conçu un suiveur solaire à actionneur unique (concours IEEE Zucker), atteignant en simulation sous Python un rendement de 134 % par rapport au plan fixe (résultats de simulation)";
      } else if (t.includes('thermiq') || t.includes('chaleur') || t.includes('audit')) {
        p3Proof =
          "j'ai mené des études d'efficacité énergétique et de récupération de chaleur fatale industrielle chez SOTULUB (Société Tunisienne des Lubrifiants)";
      } else if (t.includes('batter') || t.includes('stockage') || t.includes('storage')) {
        p3Proof =
          "je suis certifié par la RENAC en systèmes de stockage par batteries pour les services réseau (score 96,67 %) et en IA appliquée aux énergies renouvelables";
      }

      emailBody = `Bonjour ${salutationName},

Je suis en dernière année du cycle ingénieur en Génie Énergétique à l'ENIM (École Nationale d'Ingénieurs de Monastir), en parallèle d'un Master de recherche en Gestion des Systèmes Énergétiques. Je recherche un stage de fin d'études de 4 à 6 mois à partir de janvier 2027.

J'ai découvert avec beaucoup d'intérêt vos travaux récents au sein de ${cleanInst}, notamment sur « ${cleanPub} ». Vos approches dans le domaine de ${cleanTopic} rejoignent précisément mon intérêt pour la transition et l'optimisation des systèmes énergétiques.

De mon côté, ${p3Proof}.

Auriez-vous une opportunité de stage au sein de votre équipe pour le premier semestre 2027 ? Si ce n'est pas le cas, auriez-vous l'amabilité de m'orienter vers un collègue travaillant sur des thématiques connexes ?

Vous trouverez ci-joint mon CV et ma lettre de motivation.

En vous remerciant sincèrement pour votre attention et vos conseils.

Bien cordialement,
Seif Eddine Nefzi
ENIM (École Nationale d'Ingénieurs de Monastir) - Génie Énergétique
(+216) 20 016 808
seifeddinenefzi000@gmail.com
linkedin.com/in/nefzi-seifeddine`;
    } else {
      subject = `Graduation internship application — ${cleanTopic} — Seif Eddine Nefzi`;

      let p3Proof =
        'I built a hybrid microgrid energy management system in Python, benchmarking four optimization methods (dynamic programming, genetic algorithm, particle swarm optimization, linear programming)';
      const t = combined.toLowerCase();
      if (t.includes('solar') || t.includes('photovolta') || t.includes('tracker')) {
        p3Proof =
          'I designed a single-actuator kinematic solar tracker for the IEEE Zucker Design Contest, achieving in Python simulation a 134% yield compared to fixed tilt (simulation results)';
      } else if (t.includes('heat') || t.includes('thermo') || t.includes('audit')) {
        p3Proof =
          'I conducted industrial energy audits and waste heat recovery studies during my internship at SOTULUB (Tunisian Lubricants Company)';
      } else if (t.includes('batter') || t.includes('storage')) {
        p3Proof =
          'I am certified by RENAC in Battery Energy Storage Systems for grid ancillary services (96.67% score) and AI for renewable energy';
      }

      emailBody = `Dear ${salutationNameEn},

I am in my final year of the Energy Engineering degree at ENIM (National Engineering School of Monastir), alongside a Research Master's in Energy Systems Management. I am seeking a 4 to 6 month graduation internship starting in January 2027.

I followed with great interest your recent work at ${cleanInst}, particularly on "${cleanPub}". Your research in ${cleanTopic} aligns directly with the challenges I wish to tackle.

On my end, ${p3Proof}.

Would you have an opening for a research intern in your group for the first semester of 2027? If not, would you happen to know a colleague working on related topics whom I could contact?

Please find attached my CV and my cover letter.

Thank you very much for your time and guidance.

Kind regards,
Seif Eddine Nefzi
ENIM (National Engineering School of Monastir) - Energy Engineering
(+216) 20 016 808
seifeddinenefzi000@gmail.com
linkedin.com/in/nefzi-seifeddine`;
    }

    const draft: ApplicationDraft = {
      id: draftId,
      type: 'COLD_SUPERVISOR',
      language,
      targetTitle: `PFE Recherche : ${cleanTopic}`,
      targetOrganization: cleanInst,
      targetContact: supervisor.email,
      targetCountry: supervisor.country,
      sourceResumePath: resumeSourcePath,
      cvAttachmentName,
      coverLetterPdfPath: coverLetterResult.pdfPath,
      coverLetterPdfName: coverLetterResult.pdfFileName,
      coverLetterTexPath: coverLetterResult.texPath,
      emailSubject: subject,
      coverLetterOrEmailBody: emailBody,
      status: 'PENDING_APPROVAL',
      generatedAt: new Date().toISOString(),
    };

    // Save to persistent storage
    draftStorageService.saveDraft(draft);

    // Save to Supabase if available
    try {
      await this.supabase.from('applications').upsert({
        id: draft.id,
        type: draft.type,
        target_name: draft.targetTitle,
        organization: draft.targetOrganization,
        contact_info: draft.targetContact,
        country: draft.targetCountry,
        cv_track_used: cvAttachmentName,
        email_subject: draft.emailSubject,
        letter_content: draft.coverLetterOrEmailBody,
        status: 'PENDING_APPROVAL',
        created_at: draft.generatedAt,
        updated_at: draft.generatedAt,
      });
    } catch {}

    return draft;
  }
}

export const applicationTailoringService = new ApplicationTailoringService();
