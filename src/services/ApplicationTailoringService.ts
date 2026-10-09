import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

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

    // 1. Reseaux / Microgrids / Power Systems / Grid Integration
    if (
      t.includes('microgrid') ||
      t.includes('smart grid') ||
      t.includes('réseau') ||
      t.includes('reseau') ||
      t.includes('électron') ||
      t.includes('electron') ||
      t.includes('power system') ||
      t.includes('grid integration') ||
      t.includes('onduleur') ||
      t.includes('convertisseur') ||
      t.includes('ems')
    ) {
      return {
        track: 'CV_Seif_Reseaux_Microgrids',
        fileName: 'CV_Seif_Reseaux_Microgrids.pdf',
        reason: 'Focus on electrical grids, microgrids, smart grids, and power electronics.',
      };
    }

    // 2. Thermicien / Thermal Systems / Heat Exchangers
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
        reason: 'Strong thermal systems, thermodynamics, CFD, and heat exchanger focus.',
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
      t.includes('bâtiment') ||
      t.includes('consommation')
    ) {
      return {
        track: 'CV_Seif_Efficacite_Energetique',
        fileName: 'CV_Seif_Efficacite_Energetique.pdf',
        reason: 'Tailored for industrial energy auditing and efficiency optimization.',
      };
    }

    // 4. Default: Energies Renouvelables (Solar PV, BESS, STEP, Mechanical Storage, Hydrogen)
    return {
      track: 'CV_Seif_Energies_Renouvelables',
      fileName: 'CV_Seif_Energies_Renouvelables.pdf',
      reason: 'General renewable energy systems (Solar PV, Battery/STEP storage, Hydrogen).',
    };
  }

  /**
   * Build domain-specific customized paragraph
   */
  private buildTechnicalDomainParagraph(text: string): string {
    const t = text.toLowerCase();

    // A. STEP (Station de Transfert d'Énergie par Pompage / Hydro storage)
    if (t.includes('step') || t.includes('pompage') || t.includes('hydro') || t.includes('turbinage')) {
      return `Particulièrement passionné par le stockage massif et l'hydro-électricité (STEP), j'ai développé une solide maîtrise des bilans thermodynamiques et hydrauliques, ainsi que de la modélisation sous MATLAB/Simulink pour l'optimisation des cycles de turbinage-pompage et la régulation de fréquence sur les réseaux électriques.`;
    }

    // B. Mechanical Storage (Flywheels, CAES, compressed air)
    if (t.includes('mécanique') || t.includes('mecanique') || t.includes('volant') || t.includes('flywheel') || t.includes('air comprimé') || t.includes('caes')) {
      return `Attiré par les solutions innovantes de stockage mécanique (volants d'inertie, CAES), j'allie une solide formation en mécanique des fluides et thermodynamique à une capacité éprouvée de simulation dynamique sous MATLAB/Simulink et Python pour l'analyse des rendements et de la réponse transitoire.`;
    }

    // C. Microgrids & Smart Grids
    if (t.includes('microgrid') || t.includes('smart grid') || t.includes('réseau') || t.includes('reseau') || t.includes('ems')) {
      return `Spécialisé dans les réseaux intelligents et les microgrids, j'ai notamment mené des projets de modélisation de flux de puissance et d'algorithmes de gestion d'énergie (EMS) sous MATLAB/Simulink et Python, en intégrant des sources renouvelables fluctuantes et des systèmes de stockage hybrides.`;
    }

    // D. Solar PV & Solar Tracking
    if (t.includes('solaire') || t.includes('solar') || t.includes('pv') || t.includes('photovolta')) {
      return `Ayant dirigé la conception complète et le prototypage d'un suiveur solaire autonome (dual-axis solar tracker) à l'ENIM, je dispose d'une expérience concrète en dimensionnement photovoltaïque (PVsyst, Python), en instrumentation (capteurs, régulation MPPT) et en optimisation du rendement sous conditions réelles.`;
    }

    // E. Battery & BESS Storage
    if (t.includes('batter') || t.includes('bess') || t.includes('stockage') || t.includes('storage')) {
      return `Très investi dans les technologies de stockage stationnaire par batterie (BESS) et leur couplage aux sources renouvelables, je maîtrise la modélisation électro-thermique, l'estimation des états de charge (SoC/SoH) et la gestion optimale de la décharge pour stabiliser les réseaux.`;
    }

    // F. Thermal & Heat Exchangers
    if (t.includes('thermiq') || t.includes('chaleur') || t.includes('échangeur') || t.includes('four')) {
      return `Fort d'expériences industrielles concrètes lors d'optimisations thermiques à la SOTULUB (fours et échangeurs de chaleur) et d'analyses de production à la CTKCP, j'applique avec rigueur les méthodes de calcul de transferts thermiques et de dimensionnement d'échangeurs sous contraintes sévères.`;
    }

    // Default Renewable Energy paragraph
    return `Mon parcours m'a permis d'allier rigueur théorique et réalisations pratiques : conception d'un suiveur solaire autonome au sein du club énergie de l'ENIM, modélisation dynamique de systèmes énergétiques sous MATLAB/Simulink et Python, et audits thermiques en milieu industriel (SOTULUB).`;
  }

  /**
   * Generate customized application for a posted internship offer
   */
  async tailorForPostedOffer(offer: CanonicalInternship): Promise<ApplicationDraft> {
    const combined = `${offer.title} ${offer.description || ''} ${offer.companyName}`;
    const cvSelection = this.selectBestCvTrack(combined);
    const domainHighlight = this.buildTechnicalDomainParagraph(combined);

    const subject = `Candidature Stage PFE / Fin d'études — ${offer.title} — Seif Eddine Nefzi`;

    const body = `Madame, Monsieur,

Étudiant en 3ème année du cycle ingénieur en Génie Énergétique à l'École Nationale d'Ingénieurs de Monastir (ENIM) et préparant en parallèle un Master de Recherche en Énergétique, je vous présente avec grand enthousiasme ma candidature pour le stage de fin d'études : "${offer.title}".

${domainHighlight}

Rejoindre ${offer.companyName} sur cette thématique constitue l'aboutissement naturel de mon projet professionnel. Mes compétences en simulation numérique (Python, MATLAB/Simulink), dimensionnement énergétique et instrumentation me permettront d'être immédiatement opérationnel et de contribuer activement aux objectifs de votre équipe lors de ce stage de 6 mois (début 2027).

Vous trouverez ci-joint mon curriculum vitae (${cvSelection.fileName}) adapté à ce domaine. Je reste à votre entière disposition pour convenir d'un entretien.

Veuillez agréer, Madame, Monsieur, l'expression de mes salutations les plus distinguées.

Seif Eddine Nefzi
Élève-Ingénieur en Génie Énergétique & Master Recherche — ENIM
Tél : (+216) 20 016 808 | Email : nefzi.seifeddine@enim.u-monastir.tn`;

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
    const domainHighlight = this.buildTechnicalDomainParagraph(combined);

    const subject = `Candidature Stage Master 2 / PFE — Recherche en Énergétique — Seif Eddine Nefzi`;

    const body = `Bonjour Professeur / Chercheur(e) ${supervisor.name},

Je suis élève-ingénieur en 3ème année de Génie Énergétique à l'École Nationale d'Ingénieurs de Monastir (ENIM), tout en préparant simultanément un Master de Recherche en Énergétique.

J'ai pris connaissance avec un grand intérêt de vos travaux au sein de ${supervisor.institution}, notamment sur "${supervisor.recentPublication}". Vos recherches dans le domaine de "${supervisor.searchTopic}" correspondent directement à mon projet de spécialisation en recherche & développement.

${domainHighlight}

Dans la perspective de mon Projet de Fin d'Études (PFE / Stage Master 2 de 6 mois, début 2027), je souhaite vivement rejoindre votre groupe de recherche afin de participer à vos projets en cours sur la transition et les systèmes énergétiques.

Je joins à ce message mon CV (${cvSelection.fileName}) résumant mon parcours académique et mes compétences techniques.

Seriez-vous disponible pour un court échange afin d'évoquer d'éventuelles opportunités d'accueil au sein de votre laboratoire ?

En vous remerciant pour votre temps et votre bienveillance, je vous prie d'agréer l'expression de mes salutations les plus respectueuses.

Seif Eddine Nefzi
Élève-Ingénieur Génie Énergétique & Master Recherche — ENIM
Tél : (+216) 20 016 808 | Email : nefzi.seifeddine@enim.u-monastir.tn`;

    return {
      id: `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'COLD_SUPERVISOR',
      targetTitle: `PFE Recherche: ${supervisor.searchTopic}`,
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
