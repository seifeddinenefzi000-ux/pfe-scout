import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { logger } from '../utils/logger.js';
import { SupervisorRecord, applicationTailoringService, ApplicationDraft } from './ApplicationTailoringService.js';

export class SupervisorScoutService {
  private filePath = path.join(process.cwd(), 'data', 'PFE_Supervisors.xlsx');

  /**
   * Load and filter supervisors from Excel/Database
   */
  loadSupervisors(): SupervisorRecord[] {
    if (!fs.existsSync(this.filePath)) {
      logger.warn(`Supervisors excel file not found at ${this.filePath}`);
      return [];
    }

    try {
      const workbook = XLSX.readFile(this.filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      const excludedCountries = ['TN', 'DE', 'TUNISIA', 'GERMANY', 'TUNISIE', 'ALLEMAGNE'];

      const supervisors: SupervisorRecord[] = [];

      for (const row of rows) {
        const name = String(row.Name || '').trim();
        const email = String(row.Predicted_Email || row.Email || '').trim();
        const inst = String(row.Institution || '').trim();
        const country = String(row.Country || 'Unknown').trim().toUpperCase();
        const pub = String(row.Recent_Publication || '').trim();
        const topic = String(row.Search_Topic || '').trim();

        if (!name || name.length < 3) continue;

        // Strict Exclusion: Tunisia & Germany
        if (excludedCountries.includes(country)) {
          continue;
        }

        // Calculate relevance score for Energy Engineering
        let score = 50;
        const combined = `${pub} ${topic} ${inst}`.toLowerCase();

        // France priority
        if (country === 'FR' || combined.includes('france') || inst.toLowerCase().includes('cnrs') || inst.toLowerCase().includes('cea') || inst.toLowerCase().includes('inria') || inst.toLowerCase().includes('grenoble') || inst.toLowerCase().includes('paris') || inst.toLowerCase().includes('toulouse')) {
          score += 35;
        } else if (country === 'CA' || combined.includes('canada')) {
          score += 25;
        } else if (['US', 'GB', 'UK', 'CH', 'BE', 'NL', 'SE', 'NO', 'DK', 'ES', 'IT'].includes(country)) {
          score += 15;
        }

        // Energy topics bonus
        const energyKeywords = [
          'solar',
          'photovoltaic',
          'hydrogen',
          'fuel cell',
          'thermal',
          'heat transfer',
          'storage',
          'battery',
          'microgrid',
          'renewable energy',
          'energy transition',
        ];

        energyKeywords.forEach((k) => {
          if (combined.includes(k)) score += 5;
        });

        supervisors.push({
          name,
          email,
          institution: inst,
          country: country === 'FR' ? 'France' : country,
          recentPublication: pub,
          searchTopic: topic,
          relevanceScore: Math.min(100, score),
        });
      }

      // Sort by relevance score descending
      return supervisors.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } catch (err) {
      logger.error('Failed reading PFE_Supervisors.xlsx', { error: String(err) });
      return [];
    }
  }

  /**
   * Get top N daily supervisor outreach batch
   */
  async getDailySupervisorBatch(limit: number = 20): Promise<ApplicationDraft[]> {
    const list = this.loadSupervisors();
    const batch = list.slice(0, limit);

    logger.info(`SupervisorScoutService: Selected top ${batch.length} supervisors for daily cold outreach.`);

    const drafts: ApplicationDraft[] = [];
    for (const sup of batch) {
      const draft = await applicationTailoringService.tailorForSupervisor(sup);
      drafts.push(draft);
    }

    return drafts;
  }
}

export const supervisorScoutService = new SupervisorScoutService();
