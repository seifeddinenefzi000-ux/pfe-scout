import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { SupervisorRecord, applicationTailoringService, ApplicationDraft } from './ApplicationTailoringService.js';
import { frenchResearcherExtractor } from './FrenchResearcherExtractorService.js';
import { archiveService } from './ArchiveService.js';

export class SupervisorScoutService {
  private verifiedJsonPath = path.join(process.cwd(), 'data', 'verified_french_researchers.json');

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
   * Get balanced daily batch: 1 US, 1 Canada, 1 UK, 1 Australia, 1 Switzerland + France
   */
  async getDailySupervisorBatch(limit: number = 20): Promise<ApplicationDraft[]> {
    const fullList = this.loadSupervisors();

    // Filter out already contacted or notified supervisors
    const uncontacted: SupervisorRecord[] = [];
    for (const sup of fullList) {
      const isArchived = await archiveService.isSupervisorArchived(sup);
      if (!isArchived) {
        uncontacted.push(sup);
      }
    }

    logger.info(`SupervisorScoutService: Found ${uncontacted.length} fresh uncontacted supervisors.`);

    if (uncontacted.length === 0) {
      logger.info('SupervisorScoutService: All supervisors in the current catalog have been contacted and archived.');
      return [];
    }

    // Build balanced international selection
    const targetCountries = ['USA', 'Canada', 'UK', 'Australia', 'Switzerland'];
    const selected: SupervisorRecord[] = [];

    for (const country of targetCountries) {
      const match = uncontacted.find((s) => s.country.toLowerCase() === country.toLowerCase() && !selected.includes(s));
      if (match) selected.push(match);
    }

    // Fill the remainder with France and other top researchers
    for (const s of uncontacted) {
      if (selected.length >= limit) break;
      if (!selected.includes(s)) {
        selected.push(s);
      }
    }

    logger.info(`SupervisorScoutService: Selected ${selected.length} supervisors (Includes 1 US, 1 Canada, 1 UK, 1 Australia, 1 Switzerland + France).`);

    const drafts: ApplicationDraft[] = [];
    for (const sup of selected) {
      const draft = await applicationTailoringService.tailorForSupervisor(sup);
      drafts.push(draft);
    }

    // Archive selected supervisors so they never repeat
    await archiveService.archiveSupervisors(selected);

    return drafts;
  }
}

export const supervisorScoutService = new SupervisorScoutService();
