import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export interface VerificationResult {
  verified: CanonicalInternship[];
  rejected: Array<{
    item: CanonicalInternship;
    reason: string;
  }>;
}

export class VerificationStage {
  public verify(
    items: CanonicalInternship[]
  ): VerificationResult {
    const verified: CanonicalInternship[] = [];

    const rejected: Array<{
      item: CanonicalInternship;
      reason: string;
    }> = [];

    for (const item of items) {
      const validationError =
        this.validateItem(item);

      if (validationError) {
        logger.warn(
          `VerificationStage rejected listing "${item.title}" at "${item.companyName}": ${validationError}`
        );

        rejected.push({
          item,
          reason: validationError,
        });
      } else {
        item.status = 'ENRICHED';
        verified.push(item);
      }
    }

    logger.info(
      `🛡️ VerificationStage complete: Verified ${verified.length} real internships, rejected ${rejected.length} invalid/unverifiable items.`
    );

    return {
      verified,
      rejected,
    };
  }

  private validateItem(
    item: CanonicalInternship
  ): string | null {
    // 1. Check Title & Company Name

    if (
      !item.title ||
      item.title.trim().length < 3
    ) {
      return 'Missing or invalid title';
    }

    if (
      !item.companyName ||
      item.companyName.trim().length < 2 ||
      item.companyName === 'Unknown'
    ) {
      return 'Missing or unverified company name';
    }

    // 2. Validate Application URL

    if (
      !item.applyUrl ||
      typeof item.applyUrl !== 'string'
    ) {
      return 'Missing application URL';
    }

    try {
      const parsedUrl =
        new URL(item.applyUrl);

      if (
        parsedUrl.protocol !== 'http:' &&
        parsedUrl.protocol !== 'https:'
      ) {
        return `Invalid URL protocol: ${parsedUrl.protocol}`;
      }

      if (
        !parsedUrl.hostname ||
        !parsedUrl.hostname.includes('.')
      ) {
        return `Invalid URL hostname: ${parsedUrl.hostname}`;
      }
    } catch {
      return `Malformed application URL: ${item.applyUrl}`;
    }

    // 3. Generic validation passed

    return null;
  }
}