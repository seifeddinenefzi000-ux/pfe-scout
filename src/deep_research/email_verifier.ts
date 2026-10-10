import { EmailVerificationStatus } from './types.js';
import { EmailFinderService } from './email_finder.js';

export class EmailVerifierService {
  private static readonly GENERIC_PREFIXES = [
    'recrutement',
    'recruitment',
    'contact',
    'rh',
    'hr',
    'stages',
    'stage',
    'jobs',
    'job',
    'candidature',
    'candidatures',
    'info',
    'infos',
    'administration',
    'admin',
    'accueil',
    'communication',
    'direction',
    'support',
    'carrieres',
    'careers',
    'press',
    'secretariat',
  ];

  /**
   * Classify an email address according to the strict E1-E7 evidence hierarchy
   */
  public static classifyEmail(
    email: string,
    context: {
      supervisorName?: string;
      isOfficialDocument: boolean;
      contextSnippet?: string;
      appearanceCount?: number;
      isPublicationOnly?: boolean;
    }
  ): {
    status: EmailVerificationStatus;
    isGeneric: boolean;
    evidenceNotes: string;
  } {
    if (!email || !EmailFinderService.isValidEmailSyntax(email)) {
      return {
        status: 'E6_INVALID_OR_CONTRADICTED',
        isGeneric: false,
        evidenceNotes: 'Syntax is invalid or malformed.',
      };
    }

    const localPart = email.split('@')[0].toLowerCase();
    const isGeneric = this.GENERIC_PREFIXES.some(prefix => {
      return localPart === prefix || localPart.startsWith(prefix + '.') || localPart.startsWith(prefix + '_') || localPart.startsWith(prefix + '-');
    });

    if (isGeneric) {
      return {
        status: 'E5_GENERIC_CONTACT',
        isGeneric: true,
        evidenceNotes: `Detected departmental / generic mailbox prefix: "${localPart}". Cannot be used as direct individual supervisor contact.`,
      };
    }

    // Check if directly linked to named supervisor in official document
    if (context.supervisorName && context.contextSnippet) {
      const supClean = context.supervisorName.toLowerCase().replace(/[^a-z]/g, '');
      const snippetClean = context.contextSnippet.toLowerCase().replace(/[^a-z]/g, '');
      
      // Check if parts of supervisor's name appear in the local part or snippet
      const nameParts = context.supervisorName.toLowerCase().split(/\s+/).filter(p => p.length > 2);
      const nameInEmail = nameParts.some(part => localPart.includes(part));
      const nameInSnippet = snippetClean.includes(supClean) || nameParts.every(p => context.contextSnippet?.toLowerCase().includes(p));

      if (context.isOfficialDocument && (nameInEmail || nameInSnippet)) {
        return {
          status: 'E1_OFFICIAL_DIRECT',
          isGeneric: false,
          evidenceNotes: `Direct individual address explicitly linked to supervisor "${context.supervisorName}" in official source document.`,
        };
      }
    }

    // Check if corroborated across multiple sources
    if (context.appearanceCount && context.appearanceCount >= 2 && context.isOfficialDocument) {
      return {
        status: 'E2_OFFICIAL_CORROBORATED',
        isGeneric: false,
        evidenceNotes: `Address corroborated across ${context.appearanceCount} institutional documents.`,
      };
    }

    // Check publication listed
    if (context.isPublicationOnly) {
      return {
        status: 'E3_PUBLICATION_LISTED',
        isGeneric: false,
        evidenceNotes: 'Extracted from research publication. Current employment / validity uncorroborated.',
      };
    }

    // Default candidate unverified
    return {
      status: 'E4_UNVERIFIED_CANDIDATE',
      isGeneric: false,
      evidenceNotes: 'Personal or institutional email detected, but lacking explicit corroboration with supervisor role.',
    };
  }

  /**
   * Helper to check if an email can be used for direct cold outreach to supervisor
   */
  public static isAcceptableSupervisorEmail(status: EmailVerificationStatus): boolean {
    return status === 'E1_OFFICIAL_DIRECT' || status === 'E2_OFFICIAL_CORROBORATED';
  }
}
