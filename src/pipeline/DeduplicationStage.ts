import { CanonicalInternship } from '../models/DomainModels.js';
import { InternshipRepository } from '../repositories/InternshipRepository.js';
import { ObservabilityRepository } from '../repositories/ObservabilityRepository.js';
import { archiveService } from '../services/ArchiveService.js';
import { logger } from '../utils/logger.js';

export class DeduplicationStage {
  constructor(
    private internshipRepo = new InternshipRepository(),
    private observabilityRepo = new ObservabilityRepository()
  ) {}

  async process(items: CanonicalInternship[]): Promise<{ unique: CanonicalInternship[]; duplicatesCount: number }> {
    const unique: CanonicalInternship[] = [];
    const seenHashes = new Set<string>();
    const seenUrls = new Set<string>();
    let duplicatesCount = 0;

    for (const item of items) {
      // 1. Check in-memory batch duplicates
      if (seenHashes.has(item.contentHash) || seenUrls.has(item.canonicalUrl)) {
        duplicatesCount++;
        continue;
      }

      // 2. Check permanent closed archive folder (never repeat previous offers)
      const isArchived = await archiveService.isOfferArchived(item);
      if (isArchived) {
        logger.info(`DeduplicationStage: Skipped previously archived/processed offer "${item.title}"`);
        duplicatesCount++;
        continue;
      }

      seenHashes.add(item.contentHash);
      seenUrls.add(item.canonicalUrl);
      unique.push(item);
    }

    if (duplicatesCount > 0) {
      logger.info(`DeduplicationStage filtered ${duplicatesCount} duplicate/archived internships out of ${items.length}`);
      await this.observabilityRepo.incrementMetric('deduplication_duplicate_rate', duplicatesCount);
    }

    return { unique, duplicatesCount };
  }
}
