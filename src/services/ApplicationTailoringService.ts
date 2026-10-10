import { CanonicalInternship } from '../models/DomainModels.js';
import { getSupabaseClient } from '../database/client.js';
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

export const draftRegistry = new Map<string, ApplicationDraft>();

export class ApplicationTailoringService {
  private supabase = getSupabaseClient();

  /**
   * Cleans text from raw symbols, internal job IDs, and markdown artifacts
   */
  cleanHumanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/^[0-9]{4}-[0-9]+\s*-\s*/, '') // Remove job codes like 2026-42019 -
      .replace(/\bH\/F\b|\bF\/H\b|\b(h\/f)\b/gi, '') // Remove HR gender tags
      .replace(/[_\*#`~\[\]]/g, ' ') // Remove markdown / underscore symbols
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Determine the best CV track based on text keywords
   */
  selectBestCvTrack(text: string): { track: CvTrack; fileName: string; naturalDescription: string } {
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
        naturalDescription: 'spécialisé en réseaux électriques intelligents, microgrids et électronique de puissance',
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
        naturalDescription: 'spécialisé en génie thermique, thermodynamique appliquée et échangeurs de chaleur',
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
        naturalDescription: 'orienté vers l’audit énergétique industriel, l’optimisation des procédés et la décarbonation',
      };
    }

    // 4. Default: Energies Renouvelables (Solar PV, BESS, STEP, Mechanical Storage, Hydrogen)
    return {
      track: 'CV_Seif_Energies_Renouvelables',
      fileName: 'CV_Seif_Energies_Renouvelables.pdf',
      naturalDescription: 'spécialisé en énergies renouvelables (solaire photovoltaïque) et systèmes de stockage d’énergie',
    };
  }

  /**
   * Build domain-specific customized paragraph
   */
  private buildTechnicalDomainParagraph(text: string): string {
    const t = text.toLowerCase();

    // A. STEP (Station de Transfert d'Énergie par Pompage / Hydro storage)
    if (t.includes('step') || t.includes('pompage') || t.includes('hydro') || t.includes('turbinage')) {
      return `Particulièrement passionné par le stockage massif et l'hydroélectricité (STEP), j'ai développé une solide maîtrise des bilans thermodynamiques et hydrauliques, ainsi que de la modélisation sous MATLAB et Simulink pour l'optimisation des cycles de turbinage et pompage et la régulation de fréquence sur les réseaux électriques.`;
    }

    // B. Mechanical Storage (Flywheels, CAES, compressed air)
    if (t.includes('mécanique') || t.includes('mecanique') || t.includes('volant') || t.includes('flywheel') || t.includes('air comprimé') || t.includes('caes')) {
      return `Attiré par les solutions innovantes de stockage mécanique (volants d'inertie, CAES), j'allie une formation rigoureuse en mécanique des fluides et thermodynamique à une capacité éprouvée de simulation dynamique sous MATLAB, Simulink et Python pour l'analyse des rendements et de la réponse transitoire.`;
    }

    // C. Microgrids & Smart Grids
    if (t.includes('microgrid') || t.includes('smart grid') || t.includes('réseau') || t.includes('reseau') || t.includes('ems')) {
      return `Spécialisé dans les réseaux intelligents et les microgrids, j'ai notamment mené des projets de modélisation de flux de puissance et d'algorithmes de gestion d'énergie (EMS) sous MATLAB et Python, en intégrant des sources renouvelables intermittentes et des systèmes de stockage hybrides.`;
    }

    // D. Solar PV & Solar Tracking
    if (t.includes('solaire') || t.includes('solar') || t.includes('pv') || t.includes('photovolta')) {
      return `Ayant dirigé la conception et le prototypage d'un suiveur solaire autonome à deux axes à l'ENIM, je dispose d'une expérience concrète en dimensionnement photovoltaïque (PVsyst, Python), en instrumentation, régulation MPPT et optimisation du rendement sous conditions réelles.`;
    }

    // E. Battery & BESS Storage
    if (t.includes('batter') || t.includes('bess') || t.includes('stockage') || t.includes('storage')) {
      return `Très investi dans les technologies de stockage stationnaire par batterie (BESS) et leur couplage aux sources renouvelables, je maîtrise la modélisation électrothermique, l'estimation des états de charge et de santé (SoC et SoH) et la gestion optimale de la charge pour la stabilisation du réseau.`;
    }

    // F. Thermal & Heat Exchangers
    if (t.includes('thermiq') || t.includes('chaleur') || t.includes('échangeur') || t.includes('echangeur') || t.includes('four')) {
      return `Fort d'expériences industrielles concrètes lors d'optimisations thermiques à la SOTULUB (fours et échangeurs de chaleur) et d'analyses de production à la CTKCP, j'applique avec rigueur les méthodes de calcul de transferts thermiques et de dimensionnement d'échangeurs sous contraintes sévères.`;
    }

    // Default Renewable Energy paragraph
    return `Mon parcours m'a permis d'allier rigueur théorique et réalisations pratiques : conception d'un suiveur solaire autonome à l'ENIM, modélisation dynamique de systèmes énergétiques sous MATLAB et Python, et réalisation d'audits thermiques industriels à la SOTULUB.`;
  }

  /**
   * Generate customized application for a posted internship offer
   */
  async tailorForPostedOffer(offer: CanonicalInternship): Promise<ApplicationDraft> {
    const cleanTitle = this.cleanHumanText(offer.title);
    const cleanCompany = this.cleanHumanText(offer.companyName);
    const combined = `${cleanTitle} ${offer.description || ''} ${cleanCompany}`;
    const cvSelection = this.selectBestCvTrack(combined);
    const domainHighlight = this.buildTechnicalDomainParagraph(combined);

    const subject = `Candidature Stage PFE / Fin d'études — ${cleanTitle} — Seif Eddine Nefzi`;

    const body = `Madame, Monsieur,

Étudiant en 3ème année du cycle ingénieur en Génie Énergétique à l'École Nationale d'Ingénieurs de Monastir (ENIM) et préparant en parallèle un Master de Recherche en Énergétique, je vous présente avec grand enthousiasme ma candidature pour le stage de fin d'études : "${cleanTitle}".

${domainHighlight}

Rejoindre ${cleanCompany} sur cette thématique constitue l'aboutissement naturel de mon projet professionnel. Mes compétences en simulation numérique (Python, MATLAB, Simulink), dimensionnement énergétique et instrumentation me permettront d'être immédiatement opérationnel et de contribuer activement aux objectifs de votre équipe lors de ce stage de 6 mois (début 2027).

Vous trouverez ci-joint mon curriculum vitae (${cvSelection.naturalDescription}). Je reste à votre entière disposition pour convenir d'un entretien.

Veuillez agréer, Madame, Monsieur, l'expression de mes salutations les plus distinguées.

Seif Eddine Nefzi
Élève-Ingénieur en Génie Énergétique & Master Recherche — ENIM
Téléphone : (+216) 20 016 808
Email : nefzi.seifeddine@enim.u-monastir.tn`;

    const draftId = offer.id || `offer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const draft: ApplicationDraft = {
      id: draftId,
      type: 'POSTED_OFFER',
      targetTitle: cleanTitle,
      targetOrganization: cleanCompany,
      targetContact: offer.applyUrl,
      targetCountry: offer.country || 'France',
      selectedCvTrack: cvSelection.track,
      cvFileName: cvSelection.fileName,
      emailSubject: subject,
      coverLetterOrEmailBody: body,
      status: 'PENDING_APPROVAL',
      generatedAt: new Date().toISOString(),
    };

    // Store in-memory registry for instant Telegram callback retrieval
    draftRegistry.set(draft.id, draft);

    // Persist in Supabase applications table
    try {
      await this.supabase.from('applications').upsert({
        id: draft.id,
        type: draft.type,
        target_name: draft.targetTitle,
        organization: draft.targetOrganization,
        contact_info: draft.targetContact,
        country: draft.targetCountry,
        cv_track_used: draft.selectedCvTrack,
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
   * Generate customized cold email for a research supervisor
   */
  async tailorForSupervisor(supervisor: SupervisorRecord): Promise<ApplicationDraft> {
    const cleanPub = this.cleanHumanText(supervisor.recentPublication);
    const cleanTopic = this.cleanHumanText(supervisor.searchTopic);
    const cleanInst = this.cleanHumanText(supervisor.institution);
    const combined = `${cleanPub} ${cleanTopic} ${cleanInst}`;
    const cvSelection = this.selectBestCvTrack(combined);
    const domainHighlight = this.buildTechnicalDomainParagraph(combined);

    const subject = `Candidature Stage Master 2 / PFE — Recherche en Énergétique — Seif Eddine Nefzi`;

    const body = `Bonjour Professeur ${supervisor.name},

Je suis élève-ingénieur en 3ème année de Génie Énergétique à l'École Nationale d'Ingénieurs de Monastir (ENIM), tout en préparant simultanément un Master de Recherche en Énergétique.

J'ai pris connaissance avec un grand intérêt de vos travaux au sein de ${cleanInst}, notamment sur "${cleanPub}". Vos recherches dans le domaine de "${cleanTopic}" correspondent directement à mon projet de spécialisation en recherche et développement.

${domainHighlight}

Dans la perspective de mon Projet de Fin d'Études (PFE / Stage Master 2 de 6 mois, début 2027), je souhaite vivement rejoindre votre groupe de recherche afin de participer à vos projets en cours sur la transition et les systèmes énergétiques.

Je joins à ce message mon curriculum vitae (${cvSelection.naturalDescription}) résumant mon parcours académique et mes compétences techniques.

Seriez-vous disponible pour un court échange afin d'évoquer d'éventuelles opportunités d'accueil au sein de votre laboratoire ?

En vous remerciant sincèrement pour votre temps et votre bienveillance, je vous prie d'agréer, Professeur, l'expression de mes salutations les plus respectueuses.

Seif Eddine Nefzi
Élève-Ingénieur Génie Énergétique & Master Recherche — ENIM
Téléphone : (+216) 20 016 808
Email : nefzi.seifeddine@enim.u-monastir.tn`;

    const draftId = `sup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const draft: ApplicationDraft = {
      id: draftId,
      type: 'COLD_SUPERVISOR',
      targetTitle: `PFE Recherche : ${cleanTopic}`,
      targetOrganization: cleanInst,
      targetContact: supervisor.email,
      targetCountry: supervisor.country,
      selectedCvTrack: cvSelection.track,
      cvFileName: cvSelection.fileName,
      emailSubject: subject,
      coverLetterOrEmailBody: body,
      status: 'PENDING_APPROVAL',
      generatedAt: new Date().toISOString(),
    };

    // Store in-memory registry for instant Telegram callback retrieval
    draftRegistry.set(draft.id, draft);

    // Persist in Supabase applications table
    try {
      await this.supabase.from('applications').upsert({
        id: draft.id,
        type: draft.type,
        target_name: draft.targetTitle,
        organization: draft.targetOrganization,
        contact_info: draft.targetContact,
        country: draft.targetCountry,
        cv_track_used: draft.selectedCvTrack,
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

