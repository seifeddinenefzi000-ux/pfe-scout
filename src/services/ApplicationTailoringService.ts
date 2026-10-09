import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';
import { geminiService } from './GeminiService.js';

export interface SupervisorRecord {
  name: string;
  email: string;
  institution: string;
  country: string;
  recentPublication: string;
  searchTopic: string;
  relevanceScore?: number;
}

export type CvTrack =
  | 'CV_Seif_Energies_Renouvelables'
  | 'CV_Seif_Thermicien'
  | 'CV_Seif_Efficacite_Energetique'
  | 'CV_Seif_Reseaux_Microgrids';

export interface ApplicationDraft {
  id: string;
  type: 'POSTED_OFFER' | 'COLD_SUPERVISOR';
  targetTitle: string;
  targetOrganization: string;
  targetContact: string;
  targetCountry: string;
  selectedCvTrack: CvTrack;
  cvFileName: string;
  emailSubject: string;
  coverLetterOrEmailBody: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  generatedAt: string;
}

export class ApplicationTailoringService {
  /**
   * Determine the best CV track based on text keywords
   */
  selectBestCvTrack(text: string): { track: CvTrack; fileName: string; reason: string } {
    const t = text.toLowerCase();

    // 1. Thermicien / Thermal Engineering
    if (
      t.includes('thermiq') ||
      t.includes('heat') ||
      t.includes('chaleur') ||
      t.includes('thermodynam') ||
      t.includes('échangeur') ||
      t.includes('echangeur') ||
      t.includes('four') ||
      t.includes('combustion') ||
      t.includes('pyrolyse') ||
      t.includes('cfd')
    ) {
      return {
        track: 'CV_Seif_Thermicien',
        fileName: 'CV_Seif_Thermicien.pdf',
        reason: 'Strong thermal systems, thermodynamics, and heat transfer focus.',
      };
    }

    // 2. Reseaux / Microgrids / Power
    if (
      t.includes('microgrid') ||
      t.includes('smart grid') ||
      t.includes('réseau') ||
      t.includes('reseau') ||
      t.includes('électron') ||
      t.includes('electron') ||
      t.includes('bess') ||
      t.includes('batter') ||
      t.includes('power system') ||
      t.includes('grid integration')
    ) {
      return {
        track: 'CV_Seif_Reseaux_Microgrids',
        fileName: 'CV_Seif_Reseaux_Microgrids.pdf',
        reason: 'Focus on electrical grids, microgrids, storage, and power systems.',
      };
    }

    // 3. Efficacité Énergétique / Energy Efficiency
    if (
      t.includes('efficacit') ||
      t.includes('audit') ||
      t.includes('optimis') ||
      t.includes('industr') ||
      t.includes('décarbon') ||
      t.includes('decarbon') ||
      t.includes('consommation')
    ) {
      return {
        track: 'CV_Seif_Efficacite_Energetique',
        fileName: 'CV_Seif_Efficacite_Energetique.pdf',
        reason: 'Tailored for industrial energy auditing and efficiency optimization.',
      };
    }

    // 4. Default: Energies Renouvelables (Solar, PV, Hydrogen, Wind)
    return {
      track: 'CV_Seif_Energies_Renouvelables',
      fileName: 'CV_Seif_Energies_Renouvelables.pdf',
      reason: 'General renewable energy systems (Solar, PV, Hydrogen, Wind).',
    };
  }

