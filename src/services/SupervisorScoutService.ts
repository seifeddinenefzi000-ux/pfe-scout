import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { SupervisorRecord, applicationTailoringService, ApplicationDraft } from './ApplicationTailoringService.js';
import { frenchResearcherExtractor } from './FrenchResearcherExtractorService.js';
import { archiveService } from './ArchiveService.js';

export class SupervisorScoutService {
  private verifiedJsonPath = path.join(process.cwd(), 'data', 'verified_french_researchers.json');

  /**
   * Load confirmed French energy researchers with verified emails
   */
  loadSupervisors(): SupervisorRecord[] {
    if (fs.existsSync(this.verifiedJsonPath)) {
      try {
        const raw = fs.readFileSync(this.verifiedJsonPath, 'utf8');
        const list: SupervisorRecord[] = JSON.parse(raw);
        if (list.length > 0) return list;
      } catch {}
    }

    const verified = frenchResearcherExtractor.getVerifiedFrenchSupervisors();
    frenchResearcherExtractor.saveVerifiedDirectory();
    return verified;
  }

  /**
   * Get top N daily supervisor outreach batch (20 daily target), skipping all previously archived supervisors
   */
  async getDailySupervisorBatch(limit: number = 20): Promise<ApplicationDraft[]> {
    const fullList = this.loadSupervisors();

    // Filter out all previously contacted or notified supervisors from the closed archive folder
    const uncontacted = fullList.filter((sup) => !archiveService.isSupervisorArchived(sup));

    logger.info(
      `SupervisorScoutService: Found ${uncontacted.length} fresh uncontacted supervisors (out of ${fullList.length} total).`
    );

    const batch = uncontacted.slice(0, limit);
    if (batch.length === 0) {
      logger.info('SupervisorScoutService: All supervisors in the current catalog have been contacted and archived.');
      return [];
    }

    logger.info(`SupervisorScoutService: Selected ${batch.length} new verified French researchers for cold outreach.`);

    const drafts: ApplicationDraft[] = [];
    for (const sup of batch) {
      const draft = await applicationTailoringService.tailorForSupervisor(sup);
      drafts.push(draft);
    }

    // Permanently archive this batch so they are never contacted again
    archiveService.archiveSupervisors(batch);

    return drafts;
  }
}

export const supervisorScoutService = new SupervisorScoutService();
