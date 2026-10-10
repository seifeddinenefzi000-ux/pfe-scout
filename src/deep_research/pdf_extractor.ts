import { getDocumentProxy, getMeta, extractText, extractLinks, extractImages } from 'unpdf';
import { AuditLoggerService } from './audit_logger.js';

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
  charCount: number;
  nonWhitespaceCharCount: number;
  links: string[];
  needsOcr: boolean;
}

export interface ExtractedPdfResult {
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    creationDate?: string;
    modificationDate?: string;
  };
  totalPages: number;
  pages: ExtractedPdfPage[];
  fullText: string;
  allLinks: string[];
  needsOcrFallback: boolean;
  pagesNeedingOcr: number[];
}

export class PdfExtractorService {
  private static readonly MIN_NON_WHITESPACE_CHARS = 50;

  /**
   * Extract structured text, page breakdown, links and metadata from a PDF buffer
   */
  public static async extractPdf(
    buffer: Buffer | Uint8Array,
    options?: { minCharsForNoOcr?: number; sourceUrl?: string }
  ): Promise<ExtractedPdfResult> {
    const minChars = options?.minCharsForNoOcr ?? this.MIN_NON_WHITESPACE_CHARS;
    const uint8 = Buffer.isBuffer(buffer)
      ? new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
      : buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer);

    try {
      const pdf = await getDocumentProxy(uint8);
      const totalPages = pdf.numPages || 1;

      // 1. Extract document metadata
      let metadata: ExtractedPdfResult['metadata'] = {};
      try {
        const meta = await getMeta(pdf);
        if (meta?.info) {
          const info = meta.info as Record<string, unknown>;
          metadata = {
            title: typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined,
            author: typeof info.Author === 'string' && info.Author.trim() ? info.Author.trim() : undefined,
            subject: typeof info.Subject === 'string' && info.Subject.trim() ? info.Subject.trim() : undefined,
            creator: typeof info.Creator === 'string' && info.Creator.trim() ? info.Creator.trim() : undefined,
            creationDate: typeof info.CreationDate === 'string' ? info.CreationDate : undefined,
            modificationDate: typeof info.ModDate === 'string' ? info.ModDate : undefined,
          };
        }
      } catch (err) {
        AuditLoggerService.log({
          taskName: 'pdf_extractor',
          url: options?.sourceUrl,
          operation: 'getMeta',
          status: 'WARN',
          error: String(err),
          retryCount: 0,
          durationMs: 0,
        });
      }

      // 2. Extract text page by page
      let pageTexts: string[] = [];
      try {
        const textResult = await extractText(pdf, { mergePages: false });
        if (Array.isArray(textResult.text)) {
          pageTexts = textResult.text;
        } else if (typeof textResult.text === 'string') {
          pageTexts = [textResult.text];
        }
      } catch (err) {
        AuditLoggerService.log({
          taskName: 'pdf_extractor',
          url: options?.sourceUrl,
          operation: 'extractText',
          status: 'WARN',
          error: String(err),
          retryCount: 0,
          durationMs: 0,
        });
      }

      // 3. Extract hyperlinks
      let allLinks: string[] = [];
      try {
        const linkResult = await extractLinks(pdf);
        if (Array.isArray(linkResult?.links)) {
          allLinks = linkResult.links.map(l => (typeof l === 'string' ? l : String(l))).filter(Boolean);
        }
      } catch (err) {
        AuditLoggerService.log({
          taskName: 'pdf_extractor',
          url: options?.sourceUrl,
          operation: 'extractLinks',
          status: 'WARN',
          error: String(err),
          retryCount: 0,
          durationMs: 0,
        });
      }

      // 4. Construct page breakdown and check OCR threshold
      const pages: ExtractedPdfPage[] = [];
      const pagesNeedingOcr: number[] = [];

      for (let i = 0; i < totalPages; i++) {
        const rawPageText = pageTexts[i] || '';
        const normalizedText = this.normalizeText(rawPageText);
        const nonWsCount = normalizedText.replace(/\s+/g, '').length;
        const needsOcr = nonWsCount < minChars;

        if (needsOcr) {
          pagesNeedingOcr.push(i + 1);
        }

        // Links on this page (if linkResult has per-page, or we parse from text)
        const pageLinks = this.findLinksInText(normalizedText);

        pages.push({
          pageNumber: i + 1,
          text: normalizedText,
          charCount: normalizedText.length,
          nonWhitespaceCharCount: nonWsCount,
          links: pageLinks,
          needsOcr,
        });
      }

      const fullText = pages.map(p => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join('\n\n');

      // Deduplicate combined links
      const combinedLinks = Array.from(new Set([...allLinks, ...pages.flatMap(p => p.links)]));

      return {
        metadata,
        totalPages,
        pages,
        fullText,
        allLinks: combinedLinks,
        needsOcrFallback: pagesNeedingOcr.length > 0,
        pagesNeedingOcr,
      };
    } catch (error) {
      AuditLoggerService.log({
        taskName: 'pdf_extractor',
        url: options?.sourceUrl,
        operation: 'extractPdf',
        status: 'ERROR',
        error: String(error),
        retryCount: 0,
        durationMs: 0,
      });
      throw error;
    }
  }

  /**
   * Extract raw embedded images from specific pages for OCR processing
   */
  public static async getPageImages(
    buffer: Buffer | Uint8Array,
    pageNumber: number
  ): Promise<any[]> {
    const uint8 = Buffer.isBuffer(buffer)
      ? new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
      : buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer);
    const pdf = await getDocumentProxy(uint8);
    const images = await extractImages(pdf, pageNumber);
    return images || [];
  }

  private static normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private static findLinksInText(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/gi;
    const matches = text.match(urlRegex) || [];
    return matches.map(u => u.replace(/[.,;:)\]]+$/, ''));
  }
}