  /**
   * Generate customized application for a posted internship offer
   */
  async tailorForPostedOffer(offer: CanonicalInternship): Promise<ApplicationDraft> {
    const combined = `${offer.title} ${offer.description || ''} ${offer.companyName}`;
    const cvSelection = this.selectBestCvTrack(combined);

    const subject = `Candidature Stage PFE / Fin d'études — ${offer.title} — Seif Eddine Nefzi`;

    const body = `Madame, Monsieur,

Étudiant en 3ème année du cycle ingénieur en Génie Énergétique à l'École Nationale d'Ingénieurs de Monastir (ENIM) et préparant simultanément un Master de Recherche en Énergétique, je vous adresse ma candidature pour l'offre de stage de fin d'études intitulée : "${offer.title}".

Passionné par les problématiques concrètes de transition et d'efficacité énergétique, j'ai notamment dirigé des projets de prototypage (suiveur solaire, éclairage intelligent) en tant que chef de projet du club énergie de l'ENIM, et acquis une expérience de terrain lors d'optimisations thermiques industrielles (fours et échangeurs de chaleur à la SOTULUB) et d'analyses de production (CTKCP).

Votre sujet au sein de ${offer.companyName} correspond exactement à mon projet professionnel et à mes compétences en modélisation (Python, MATLAB/Simulink), instrumentation et dimensionnement énergétique. Rigoureux et animé d'une forte capacité d'apprentissage, je serais honoré de mettre mon énergie au service de vos travaux pour ce PFE de 6 mois.

Vous trouverez ci-joint mon curriculum vitae (${cvSelection.fileName}) adapté à cette thématique. Je reste à votre entière disposition pour tout entretien à votre convenance.

Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Seif Eddine Nefzi
Élève-Ingénieur en Génie Énergétique & Master Recherche — ENIM
Tél : (+216) 20 016 808 | nefzi.seifeddine@enim.u-monastir.tn`;

    return {
      id: offer.id || `offer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'POSTED_OFFER',
      targetTitle: offer.title,
      targetOrganization: offer.companyName,
      targetContact: offer.applyUrl,
      targetCountry: offer.country || 'France',
      selectedCvTrack: cvSelection.track,
      cvFileName: cvSelection.fileName,
      emailSubject: subject,
      coverLetterOrEmailBody: body,
      status: 'PENDING_APPROVAL',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate customized cold email for a research supervisor
   */
  async tailorForSupervisor(supervisor: SupervisorRecord): Promise<ApplicationDraft> {
    const combined = `${supervisor.recentPublication} ${supervisor.searchTopic} ${supervisor.institution}`;
    const cvSelection = this.selectBestCvTrack(combined);

    const subject = `Candidature Stage Master 2 / PFE — Recherche en Énergétique — Seif Eddine Nefzi`;

    const body = `Bonjour Professeur / Chercheur(e) ${supervisor.name},

Je suis étudiant en 3ème année du cycle ingénieur en Génie Énergétique à l'ENIM (École Nationale d'Ingénieurs de Monastir) et en double cursus Master Recherche en Énergétique.

J'ai découvert avec un vif intérêt vos travaux récents au sein de ${supervisor.institution}, notamment sur "${supervisor.recentPublication}". Vos recherches sur ${supervisor.searchTopic} résonnent directement avec mon parcours et mes projets de modélisation et d'optimisation des systèmes énergétiques.

Dans le cadre de mon Projet de Fin d'Études (PFE / Stage Master 2 de 6 mois, début 2027), je recherche une immersion au sein de votre équipe de recherche. Habitué à allier théorie et travaux appliqués (conception d'un suiveur solaire autonome, optimisations thermiques industrielles, modélisation sous MATLAB/Simulink et Python), je serais ravi de m'investir pleinement sur vos axes de recherche en cours.

Je me permets de vous joindre mon CV (${cvSelection.fileName}) détaillant mon parcours académique et mes réalisations techniques.

Seriez-vous disponible pour un court échange afin de discuter des opportunités d'accueil au sein de votre laboratoire ?

En vous remerciant sincèrement pour votre attention, je vous prie d'agréer l'expression de mes salutations les plus respectueuses.

Seif Eddine Nefzi
Élève-Ingénieur Génie Énergétique & Master Recherche — ENIM
Tél : (+216) 20 016 808 | Email : nefzi.seifeddine@enim.u-monastir.tn`;

    return {
      id: `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'COLD_SUPERVISOR',
      targetTitle: `PFE Research: ${supervisor.searchTopic}`,
      targetOrganization: supervisor.institution,
      targetContact: supervisor.email,
      targetCountry: supervisor.country,
      selectedCvTrack: cvSelection.track,
      cvFileName: cvSelection.fileName,
      emailSubject: subject,
      coverLetterOrEmailBody: body,
      status: 'PENDING_APPROVAL',
      generatedAt: new Date().toISOString(),
    };
  }
}

export const applicationTailoringService = new ApplicationTailoringService();
