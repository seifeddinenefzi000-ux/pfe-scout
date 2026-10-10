import {
  OfferResearcherLink,
  ResearcherEmailRecord,
  ResearcherRecord,
  SupervisorConfidenceStatus,
} from './types.js';
import { DiscoveredEmailCandidate, EmailFinderService } from './email_finder.js';
import { EmailVerifierService } from './email_verifier.js';
import { AuditLoggerService } from './audit_logger.js';

export class SupervisorResolverService {
  private static readonly SUPERVISOR_PATTERNS = [
    /(?:encadrant(?:e)?s?|encadrement)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:tuteur\s*(?:de stage)?)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:responsable\s*(?:scientifique|du stage|de stage)?)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:contact\s*(?:scientifique|stage)?)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:directeur\s*(?:de recherche|de thèse)?)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:maître\s*de\s*stage)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:supervisor|advisor|academic advisor)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:principal\s*investigator|pi)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:contact\s*person)\s*:\s*([^\n\r;]{3,90})/i,
    /(?:candidature\s*(?:à adresser|à envoyer)\s*à)\s*:\s*([^\n\r;]{3,90})/i,
  ];

  /**
   * Deterministically resolve potential supervisors from offer text and evidence sources
   */
  public static resolveSupervisors(
    text: string,
    sourceUrl: string,
    isOfficialDocument: boolean,
    candidateEmails: DiscoveredEmailCandidate[] = []
  ): OfferResearcherLink[] {
    const startTime = Date.now();
    const links: OfferResearcherLink[] = [];

    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      for (const pattern of this.SUPERVISOR_PATTERNS) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const rawCandidate = match[1].trim();
          const cleanName = this.cleanSupervisorName(rawCandidate);

          if (this.isValidPersonName(cleanName)) {
            // Context lines (current line + next 2 lines)
            const contextSnippet = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join(' ');

            // Find associated email in snippet or among candidates
            const associatedEmails = this.findAssociatedEmails(
              cleanName,
              contextSnippet,
              candidateEmails,
              sourceUrl,
              isOfficialDocument
            );

            const researcherRecord: ResearcherRecord = {
              id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              fullName: cleanName,
              cleanName: cleanName.toLowerCase().replace(/[^a-z0-9]/g, ''),
              emails: associatedEmails,
              identityEvidence: [line],
            };

            links.push({
              researcher: researcherRecord,
              relationshipRole: 'SUPERVISOR',
              confidenceStatus: 'SUPERVISOR_EXPLICIT',
              supportingEvidence: [line],
            });
            break;
          }
        }
      }
    }

    AuditLoggerService.log({
      taskName: 'supervisor_resolver',
      url: sourceUrl,
      operation: 'resolveSupervisors',
      status: 'SUCCESS',
      retryCount: 0,
      durationMs: Date.now() - startTime,
    });

    return links;
  }

  /**
   * Clean titles like "Dr.", "Prof.", "M.", "Mme" and trailing punctuation/emails
   */
  private static cleanSupervisorName(raw: string): string {
    let name = raw;

    // Strip inline email if present in the supervisor line
    const emailMatch = name.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (emailMatch) {
      name = name.replace(emailMatch[0], '');
    }

    // Strip common titles
    name = name.replace(/\b(dr|docteur|prof|professeur|m\.|mme|monsieur|madame|ing|ingénieur)\b\.?/gi, '');

    // Strip phone numbers or parens
    name = name.replace(/\([^)]*\)/g, '');
    name = name.replace(/tél\s*:\s*[\d\s+.-]+/gi, '');

    // Strip common delimiters
    name = name.replace(/[-–—/\\|:;,]+$/, '').trim();

    return name.trim();
  }

  /**
   * Validate that the extracted string looks like a human name, not a department or instruction
   */
  private static isValidPersonName(name: string): boolean {
    if (!name || name.length < 3 || name.length > 50) return false;

    const lower = name.toLowerCase();
    // Exclude departmental / instructional false positives
    const blacklist = [
      'rh', 'ressources humaines', 'direction', 'laboratoire', 'service',
      'recrutement', 'candidature', 'cv', 'lettre de motivation',
      'site internet', 'portail', 'formulaire', 'université', 'école',
      'equipe', 'équipe', 'département', 'plateforme',
    ];

    if (blacklist.some(b => lower.includes(b))) {
      return false;
    }

    // Must contain letters and usually 1-4 words
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) return false;

    return /^[A-Za-zÀ-ÿ\s'-]+$/.test(name);
  }

  /**
   * Associate extracted emails with this specific supervisor
   */
  private static findAssociatedEmails(
    supervisorName: string,
    contextSnippet: string,
    candidateEmails: DiscoveredEmailCandidate[],
    sourceUrl: string,
    isOfficialDocument: boolean
  ): ResearcherEmailRecord[] {
    const records: ResearcherEmailRecord[] = [];
    const nameParts = supervisorName.toLowerCase().split(/\s+/).filter(p => p.length > 2);

    // Also look directly in the context snippet
    const snippetEmails = EmailFinderService.extractEmails(contextSnippet);
    const allCandidates = [...snippetEmails, ...candidateEmails];
    const seen = new Set<string>();

    for (const cand of allCandidates) {
      if (seen.has(cand.normalizedEmail)) continue;

      const classification = EmailVerifierService.classifyEmail(cand.email, {
        supervisorName,
        isOfficialDocument,
        contextSnippet,
      });

      // Check if candidate matches supervisor name or is directly in the snippet
      const local = cand.normalizedEmail.split('@')[0];
      const matchesName = nameParts.some(p => local.includes(p));
      const inSnippet = contextSnippet.toLowerCase().includes(cand.normalizedEmail);

      if (matchesName || inSnippet) {
        seen.add(cand.normalizedEmail);
        records.push({
          address: cand.email,
          status: classification.status,
          sourceUrl,
          evidenceSnippet: cand.sourceSnippet,
          lastChecked: new Date().toISOString(),
          verificationNotes: classification.evidenceNotes,
        });
      }
    }

    return records;
  }
}
