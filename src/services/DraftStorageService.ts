import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface ApplicationDraft {
  id: string;
  type: 'POSTED_OFFER' | 'COLD_SUPERVISOR';
  language: 'FR' | 'EN';
  targetTitle: string;
  targetOrganization: string;
  targetSupervisor?: string;
  targetContact: string;
  targetCountry: string;
  sourceResumePath: string; // Absolute or relative path to SeifEddine_Nefzi_Resume_FR.pdf or EN.pdf
  cvAttachmentName: string; // Strictly "cv_Seif_Eddine_Nefzi.pdf"
  coverLetterPdfPath: string; // Absolute path to compiled PDF
  coverLetterPdfName: string; // "Lettre_Motivation_Seif_Eddine_Nefzi.pdf" or "Cover_Letter_Seif_Eddine_Nefzi.pdf"
  coverLetterTexPath?: string;
  emailSubject: string;
  coverLetterOrEmailBody: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  generatedAt: string;
  updatedAt?: string;
}

export class DraftStorageService {
  private draftsDir = path.join(process.cwd(), 'data', 'drafts');
  private mainStoreFile = path.join(process.cwd(), 'data', 'drafts', 'drafts_store.json');
  private inMemoryMap = new Map<string, ApplicationDraft>();

  constructor() {
    this.initStore();
  }

  private initStore(): void {
    try {
      if (!fs.existsSync(this.draftsDir)) {
        fs.mkdirSync(this.draftsDir, { recursive: true });
      }
      if (fs.existsSync(this.mainStoreFile)) {
        const raw = fs.readFileSync(this.mainStoreFile, 'utf8');
        const list: ApplicationDraft[] = JSON.parse(raw);
        for (const item of list) {
          this.inMemoryMap.set(item.id, item);
        }
      } else {
        fs.writeFileSync(this.mainStoreFile, JSON.stringify([], null, 2), 'utf8');
      }
    } catch (err) {
      logger.warn('Could not initialize drafts storage', { error: String(err) });
    }
  }

  saveDraft(draft: ApplicationDraft): void {
    try {
      this.inMemoryMap.set(draft.id, draft);

      // Save individual draft file for crash resilience
      const singlePath = path.join(this.draftsDir, `${draft.id}.json`);
      fs.writeFileSync(singlePath, JSON.stringify(draft, null, 2), 'utf8');

      // Update main store file
      const allDrafts = Array.from(this.inMemoryMap.values());
      fs.writeFileSync(this.mainStoreFile, JSON.stringify(allDrafts, null, 2), 'utf8');

      logger.info(`💾 Draft ${draft.id} permanently saved to disk.`);
    } catch (err) {
      logger.error('Failed saving draft to disk', { id: draft.id, error: String(err) });
    }
  }

  getDraft(id: string): ApplicationDraft | null {
    if (this.inMemoryMap.has(id)) {
      return this.inMemoryMap.get(id)!;
    }

    // Try loading single file directly
    const singlePath = path.join(this.draftsDir, `${id}.json`);
    if (fs.existsSync(singlePath)) {
      try {
        const raw = fs.readFileSync(singlePath, 'utf8');
        const draft: ApplicationDraft = JSON.parse(raw);
        this.inMemoryMap.set(draft.id, draft);
        return draft;
      } catch {}
    }

    return null;
  }

  getAllDrafts(): ApplicationDraft[] {
    return Array.from(this.inMemoryMap.values());
  }

  updateDraftStatus(id: string, status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'APPLIED'): void {
    const draft = this.getDraft(id);
    if (!draft) return;

    draft.status = status;
    draft.updatedAt = new Date().toISOString();
    this.saveDraft(draft);
  }
}

export const draftStorageService = new DraftStorageService();
