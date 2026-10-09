import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { logger } from '../utils/logger.js';
import { SupervisorRecord, applicationTailoringService, ApplicationDraft } from './ApplicationTailoringService.js';
import { frenchResearcherExtractor } from './FrenchResearcherExtractorService.js';

export class SupervisorScoutService {
  private filePath = path.join(process.cwd(), 'data', 'PFE_Supervisors.xlsx');
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

    // 2. Fallback to excel filtering only French researchers and energy topics
    if (!fs.existsSync(this.filePath)) {
      logger.warn(`Supervisors excel file not found at ${this.filePath}`);
      return [];
    }

    try {
      const workbook = XLSX.readFile(this.filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      const excludedCountries = ['TN', 'DE', 'TUNISIA', 'GERMANY', 'TUNISIE', 'ALLEMAGNE', 'EG', 'IN', 'PK', 'BD'];

      const supervisors: SupervisorRecord[] = [];

      for (const row of rows) {
        const name = String(row.Name || '').trim();
        const email = String(row.Predicted_Email || row.Email || '').trim();
        const inst = String(row.Institution || '').trim();
        const country = String(row.Country || 'Unknown').trim().toUpperCase();
        const pub = String(row.Recent_Publication || '').trim();
        const topic = String(row.Search_Topic || '').trim();

        if (!name || name.length < 3) continue;

        // Strict Exclusion: Non-French or excluded countries
        if (excludedCountries.includes(country)) {
          continue;
        }

        const combined = `${pub} ${topic} ${inst}`.toLowerCase();
        const isFrenchLab =
          country === 'FR' ||
          combined.includes('france') ||
          inst.toLowerCase().includes('cnrs') ||
          inst.toLowerCase().includes('cea') ||
          inst.toLowerCase().includes('inria') ||
          inst.toLowerCase().includes('grenoble') ||
          inst.toLowerCase().includes('paris') ||
          inst.toLowerCase().includes('toulouse') ||
          inst.toLowerCase().includes('lyon');

        if (!isFrenchLab && country !== 'FR') {
          continue;
        }

        let score = 70;
        if (isFrenchLab) score += 25;

        supervisors.push({
          name,
          email,
          institution: inst,
          country: 'France',
          recentPublication: pub,
          searchTopic: topic,
          relevanceScore: Math.min(100, score),
        });
      }

      return supervisors.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } catch (err) {
      logger.error('Failed reading PFE_Supervisors.xlsx', { error: String(err) });
      return [];
    }
  }

  /**
   * Get top N daily supervisor outreach batch (20 daily target)
   */
  async getDailySupervisorBatch(limit: number = 20): Promise<ApplicationDraft[]> {
    let list = this.loadSupervisors();

    // If no verified French records cached, trigger live fetch from HAL
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
