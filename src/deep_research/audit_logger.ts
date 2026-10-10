import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PipelineAuditLog } from './types.js';
import { logger } from '../utils/logger.js';

export class AuditLoggerService {
  private logDir = path.join(process.cwd(), 'data', 'audit');
  private memoryLogs: PipelineAuditLog[] = [];
  private maxMemoryLogs = 2000;

  constructor() {
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (err) {
        logger.warn('Could not create audit log directory', { error: String(err) });
      }
    }
  }

  record(entry: Omit<PipelineAuditLog, 'id' | 'createdAt'>): PipelineAuditLog {
    const fullLog: PipelineAuditLog = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry,
    };

    // Store in-memory
    this.memoryLogs.push(fullLog);
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift();
    }

    // Persist to disk
    try {
      const today = new Date().toISOString().slice(0, 10);
      const filePath = path.join(this.logDir, `audit_${today}.jsonl`);
      fs.appendFileSync(filePath, JSON.stringify(fullLog) + '\n', 'utf8');
    } catch (err) {
      logger.warn('Failed to append to audit log file', { error: String(err) });
    }

    if (entry.status === 'ERROR') {
      logger.error(`[AUDIT] ${entry.taskName} - ${entry.operation} FAILED`, {
        url: entry.url,
        error: entry.error,
        durationMs: entry.durationMs,
      });
    } else {
      logger.info(`[AUDIT] ${entry.taskName} - ${entry.operation} [${entry.status}] (${entry.durationMs}ms)`);
    }

    return fullLog;
  }

  getRecentLogs(limit = 100): PipelineAuditLog[] {
    return this.memoryLogs.slice(-limit);
  }

  getRunLogs(runId: string): PipelineAuditLog[] {
    return this.memoryLogs.filter((l) => l.runId === runId);
  }

  static log(entry: Omit<PipelineAuditLog, 'id' | 'createdAt'>): PipelineAuditLog {
    return auditLogger.record(entry);
  }

  static record(entry: Omit<PipelineAuditLog, 'id' | 'createdAt'>): PipelineAuditLog {
    return auditLogger.record(entry);
  }

  static getBuffer(limit = 100): PipelineAuditLog[] {
    return auditLogger.getRecentLogs(limit);
  }
}

export const auditLogger = new AuditLoggerService();
