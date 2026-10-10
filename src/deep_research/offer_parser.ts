import {
  CompensationStatus,
  EligibilityStatus,
  ParsedInternshipOffer,
  TechnicalEnergyDomain,
} from './types.js';
import { AuditLoggerService } from './audit_logger.js';

export interface RawDocumentInput {
  url: string;
  text: string;
  titleHint?: string;
  metaDescription?: string;
  isPdf?: boolean;
  pageCount?: number;
}

export class OfferParserService {
  /**
   * Deterministically parse structured internship information from raw text
   */
  public static parseOffer(input: RawDocumentInput): ParsedInternshipOffer {
    const startTime = Date.now();
    const { url, text } = input;
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 1. Title Extraction
    const title = this.extractTitle(input, cleanText);

    // 2. Employer & Laboratory Extraction
    const { employer, laboratory } = this.extractEmployerAndLab(input, cleanText);

    // 3. Location & Country Extraction
    const { country, city } = this.extractLocation(cleanText, url);

    // 4. Duration Extraction (Target: 4-6 months)
    const durationMonths = this.extractDurationMonths(cleanText);

    // 5. Start Date Extraction (Target: Jan-Feb 2027)
    const startDate = this.extractStartDate(cleanText);

    // 6. Application Deadline
    const deadline = this.extractDeadline(cleanText);

    // 7. Compensation / Stipend
    const { compensationStatus, stipendAmount, stipendCurrency } = this.extractCompensation(cleanText, country);

    // 8. Technical Domain & Skills Extraction
    const { technicalDomain, skills } = this.classifyDomainAndSkills(cleanText, title);

    // 9. Application Mode & Direct Email check
    const isDirectEmail = this.checkIfDirectEmailApplication(cleanText);

    // 10. Evidence Snippets
    const evidenceSnippets = this.collectEvidenceSnippets(cleanText, {
      title,
      employer,
      startDate,
      durationMonths,
      compensationStatus,
    });

    const parsedOffer: ParsedInternshipOffer = {
      id: `offer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      title,
      employer,
      laboratory,
      country,
      city,
      description: cleanText.length > 3000 ? cleanText.slice(0, 3000) + '...' : cleanText,
      deadline,
      durationMonths,
      startDate,
      compensationStatus,
      stipendAmount,
      stipendCurrency,
      eligibility: 'PENDING_REVIEW', // Will be finalized by eligibility_ranker
      applicationUrl: url,
      finalStatus: 'DISCOVERED',
      score: 0, // Will be computed by eligibility_ranker
      technicalDomain,
      skills,
      isDirectEmail,
      sources: [
        {
          sourceUrl: url,
          evidenceSnippets: evidenceSnippets.slice(0, 5),
          sourceType: input.isPdf ? 'PDF_DOCUMENT' : 'OFFICIAL_PAGE',
          discoveredAt: new Date().toISOString(),
        },
      ],
      supervisors: [],
      evidenceSnippets,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    AuditLoggerService.log({
      taskName: 'offer_parser',
      url,
      operation: 'parseOffer',
      status: 'SUCCESS',
      retryCount: 0,
      durationMs: Date.now() - startTime,
    });

    return parsedOffer;
  }

  private static extractTitle(input: RawDocumentInput, text: string): string {
    if (input.titleHint && input.titleHint.length > 5 && input.titleHint.length < 150) {
      // Filter out generic titles like "Offre de stage", "Internship offer"
      const lower = input.titleHint.toLowerCase();
      if (!lower.startsWith('untitled') && !lower.startsWith('document') && !lower.startsWith('page')) {
        return input.titleHint.trim();
      }
    }

    // Look for heading patterns in text
    const titleRegexes = [
      /(?:sujet\s*:\s*|intitulé\s*:\s*|titre\s*:\s*|subject\s*:\s*|title\s*:\s*)([^\n]{10,140})/i,
      /(?:stage\s*(?:m2|pfe|ingénieur|recherche)?\s*:\s*)([^\n]{10,140})/i,
      /(?:internship\s*position\s*:\s*)([^\n]{10,140})/i,
    ];

    for (const regex of titleRegexes) {
      const match = text.match(regex);
      if (match && match[1]) {
        return match[1].trim().replace(/^[:\-\s]+/, '');
      }
    }

    // Fallback: first non-empty lines that look like a title
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15 && l.length < 120);
    if (lines.length > 0) {
      return lines[0];
    }

    return 'Stage Ingénieur Énergies / PFE Research Internship';
  }

  private static extractEmployerAndLab(
    input: RawDocumentInput,
    text: string
  ): { employer: string; laboratory?: string } {
    let employer = 'Établissement / Organisme de recherche';
    let laboratory: string | undefined;

    // Detect known research institutes and companies
    const knownEntities = [
      { name: 'INES - CEA LITEN', lab: 'CEA LITEN', regex: /cea|ines\s*-\s*cea|liten/i },
      { name: 'CNRS', lab: 'CNRS', regex: /\bcnrs\b/i },
      { name: 'IFP Energies nouvelles (IFPEN)', lab: 'IFPEN', regex: /\bifpen\b|ifp\s*energies/i },
      { name: 'EDF R&D', lab: 'EDF Lab', regex: /\bedf\s*r&d\b|\bedf\s*lab\b|\bedf\b/i },
      { name: 'TotalEnergies', lab: 'TotalEnergies R&D', regex: /totalenergies/i },
      { name: 'Schneider Electric', lab: 'Schneider Electric R&D', regex: /schneider\s*electric/i },
      { name: 'Engie Lab CRIGEN', lab: 'CRIGEN', regex: /crigen|\bengie\b/i },
      { name: 'IMT Atlantique', lab: 'DSEE / GEPEA', regex: /imt\s*atlantique/i },
      { name: 'INSA Lyon', lab: 'CETHIL', regex: /insa\s*lyon|cethil/i },
      { name: 'CentraleSupélec', lab: 'GeePs / EM2C', regex: /centralesupélec|centralesupelec/i },
      { name: 'EPFL', lab: 'EPFL Energy Center', regex: /\bepfl\b/i },
      { name: 'PSI (Paul Scherrer Institut)', lab: 'PSI Energy & Environment', regex: /paul\s*scherrer|\bpsi\b/i },
      { name: 'EMPA', lab: 'Urban Energy Systems', regex: /\bempa\b/i },
      { name: 'TNO', lab: 'TNO Energy Transition', regex: /\btno\b/i },
      { name: 'TU Delft', lab: 'Delft Energy Institute', regex: /tu\s*delft/i },
      { name: 'KU Leuven', lab: 'EnergyVille', regex: /energyville|ku\s*leuven/i },
      { name: 'VITO', lab: 'EnergyVille', regex: /\bvito\b/i },
    ];

    for (const ent of knownEntities) {
      if (ent.regex.test(text) || ent.regex.test(input.url)) {
        employer = ent.name;
        laboratory = ent.lab;
        break;
      }
    }

    // Check specific Lab pattern: "Laboratoire d'accueil : XYZ"
    const labMatch = text.match(/(?:laboratoire\s*(?:d'accueil)?\s*:\s*|lab(?:oratory)?\s*:\s*)([^\n,;]{3,80})/i);
    if (labMatch && labMatch[1]) {
      laboratory = labMatch[1].trim();
      if (employer === 'Établissement / Organisme de recherche') {
        employer = laboratory;
      }
    }

    return { employer, laboratory };
  }

  private static extractLocation(text: string, url: string): { country: string; city?: string } {
    const lower = (text + ' ' + url).toLowerCase();

    // Check cities first
    const frenchCities = [
      'paris', 'grenoble', 'chambery', 'chambéry', 'lyon', 'saclay', 'palaiseau',
      'cadarache', 'marcoule', 'toulouse', 'bordeaux', 'nantes', 'lille', 'strasbourg',
      'rennes', 'montpellier', 'aix-en-provence', 'le bourget-du-lac',
    ];
    for (const city of frenchCities) {
      if (lower.includes(city)) {
        return { country: 'France', city: city.charAt(0).toUpperCase() + city.slice(1) };
      }
    }

    if (lower.includes('france') || url.includes('.fr')) {
      return { country: 'France' };
    }
    if (lower.includes('belgique') || lower.includes('belgium') || url.includes('.be') || lower.includes('brussels') || lower.includes('leuven')) {
      return { country: 'Belgium' };
    }
    if (lower.includes('suisse') || lower.includes('switzerland') || url.includes('.ch') || lower.includes('lausanne') || lower.includes('zurich')) {
      return { country: 'Switzerland' };
    }
    if (lower.includes('pays-bas') || lower.includes('netherlands') || url.includes('.nl') || lower.includes('delft') || lower.includes('amsterdam')) {
      return { country: 'Netherlands' };
    }
    if (lower.includes('irlande') || lower.includes('ireland') || url.includes('.ie') || lower.includes('dublin')) {
      return { country: 'Ireland' };
    }
    if (lower.includes('united kingdom') || lower.includes('royaume-uni') || url.includes('.uk') || lower.includes('london')) {
      return { country: 'United Kingdom' };
    }
    if (lower.includes('canada') || url.includes('.ca') || lower.includes('montreal') || lower.includes('montréal') || lower.includes('quebec')) {
      return { country: 'Canada' };
    }
    if (lower.includes('united states') || lower.includes('usa') || lower.includes('california') || lower.includes('boston')) {
      return { country: 'United States' };
    }
    if (lower.includes('australia') || lower.includes('australie') || url.includes('.au') || lower.includes('sydney') || lower.includes('melbourne')) {
      return { country: 'Australia' };
    }
    if (lower.includes('germany') || lower.includes('allemagne') || url.includes('.de')) {
      return { country: 'Germany' };
    }

    // Default to France if ambiguous academic French offer
    if (lower.includes('stage') && lower.includes('gratification')) {
      return { country: 'France' };
    }

    return { country: 'France' };
  }

  private static extractDurationMonths(text: string): number {
    const patterns = [
      /(?:durée\s*:\s*|duration\s*:\s*)(\d+)\s*(?:mois|months)/i,
      /(\d+)\s*(?:à|to|-)\s*(\d+)\s*(?:mois|months)/i,
      /(?:stage\s*(?:de)?\s*)(\d+)\s*(?:mois|months)/i,
      /(\d+)\s*mois/i,
      /(\d+)\s*months/i,
      /24\s*semaines/i,
    ];

    if (/24\s*semaines/i.test(text)) return 6;

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match) {
        if (match[2]) {
          return parseInt(match[2], 10); // e.g. 4 à 6 mois -> 6 mois
        }
        const val = parseInt(match[1], 10);
        if (val >= 3 && val <= 12) return val;
      }
    }

    return 6; // Standard PFE engineering duration default
  }

  private static extractStartDate(text: string): string {
    const patterns = [
      /(?:début\s*:\s*|start\s*(?:date)?\s*:\s*|à partir de\s*:?\s*)([^\n,;]{5,40})/i,
      /(?:janvier|février|mars|avril)\s*2027/i,
      /(?:january|february|march|april)\s*2027/i,
      /(?:début|early|spring)\s*2027/i,
      /(?:janvier|février|mars)\s*2026/i, // historical or upcoming semester
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match) {
        return match[1] ? match[1].trim() : match[0].trim();
      }
    }

    return 'Janvier - Février 2027 (flexible)';
  }

  private static extractDeadline(text: string): string | null {
    const patterns = [
      /(?:date limite\s*:\s*|deadline\s*:\s*|candidature avant\s*(?:le)?\s*:?\s*)([^\n,;]{5,40})/i,
      /(?:avant le|before)\s*(\d{1,2}\s+[a-zéû]+\s+202\d)/i,
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  private static extractCompensation(
    text: string,
    country: string
  ): { compensationStatus: CompensationStatus; stipendAmount?: number; stipendCurrency?: string } {
    const lower = text.toLowerCase();

    // Check explicit amounts like "600 €/mois", "1200 euros/mois", "650€"
    const amountMatch = text.match(/(\d{3,4})\s*(?:€|euros?|\$|chf|£)\s*(?:\/\s*mois|\s*par\s*mois|\s*per\s*month)?/i);
    if (amountMatch && amountMatch[1]) {
      const amount = parseInt(amountMatch[1], 10);
      let currency = 'EUR';
      if (text.includes('CHF')) currency = 'CHF';
      if (text.includes('$')) currency = 'USD';
      if (text.includes('£')) currency = 'GBP';

      return {
        compensationStatus: 'PAID',
        stipendAmount: amount,
        stipendCurrency: currency,
      };
    }

    // Gratification légale mention
    if (lower.includes('gratification légale') || lower.includes('gratification de stage') || lower.includes('rémunération selon barème')) {
      return {
        compensationStatus: 'LEGAL_GRATIFICATION',
        stipendAmount: 650,
        stipendCurrency: 'EUR',
      };
    }

    // If France and duration >= 3 months, it is legally mandatory in France to be compensated (> 2 months)
    if (country === 'France' && (lower.includes('stage') || lower.includes('pfe') || lower.includes('indemnité'))) {
      return {
        compensationStatus: 'LEGAL_GRATIFICATION',
        stipendAmount: 650,
        stipendCurrency: 'EUR',
      };
    }

    if (lower.includes('non rémunéré') || lower.includes('unpaid')) {
      return { compensationStatus: 'UNPAID' };
    }

    return { compensationStatus: 'UNKNOWN' };
  }

  private static classifyDomainAndSkills(
    text: string,
    title: string
  ): { technicalDomain: TechnicalEnergyDomain; skills: string[] } {
    const combined = (title + ' ' + text).toLowerCase();
    const skillsFound = new Set<string>();

    const checkSkills = (skillList: string[]) => {
      for (const sk of skillList) {
        if (combined.includes(sk.toLowerCase())) {
          skillsFound.add(sk);
        }
      }
    };

    checkSkills([
      'Python', 'MATLAB', 'Simulink', 'FastAPI', 'TRNSYS', 'EnergyPlus', 'OpenFOAM',
      'ANSYS Fluent', 'CFD', 'PVsyst', 'BESS', 'BMS', 'Photovoltaïque', 'Batteries',
      'Hydrogène', 'Pile à combustible', 'Microgrid', 'Optimisation', 'Machine Learning',
      'Modélisation thermique', 'Stockage thermique',
    ]);

    // Classification hierarchy
    if (
      combined.includes('bess') ||
      combined.includes('batterie') ||
      combined.includes('battery') ||
      combined.includes('stockage électrochimique')
    ) {
      return { technicalDomain: 'BATTERIES_BESS', skills: Array.from(skillsFound) };
    }

    if (
      combined.includes('photovolta') ||
      combined.includes('solaire') ||
      combined.includes('solar') ||
      combined.includes('pv')
    ) {
      return { technicalDomain: 'SOLAR_PHOTOVOLTAIC', skills: Array.from(skillsFound) };
    }

    if (
      combined.includes('thermiq') ||
      combined.includes('cfd') ||
      combined.includes('chaleur') ||
      combined.includes('heat transfer') ||
      combined.includes('thermodynami')
    ) {
      return { technicalDomain: 'THERMAL_STORAGE_CFD', skills: Array.from(skillsFound) };
    }

    if (
      combined.includes('hydrog') ||
      combined.includes('pile à combustible') ||
      combined.includes('fuel cell') ||
      combined.includes('power-to-x') ||
      combined.includes('électroly')
    ) {
      return { technicalDomain: 'HYDROGEN_FUEL_CELLS', skills: Array.from(skillsFound) };
    }

    if (
      combined.includes('microgrid') ||
      combined.includes('ems') ||
      combined.includes('optimisation') ||
      combined.includes('smart grid') ||
      combined.includes('gestion d\'énergie')
    ) {
      return { technicalDomain: 'ENERGY_SYSTEMS_OPTIMIZATION', skills: Array.from(skillsFound) };
    }

    if (
      combined.includes('éolien') ||
      combined.includes('wind') ||
      combined.includes('offshore') ||
      combined.includes('hydroélectrique')
    ) {
      return { technicalDomain: 'WIND_OFFSHORE_HYDRO', skills: Array.from(skillsFound) };
    }

    if (
      combined.includes('décarbonation') ||
      combined.includes('efficacité énergétique') ||
      combined.includes('audit énergétique')
    ) {
      return { technicalDomain: 'INDUSTRIAL_DECARBONIZATION_SMART_GRIDS', skills: Array.from(skillsFound) };
    }

    return { technicalDomain: 'GENERAL_ENERGY_ENGINEERING', skills: Array.from(skillsFound) };
  }

  private static checkIfDirectEmailApplication(text: string): boolean {
    const lower = text.toLowerCase();
    const mailInstructions = [
      'envoyer votre cv',
      'adresser votre candidature',
      'candidature par email',
      'candidature par mail',
      'transmettre votre cv',
      'send your cv',
      'send your application to',
      'contactez le responsable',
      'écrire à :',
      'contact :',
    ];

    for (const instr of mailInstructions) {
      if (lower.includes(instr)) {
        return true;
      }
    }

    return false;
  }

  private static collectEvidenceSnippets(
    text: string,
    extracted: {
      title: string;
      employer: string;
      startDate: string;
      durationMonths: number;
      compensationStatus: CompensationStatus;
    }
  ): string[] {
    const snippets: string[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.includes(extracted.title) && snippets.length < 5) {
        snippets.push(`[Titre]: ${line}`);
      } else if (line.includes(extracted.startDate) && snippets.length < 5) {
        snippets.push(`[Date]: ${line}`);
      } else if ((line.includes('gratification') || line.includes('rémunération') || line.includes('stipend')) && snippets.length < 5) {
        snippets.push(`[Indemnité]: ${line}`);
      }
    }

    return snippets;
  }
}
