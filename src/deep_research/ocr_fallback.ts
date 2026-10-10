import { createWorker } from 'tesseract.js';
import { PdfExtractorService } from './pdf_extractor.js';
import { AuditLoggerService } from './audit_logger.js';

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  wordCount: number;
}

export class OcrFallbackService {
  /**
   * Run OCR on a single image buffer
   */
  public static async recognizeImage(
    imageBuffer: Buffer | Uint8Array,
    languages: string[] = ['fra', 'eng']
  ): Promise<{ text: string; confidence: number }> {
    const startTime = Date.now();
    let worker: any = null;
    try {
      worker = await createWorker(languages);
      const ret = await worker.recognize(Buffer.from(imageBuffer));
      const text = (ret.data?.text || '').trim();
      const confidence = ret.data?.confidence || 0;
      await worker.terminate();

      AuditLoggerService.log({
        taskName: 'ocr_fallback',
        operation: 'recognizeImage',
        status: 'SUCCESS',
        retryCount: 0,
        durationMs: Date.now() - startTime,
      });

      return { text, confidence };
    } catch (err) {
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {
          // ignore
        }
      }
      AuditLoggerService.log({
        taskName: 'ocr_fallback',
        operation: 'recognizeImage',
        status: 'ERROR',
        error: String(err),
        retryCount: 0,
        durationMs: Date.now() - startTime,
      });
      return { text: '', confidence: 0 };
    }
  }

  /**
   * Perform OCR fallback on scanned PDF pages that yielded insufficient native text (<50 chars)
   */
  public static async ocrPdfPages(
    pdfBuffer: Buffer | Uint8Array,
    pagesNeedingOcr: number[],
    sourceUrl?: string
  ): Promise<OcrPageResult[]> {
    const results: OcrPageResult[] = [];
    if (!pagesNeedingOcr || pagesNeedingOcr.length === 0) {
      return results;
    }

    let worker: any = null;
    try {
      worker = await createWorker(['fra', 'eng']);

      for (const pageNumber of pagesNeedingOcr) {
        const startTime = Date.now();
        try {
          const images = await PdfExtractorService.getPageImages(pdfBuffer, pageNumber);
          if (images.length === 0) {
            results.push({
              pageNumber,
              text: '',
              confidence: 0,
              wordCount: 0,
            });
            continue;
          }

          let combinedPageText = '';
          let totalConfidence = 0;
          let countedImages = 0;

          for (const img of images) {
            const ret = await worker.recognize(Buffer.from(img));
            if (ret?.data?.text) {
              combinedPageText += '\n' + ret.data.text.trim();
              totalConfidence += ret.data.confidence || 0;
              countedImages++;
            }
          }

          const avgConfidence =
            countedImages > 0 ? Math.round(totalConfidence / countedImages) : 0;
          const cleanedText = combinedPageText.trim();

          results.push({
            pageNumber,
            text: cleanedText,
            confidence: avgConfidence,
            wordCount: cleanedText ? cleanedText.split(/\s+/).length : 0,
          });

          AuditLoggerService.log({
            taskName: 'ocr_fallback',
            url: sourceUrl,
            operation: `ocrPage_${pageNumber}`,
            status: 'SUCCESS',
            retryCount: 0,
            durationMs: Date.now() - startTime,
          });
        } catch (pageErr) {
          AuditLoggerService.log({
            taskName: 'ocr_fallback',
            url: sourceUrl,
            operation: `ocrPage_${pageNumber}`,
            status: 'WARN',
            error: String(pageErr),
            retryCount: 0,
            durationMs: Date.now() - startTime,
          });
          results.push({
            pageNumber,
            text: '',
            confidence: 0,
            wordCount: 0,
          });
        }
      }
    } catch (err) {
      AuditLoggerService.log({
        taskName: 'ocr_fallback',
        url: sourceUrl,
        operation: 'createWorker',
        status: 'ERROR',
        error: String(err),
        retryCount: 0,
        durationMs: 0,
      });
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {
          // ignore
        }
      }
    }

    return results;
  }
}
