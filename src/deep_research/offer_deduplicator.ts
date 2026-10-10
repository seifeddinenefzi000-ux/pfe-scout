import {
  ParsedInternshipOffer,
  OfferSourceRecord,
  OfferResearcherLink,
  ResearcherEmailRecord,
} from './types.js';
import { AuditLoggerService } from './audit_logger.js';

export class OfferDeduplicatorService {
  /**
   * Deduplicate and merge an array of parsed offers without losing evidence
   */
  public static deduplicate(offers: ParsedInternshipOffer[]): ParsedInternshipOffer[] {
    const startTime = Date.now();
    const mergedList: ParsedInternshipOffer[] = [];

    for (const offer of offers) {
      const matchIndex = mergedList.findIndex(existing => this.isDuplicate(existing, offer));

      if (matchIndex === -1) {
        mergedList.push(JSON.parse(JSON.stringify(offer)));
      } else {
        const existing = mergedList[matchIndex];
        mergedList[matchIndex] = this.mergeOffers(existing, offer);

        AuditLoggerService.log({
          taskName: 'offer_deduplicator',
          url: offer.applicationUrl,
          operation: 'mergeOffers',
          status: 'SUCCESS',
          retryCount: 0,
          durationMs: 0,
        });
      }
    }

    AuditLoggerService.log({
      taskName: 'offer_deduplicator',
      operation: 'deduplicate',
      status: 'SUCCESS',
      retryCount: 0,
      durationMs: Date.now() - startTime,
    });

    return mergedList;
  }

  /**
   * Determine if two offers represent the same underlying opportunity
   */
  private static isDuplicate(a: ParsedInternshipOffer, b: ParsedInternshipOffer): boolean {
    // 1. Exact canonical URL match
    if (this.normalizeUrl(a.applicationUrl) === this.normalizeUrl(b.applicationUrl)) {
      return true;
    }

    // 2. Normalized Title + Employer match
    const normTitleA = this.normalizeString(a.title);
    const normTitleB = this.normalizeString(b.title);
    const normEmpA = this.normalizeString(a.employer);
    const normEmpB = this.normalizeString(b.employer);

    if (normEmpA === normEmpB && normTitleA === normTitleB) {
      return true;
    }

    // 3. Jaccard similarity on title words if employer matches
    if (normEmpA === normEmpB && this.titleSimilarity(normTitleA, normTitleB) > 0.8) {
      return true;
    }

    return false;
  }

  /**
   * Merge two offer records, preserving all sources, evidence, and selecting best metadata
   */
  private static mergeOffers(
    primary: ParsedInternshipOffer,
    secondary: ParsedInternshipOffer
  ): ParsedInternshipOffer {
    // Merge sources
    const seenUrls = new Set(primary.sources.map((s: OfferSourceRecord) => s.sourceUrl));
    for (const src of secondary.sources) {
      if (!seenUrls.has(src.sourceUrl)) {
        primary.sources.push(src);
        seenUrls.add(src.sourceUrl);
      }
    }

    // Merge evidence snippets
    primary.evidenceSnippets = Array.from(
      new Set([...primary.evidenceSnippets, ...secondary.evidenceSnippets])
    );

    // Merge skills
    primary.skills = Array.from(new Set([...primary.skills, ...secondary.skills]));

    // Prefer longer / richer description
    if (secondary.description.length > primary.description.length) {
      primary.description = secondary.description;
    }

    // Prefer more detailed deadline
    if (!primary.deadline && secondary.deadline) {
      primary.deadline = secondary.deadline;
    }

    // Prefer more specific compensation
    if (primary.compensationStatus === 'UNKNOWN' && secondary.compensationStatus !== 'UNKNOWN') {
      primary.compensationStatus = secondary.compensationStatus;
      primary.stipendAmount = secondary.stipendAmount;
      primary.stipendCurrency = secondary.stipendCurrency;
    }

    // Prefer direct email if either is true
    if (secondary.isDirectEmail) {
      primary.isDirectEmail = true;
    }

    // Merge supervisors
    for (const secSup of secondary.supervisors) {
      const existingSup = primary.supervisors.find(
        (p: OfferResearcherLink) => p.researcher.cleanName === secSup.researcher.cleanName
      );
      if (!existingSup) {
        primary.supervisors.push(secSup);
      } else {
        // Merge emails
        const seenEmails = new Set(existingSup.researcher.emails.map((e: ResearcherEmailRecord) => e.address));
        for (const em of secSup.researcher.emails) {
          if (!seenEmails.has(em.address)) {
            existingSup.researcher.emails.push(em);
            seenEmails.add(em.address);
          }
        }
      }
    }

    primary.updatedAt = new Date().toISOString();
    return primary;
  }

  private static normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      u.search = '';
      u.hash = '';
      return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
    } catch {
      return url.trim().toLowerCase();
    }
  }

  private static normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static titleSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }
}
