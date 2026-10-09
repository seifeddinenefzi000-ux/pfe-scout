import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { SupervisorRecord, ApplicationDraft } from './ApplicationTailoringService.js';
import { getSupabaseClient } from '../database/client.js';

export interface ArchivedOfferRecord {
  id: string;
  title: string;
  company: string;
  url: string;
  contentHash: string;
  archivedAt: string;
}

export interface ArchivedSupervisorRecord {
  name: string;
  email: string;
  institution: string;
  searchTopic: string;
  archivedAt: string;
}

export class ArchiveService {
  private archiveDir = path.join(process.cwd(), 'data', 'archive');
  private offersArchivePath = path.join(process.cwd(), 'data', 'archive', 'archived_offers.json');
  private supervisorsArchivePath = path.join(process.cwd(), 'data', 'archive', 'archived_supervisors.json');
  private supabase = getSupabaseClient();

  constructor() {
    this.ensureArchiveDir();
  }

  private ensureArchiveDir(): void {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }
      if (!fs.existsSync(this.offersArchivePath)) {
        fs.writeFileSync(this.offersArchivePath, JSON.stringify([], null, 2));
      }
      if (!fs.existsSync(this.supervisorsArchivePath)) {
        fs.writeFileSync(this.supervisorsArchivePath, JSON.stringify([], null, 2));
      }
    } catch (err) {
      logger.warn('Could not initialize archive directory', { error: String(err) });
    }
  }

  /**
   * Load all permanently archived offers
   */
  loadArchivedOffers(): ArchivedOfferRecord[] {
    try {
      if (fs.existsSync(this.offersArchivePath)) {
        const raw = fs.readFileSync(this.offersArchivePath, 'utf8');
        return JSON.parse(raw) || [];
      }
    } catch {}
    return [];
  }

  /**
   * Check if an offer has already been seen / archived
   */
  isOfferArchived(item: CanonicalInternship): boolean {
    const archived = this.loadArchivedOffers();
    const itemUrl = (item.applyUrl || item.canonicalUrl || '').toLowerCase().trim();
    const itemHash = item.contentHash;
    const normTitleCompany = `${item.title} ${item.companyName}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    return archived.some((a) => {
      const aUrl = (a.url || '').toLowerCase().trim();
      const aHash = a.contentHash;
      const aNorm = `${a.title} ${a.company}`.toLowerCase().replace(/[^a-z0-9]/g, '');

      return (
        (itemUrl && aUrl && itemUrl === aUrl) ||
        (itemHash && aHash && itemHash === aHash) ||
        (normTitleCompany && aNorm && normTitleCompany === aNorm)
      );
    });
  }

  /**
   * Permanently archive processed offers so they never appear again
   */
  archiveOffers(items: CanonicalInternship[]): void {
    if (items.length === 0) return;
    this.ensureArchiveDir();

    const current = this.loadArchivedOffers();
    const existingKeys = new Set(current.map((c) => (c.url || c.contentHash).toLowerCase()));

    for (const item of items) {
      const key = (item.applyUrl || item.canonicalUrl || item.contentHash).toLowerCase();
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        current.push({
          id: item.id || `off_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: item.title,
          company: item.companyName,
          url: item.applyUrl || item.canonicalUrl,
          contentHash: item.contentHash,
          archivedAt: new Date().toISOString(),
        });
      }
    }

    try {
      fs.writeFileSync(this.offersArchivePath, JSON.stringify(current, null, 2));
      logger.info(`ArchiveService: Closed and permanently archived ${items.length} offers (Total archived: ${current.length})`);
    } catch (e) {
      logger.error('Failed writing to archived_offers.json', { error: String(e) });
    }
  }

  /**
   * Load all permanently archived supervisors
   */
  loadArchivedSupervisors(): ArchivedSupervisorRecord[] {
    try {
      if (fs.existsSync(this.supervisorsArchivePath)) {
        const raw = fs.readFileSync(this.supervisorsArchivePath, 'utf8');
        return JSON.parse(raw) || [];
      }
    } catch {}
    return [];
  }

  /**
   * Check if a supervisor has already been contacted or notified
   */
  isSupervisorArchived(sup: SupervisorRecord): boolean {
    const archived = this.loadArchivedSupervisors();
    const supEmail = (sup.email || '').toLowerCase().trim();
    const supName = (sup.name || '').toLowerCase().trim();

    return archived.some((a) => {
      const aEmail = (a.email || '').toLowerCase().trim();
      const aName = (a.name || '').toLowerCase().trim();
      return (supEmail && aEmail && supEmail === aEmail) || (supName && aName && supName === aName);
    });
  }

  /**
   * Permanently archive contacted/notified supervisors so they are never repeated
   */
  archiveSupervisors(supervisors: SupervisorRecord[]): void {
    if (supervisors.length === 0) return;
    this.ensureArchiveDir();

    const current = this.loadArchivedSupervisors();
    const existingEmails = new Set(current.map((c) => (c.email || c.name).toLowerCase()));

    for (const sup of supervisors) {
      const key = (sup.email || sup.name).toLowerCase();
      if (!existingEmails.has(key)) {
        existingEmails.add(key);
        current.push({
          name: sup.name,
          email: sup.email,
          institution: sup.institution,
          searchTopic: sup.searchTopic,
          archivedAt: new Date().toISOString(),
        });
      }
    }

    try {
      fs.writeFileSync(this.supervisorsArchivePath, JSON.stringify(current, null, 2));
      logger.info(`ArchiveService: Closed and permanently archived ${supervisors.length} supervisors (Total archived: ${current.length})`);
    } catch (e) {
      logger.error('Failed writing to archived_supervisors.json', { error: String(e) });
    }
  }
}

export const archiveService = new ArchiveService();
