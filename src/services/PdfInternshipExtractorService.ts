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
  extractSupervisor(text: string): { name: string | null; email: string | null } {
    // 1. Find all emails in the PDF
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
    const supervisorPatterns = [
      /(?:encadrant(?:e)?s?|responsable(?:s)?|tuteur(?:ice)?s?|contact(?:s)?)(?:\s*(?:scientifique|de stage|technique|pédagogique|thèse))?\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,]+)/i,
      /(?:sous la direction de|encadrement par)\s*[:\-]?\s*(?:\r?\n\s*)?([^\r\n,]+)/i,
    ];

    for (const pattern of supervisorPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Remove honorifics
        const cleanName = candidate
          .replace(/^(Dr\.?|Prof\.?|M\.?|Mme\.?)\s+/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanName.length >= 3 && cleanName.length <= 40 && !cleanName.toLowerCase().includes('laboratoire')) {
          supervisorName = cleanName;
          break;
        }
      }
    }

    // 2. Select best supervisor email
    let supervisorEmail: string | null = null;

    if (supervisorName && allEmails.length > 0) {
      const parts = supervisorName
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length > 2);
      // Prefer an email matching supervisor's name
      const matchedEmail = allEmails.find((email) => {
        const e = email.toLowerCase();
        return parts.some((part) => e.includes(part));
      });
      if (matchedEmail) supervisorEmail = matchedEmail;
    }

    if (!supervisorEmail && allEmails.length > 0) {
      // Prioritize academic / research institute domain emails
      const academicEmail = allEmails.find((e) => {
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
      supervisorEmail = academicEmail || allEmails[0];
    }

    return { name: supervisorName, email: supervisorEmail };
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
