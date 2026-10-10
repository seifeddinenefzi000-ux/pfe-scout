import { extractText } from 'unpdf';
import { logger } from '../utils/logger.js';

export interface ExtractedPdfInternship {
  title: string;
  organization: string;
  location: string;
  supervisorName: string | null;
  supervisorEmail: string | null;
  description: string;
  skills: string[];
  duration: string;
  pdfUrl: string;
  isDirectEmail: boolean;
}

export class PdfInternshipExtractorService {
  /**
   * Determine whether the extracted PDF text represents an internship / PFE offer
   */
  isInternshipPdf(text: string): boolean {
    const t = text.toLowerCase();
    const stageKeywords = [
      'stage',
      'pfe',
      'projet de fin d\'études',
      'master 2',
      'm2',
      'master thesis',
      'internship',
      'sujet de stage',
      'fiche de stage',
      'gratification',
      'élève ingénieur',
      'tfe',
    ];

    let matchCount = 0;
    for (const kw of stageKeywords) {
      if (t.includes(kw)) matchCount++;
    }

    return matchCount >= 2;
  }

  /**
   * Extract title / topic of the PFE internship
   */
  extractTitle(text: string): string {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 1. Regex search for explicit subject / title markers
    const patterns = [
      /(?:sujet\s*(?:du stage|de stage|pfe)?|titre|intitulé)\s*[:\-]\s*(.+)/i,
      /(?:proposition de stage|offre de stage)\s*[:\-]\s*(.+)/i,
      /(?:stage\s*(?:master 2|m2|pfe|ingénieur)?)\s*[:\-]\s*(.+)/i,
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match && match[1] && match[1].trim().length > 10) {
          return this.cleanExtractedString(match[1]);
        }
      }
    }

    // 2. Multiline search if prefix is on its own line
    const multiMatch = text.match(/(?:Sujet|Titre|Intitulé)\s*[:\-]?\s*\n+([A-Za-z0-9À-ÖØ-öø-ÿ\s,':\-]+)/i);
    if (multiMatch && multiMatch[1] && multiMatch[1].trim().length > 10) {
      return this.cleanExtractedString(multiMatch[1]);
    }

    // 3. Prominent title block in the first 15 lines
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      // Skip generic headers
      if (
        lower.includes('fiche de stage') ||
        lower.includes('laboratoire') ||
        lower.includes('université') ||
        lower.includes('offre de stage') ||
        lower.includes('direction') ||
        lower.length < 15 ||
        lower.length > 150
      ) {
        continue;
      }

      // Check if it looks like an energy engineering topic
      if (
        lower.includes('énerg') ||
        lower.includes('solaire') ||
        lower.includes('microgrid') ||
        lower.includes('stockage') ||
        lower.includes('batter') ||
        lower.includes('optimis') ||
        lower.includes('modélis') ||
        lower.includes('chaleur') ||
        lower.includes('photovolt')
      ) {
        return this.cleanExtractedString(line);
      }
    }

    return 'Stage PFE : Modélisation et Optimisation de Systèmes Énergétiques';
  }

  /**
   * Extract supervisor (encadrant/tuteur) and their direct contact email
   */
  extractSupervisor(text: string, defaultOrg?: string): { name: string | null; formattedName?: string | null; email: string | null } {
    // 1. Find all emails in the text
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const allEmails = Array.from(new Set(text.match(emailRegex) || [])).filter((email) => {
      const e = email.toLowerCase();
      return (
        !e.includes('nefzi') &&
        !e.includes('seif') &&
        !e.includes('webmaster') &&
        !e.includes('noreply') &&
        !e.includes('postmaster') &&
        !e.includes('admin')
      );
    });

    let supervisorName: string | null = null;
    let formattedSupervisorName: string | null = null;

    const supervisorPatterns = [
      /(?:encadrant(?:e)?s?|responsable(?:s)?|tuteur(?:ice)?s?|contact(?:s)?|maître de stage|chef de projet)(?:\s*(?:scientifique|de stage|technique|pédagogique|thèse|recherche))?\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,;()<]+)/i,
      /(?:sous la direction de|encadrement par|sous la responsabilité de|dirigé par)\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,;()<]+)/i,
      /(?:adresser|envoyer|transmettre)\s+(?:votre\s+)?(?:candidature|cv|dossier)\s+à\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,;()<]+)/i,
      /(?:pour postuler,?\s*(?:veuillez\s*)?(?:contacter|adresser|envoyer))\s+(?:à\s+)?([^\r\n,;()<]+)/i,
      /(?:supervisor(?:s)?|advisor(?:s)?|adviser|principal investigator|pi|mentor|contact person)(?:\s*(?:lead|scientific))?\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,;()<]+)/i,
      /(?:supervision of|supervised by|under the guidance of)\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,;()<]+)/i,
      /(?:send|submit)\s+(?:your\s+)?(?:application|cv|resume)\s+to\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,;()<]+)/i,
      /(?:please contact)\s+([^\r\n,;()<]+)/i,
    ];

    const invalidKeywords = ['laboratoire', 'équipe', 'mission', 'candidature', 'stage', 'offre', 'cliquez', 'http', 'service', 'direction générale'];

    for (const pattern of supervisorPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const lowerCandidate = candidate.toLowerCase();
        if (invalidKeywords.some((kw) => lowerCandidate.includes(kw))) {
          continue;
        }

        const isDr = candidate.match(/^(Dr\.?|Docteur)\s+/i);
        const isProf = candidate.match(/^(Prof\.?|Professeur)\s+/i);

        let cleanName = candidate
          .replace(/^(Dr\.?|Prof\.?|M\.?|Mme\.?|Mr\.?|Mrs\.?|Ms\.?|Docteur|Professeur)\s+/i, '')
          .trim();

        // Stop at sentence-ending period, newline, or punctuation
        cleanName = cleanName.split(/[\r\n\.,;()<]/)[0].trim();
        cleanName = cleanName.replace(/\s+/g, ' ');

        if (cleanName.length >= 3 && cleanName.length <= 45 && !cleanName.includes('@')) {
          supervisorName = cleanName;
          if (isDr) {
            formattedSupervisorName = `Dr. ${cleanName}`;
          } else if (isProf) {
            formattedSupervisorName = `Prof. ${cleanName}`;
          } else {
            formattedSupervisorName = cleanName;
          }
          break;
        }
      }
    }

    // 2. Select best supervisor email
    let supervisorEmail: string | null = null;

    // A. Check if an email was explicitly placed on the same line or in parentheses near the supervisor keyword
    const inlineEmailRegex = /(?:encadrant|responsable|tuteur|contact|direction|adresser|envoyer|supervisor|advisor|mentor)[^\n\r]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const inlineMatch = text.match(inlineEmailRegex);
    if (inlineMatch && inlineMatch[1]) {
      const e = inlineMatch[1].toLowerCase();
      if (!e.startsWith('recrutement') && !e.startsWith('contact@') && !e.startsWith('stages') && !e.startsWith('rh@')) {
        supervisorEmail = inlineMatch[1];
      }
    }

    // B. Match emails with supervisor's first or last name (accent-tolerant)
    if (!supervisorEmail && supervisorName && allEmails.length > 0) {
      const normName = supervisorName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const parts = normName.split(/\s+/).filter((p) => p.length >= 3);

      const matchedEmail = allEmails.find((email) => {
        const normEmail = email
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return parts.some((part) => normEmail.includes(part));
      });
      if (matchedEmail) supervisorEmail = matchedEmail;
    }

    // C. Non-generic nominative email fallback
    if (!supervisorEmail && allEmails.length > 0) {
      const nonGenericEmails = allEmails.filter((e) => {
        const localPart = e.split('@')[0].toLowerCase();
        return (
          !localPart.startsWith('recrutement') &&
          !localPart.startsWith('stage') &&
          !localPart.startsWith('contact') &&
          !localPart.startsWith('rh') &&
          !localPart.startsWith('info') &&
          !localPart.startsWith('carrieres') &&
          !localPart.startsWith('service') &&
          !localPart.startsWith('direction')
        );
      });

      if (nonGenericEmails.length > 0) {
        const academicEmail = nonGenericEmails.find((e) => {
          const lower = e.toLowerCase();
          return (
            lower.includes('.fr') ||
            lower.includes('.ch') ||
            lower.includes('.ac.uk') ||
            lower.includes('.edu') ||
            lower.includes('cea.fr') ||
            lower.includes('cnrs.fr') ||
            lower.includes('univ') ||
            lower.includes('mines') ||
            lower.includes('epfl')
          );
        });
        if (academicEmail) supervisorEmail = academicEmail;
      }
    }

    // D. Inferred direct email from supervisor name and organization domain if only generic email was given
    if (!supervisorEmail && supervisorName) {
      const normName = supervisorName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const parts = normName.split(/\s+/).filter((p) => p.length >= 2);
      if (parts.length >= 2) {
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];

        // Infer domain from text or defaultOrg
        let domain: string | null = null;
        const textLower = `${text} ${defaultOrg || ''}`.toLowerCase();
        if (textLower.includes('cea') || textLower.includes('liten') || textLower.includes('ines')) {
          domain = 'cea.fr';
        } else if (textLower.includes('promes')) {
          domain = 'promes.cnrs.fr';
        } else if (textLower.includes('cnrs')) {
          domain = 'cnrs.fr';
        } else if (textLower.includes('epfl')) {
          domain = 'epfl.ch';
        } else if (textLower.includes('g2elab') || textLower.includes('grenoble-inp')) {
          domain = 'g2elab.grenoble-inp.fr';
        } else if (textLower.includes('laplace')) {
          domain = 'laplace.univ-tlse.fr';
        }

        if (domain) {
          supervisorEmail = `${firstName}.${lastName}@${domain}`;
        }
      }
    }

    return {
      name: supervisorName,
      formattedName: formattedSupervisorName || supervisorName,
      email: supervisorEmail,
    };
  }

  /**
   * Extract organization / laboratory hosting the internship
   */
  extractOrganization(text: string, defaultOrg?: string): string {
    const t = text.toLowerCase();

    if (t.includes('ines') || t.includes('institut national de l’énergie solaire')) {
      return 'INES - CEA LITEN';
    }
    if (t.includes('promes') || t.includes('procédés, matériaux et énergie solaire')) {
      return 'CNRS PROMES';
    }
    if (t.includes('laplace') || t.includes('plasma et conversion d’énergie')) {
      return 'LAPLACE - Université de Toulouse';
    }
    if (t.includes('cea liten') || (t.includes('cea') && t.includes('liten'))) {
      return 'CEA LITEN';
    }
    if (t.includes('epfl') && (t.includes('pv-lab') || t.includes('photovoltaic'))) {
      return 'EPFL PV-Lab';
    }
    if (t.includes('ifpen') || t.includes('ifp energies nouvelles')) {
      return 'IFP Energies nouvelles';
    }
    if (t.includes('mines paris') || t.includes('mines paristech')) {
      return 'Mines Paris PSL - Centre PERSEE';
    }
    if (t.includes('centrale lyon') || t.includes('centralelyon')) {
      return 'École Centrale de Lyon';
    }
    if (t.includes('cnrs')) {
      return 'CNRS';
    }

    return defaultOrg || 'Laboratoire de Recherche Énergétique';
  }

  /**
   * Extract location / city of the laboratory
   */
  extractLocation(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('bourget-du-lac') || t.includes('bourget du lac') || t.includes('chambéry')) {
      return 'Le Bourget-du-Lac (Savoie), France';
    }
    if (t.includes('font-romeu') || t.includes('odeillo') || t.includes('perpignan')) {
      return 'Font-Romeu / Odeillo / Perpignan, France';
    }
    if (t.includes('toulouse')) return 'Toulouse, France';
    if (t.includes('grenoble')) return 'Grenoble, France';
    if (t.includes('palaiseau') || t.includes('saclay')) return 'Paris-Saclay / Palaiseau, France';
    if (t.includes('paris')) return 'Paris, France';
    if (t.includes('lyon')) return 'Lyon, France';
    if (t.includes('neuchâtel') || t.includes('lausanne')) return 'Suisse';

    return 'France';
  }

  /**
   * Extract duration and desired dates
   */
  extractDuration(text: string): string {
    const durationMatch = text.match(/(\d+\s*(?:à\s*\d+\s*)?mois)/i);
    if (durationMatch) return durationMatch[1];
    return '4 à 6 mois';
  }

  /**
   * Extract matched technical keywords
   */
  extractSkills(text: string): string[] {
    const t = text.toLowerCase();
    const skills: string[] = [];

    if (t.includes('microgrid') || t.includes('microréseau') || t.includes('ems')) {
      skills.push('Microgrids & EMS');
    }
    if (t.includes('optimis') || t.includes('programmation dynamique') || t.includes('algorithme génétique') || t.includes('pso')) {
      skills.push('Optimisation énergétique (DP, GA, PSO, LP)');
    }
    if (t.includes('photovolt') || t.includes('solaire') || t.includes('pv') || t.includes('suiveur')) {
      skills.push('Systèmes Solaires Photovoltaïques & Suiveurs');
    }
    if (t.includes('batter') || t.includes('stockage') || t.includes('bess')) {
      skills.push('Stockage par batteries (BESS)');
    }
    if (t.includes('python')) skills.push('Python (FastAPI, NumPy, SciPy)');
    if (t.includes('matlab') || t.includes('simulink')) skills.push('MATLAB');
    if (t.includes('chaleur fatale') || t.includes('thermique') || t.includes('récupération')) {
      skills.push('Efficacité énergétique & Récupération de chaleur fatale');
    }

    return skills;
  }

  private cleanExtractedString(str: string): string {
    return str
      .replace(/\s+/g, ' ')
      .replace(/[;,\.]+$/, '')
      .trim();
  }

  /**
   * Parse a raw PDF byte array into a structured PFE Internship opportunity
   */
  async extractFromBuffer(
    pdfData: Uint8Array,
    pdfUrl: string,
    defaultOrg?: string
  ): Promise<ExtractedPdfInternship | null> {
    try {
      const extracted = await extractText(pdfData);
      const rawText = extracted.text;
      const text: string = Array.isArray(rawText) ? rawText.join('\n') : String(rawText || '');

      if (text.length < 50) {
        logger.warn(`PdfInternshipExtractor: Extracted text too short (${text.length} chars) for ${pdfUrl}`);
        return null;
      }

      if (!this.isInternshipPdf(text)) {
        logger.info(`PdfInternshipExtractor: Document at ${pdfUrl} does not appear to be an internship offer`);
        return null;
      }

      const title = this.extractTitle(text);
      const { name: supervisorName, email: supervisorEmail } = this.extractSupervisor(text);
      const organization = this.extractOrganization(text, defaultOrg);
      const location = this.extractLocation(text);
      const duration = this.extractDuration(text);
      const skills = this.extractSkills(text);

      const description = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 20)
        .slice(0, 15)
        .join('\n');

      const isDirectEmail = Boolean(supervisorEmail && supervisorEmail.includes('@'));

      const result: ExtractedPdfInternship = {
        title,
        organization,
        location,
        supervisorName,
        supervisorEmail,
        description,
        skills,
        duration,
        pdfUrl,
        isDirectEmail,
      };

      logger.info(`✅ Successfully extracted PFE Internship PDF from ${pdfUrl}:`, {
        title,
        organization,
        supervisor: supervisorName,
        email: supervisorEmail,
      });

      return result;
    } catch (err) {
      logger.error(`PdfInternshipExtractor: Failed parsing PDF at ${pdfUrl}`, { error: String(err) });
      return null;
    }
  }
}

export const pdfInternshipExtractorService = new PdfInternshipExtractorService();
