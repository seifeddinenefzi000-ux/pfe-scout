export interface DiscoveredEmailCandidate {
  email: string;
  normalizedEmail: string;
  sourceSnippet: string;
  isObfuscated: boolean;
  contextLine: string;
}

export class EmailFinderService {
  /**
   * Deterministically extract all email addresses from text, HTML, or PDF content,
   * including de-obfuscation. NEVER guesses or hallucinates emails.
   */
  public static extractEmails(text: string): DiscoveredEmailCandidate[] {
    if (!text || typeof text !== 'string') return [];

    const candidates: DiscoveredEmailCandidate[] = [];
    const seenEmails = new Set<string>();

    const lines = text.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. Check for standard emails
      const standardMatches = this.findStandardEmails(line);
      for (const m of standardMatches) {
        const norm = m.toLowerCase();
        if (!seenEmails.has(norm) && this.isValidEmailSyntax(norm)) {
          seenEmails.add(norm);
          candidates.push({
            email: m,
            normalizedEmail: norm,
            sourceSnippet: line.length > 200 ? line.slice(0, 200) + '...' : line,
            isObfuscated: false,
            contextLine: line,
          });
        }
      }

      // 2. Check for obfuscated emails (e.g. name [at] domain [dot] com)
      const obfuscatedMatches = this.findObfuscatedEmails(line);
      for (const ob of obfuscatedMatches) {
        const norm = ob.toLowerCase();
        if (!seenEmails.has(norm) && this.isValidEmailSyntax(norm)) {
          seenEmails.add(norm);
          candidates.push({
            email: ob,
            normalizedEmail: norm,
            sourceSnippet: line.length > 200 ? line.slice(0, 200) + '...' : line,
            isObfuscated: true,
            contextLine: line,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Find standard emails using strict RFC-like pattern
   */
  private static findStandardEmails(text: string): string[] {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const matches = text.match(emailRegex) || [];
    return matches.map(e => e.replace(/[.,;:)\]]+$/, ''));
  }

  /**
   * De-obfuscate emails like "stephane.averty [at] cea [dot] fr"
   */
  private static findObfuscatedEmails(text: string): string[] {
    const results: string[] = [];

    // Pattern 1: [at] / (at) / {at} / [chez] and [dot] / (dot) / [point]
    const obRegex = /([A-Za-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\[chez\]|\sat\s|@)\s*([A-Za-z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\[point\]|\sdot\s|\.)\s*([A-Za-z]{2,})/gi;

    let match: RegExpExecArray | null;
    while ((match = obRegex.exec(text)) !== null) {
      const user = match[1].trim();
      const domain = match[2].trim();
      const tld = match[3].trim();
      if (user && domain && tld && !user.includes(' ') && !domain.includes(' ')) {
        results.push(`${user}@${domain}.${tld}`);
      }
    }

    return results;
  }

  /**
   * Check syntax and exclude common false positives (e.g., sample@example.com, images)
   */
  public static isValidEmailSyntax(email: string): boolean {
    if (!email || email.length > 254) return false;

    // Reject obvious non-emails or image names wrongly matched
    const lower = email.toLowerCase();
    if (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.svg') ||
      lower.endsWith('.webp')
    ) {
      return false;
    }

    if (
      lower.includes('example.com') ||
      lower.includes('domain.com') ||
      lower.includes('votreadresse') ||
      lower.includes('votre.email')
    ) {
      return false;
    }

    const validEmailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return validEmailRegex.test(email);
  }
}
