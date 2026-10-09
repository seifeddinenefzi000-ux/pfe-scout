import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { SupervisorRecord, applicationTailoringService, ApplicationDraft } from './ApplicationTailoringService.js';
import { frenchResearcherExtractor } from './FrenchResearcherExtractorService.js';

export class SupervisorScoutService {
  private verifiedJsonPath = path.join(process.cwd(), 'data', 'verified_french_researchers.json');

  /**
   * Load and return confirmed French energy researchers
   */
  loadSupervisors(): SupervisorRecord[] {
    // 1. Try to load from verified French researcher database
    if (fs.existsSync(this.verifiedJsonPath)) {
      try {
        const raw = fs.readFileSync(this.verifiedJsonPath, 'utf8');
        const list: SupervisorRecord[] = JSON.parse(raw);
        if (list.length > 0) {
          logger.info(`SupervisorScoutService: Loaded ${list.length} verified French researchers from JSON.`);
          return list;
        }
      } catch (err) {
        logger.warn('Failed reading verified JSON database', { error: String(err) });
      }
    }

    return [];
  }

  /**
   * Get top N daily supervisor outreach batch (20 daily target)
   */
  async getDailySupervisorBatch(limit: number = 20): Promise<ApplicationDraft[]> {
    let list = this.loadSupervisors();

    // If no verified French records cached, trigger live extraction from HAL
    if (list.length === 0) {
      logger.info('No verified French researchers found in cache. Extracting from French HAL directory...');
      list = await frenchResearcherExtractor.fetchHalResearchers(50);
    }

    const batch = list.slice(0, limit);
    logger.info(`SupervisorScoutService: Selected ${batch.length} verified French researchers for cold outreach.`);

    const drafts: ApplicationDraft[] = [];
    for (const sup of batch) {
      const draft = await applicationTailoringService.tailorForSupervisor(sup);
      drafts.push(draft);
    }

    return drafts;
  }
}

export const supervisorScoutService = new SupervisorScoutService();
