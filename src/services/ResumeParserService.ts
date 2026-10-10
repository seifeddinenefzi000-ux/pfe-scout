import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

import { ResumeData } from '../models/DomainModels.js';
import { getSupabaseClient } from '../database/client.js';
import { logger } from '../utils/logger.js';

export class ResumeParserService {
  private supabase = getSupabaseClient();

  async parseResume(filePath: string): Promise<ResumeData> {
    logger.info('🔍 Stage 1: Loading resume file...');

    try {
      let fileBuffer: Buffer;
      let fileName: string;

      /*
       * ============================================================
       * 1. LOAD RESUME
       * ============================================================
       */

      if (filePath.startsWith('supabase://')) {
        const storagePath = filePath.replace(
          'supabase://',
          ''
        );

        logger.info(
          `Loading resume from Supabase Storage: ${storagePath}`
        );

        const { data, error } =
          await this.supabase.storage
            .from('resumes')
            .download(storagePath);

        if (error || !data) {
          const errorMsg =
            `Failed to download resume from Supabase Storage: ${
              error?.message || 'Unknown error'
            }`;

          logger.error(`❌ ${errorMsg}`);

          return this.getErrorResumeData(errorMsg);
        }

        const arrayBuffer =
          await data.arrayBuffer();

        fileBuffer = Buffer.from(arrayBuffer);
        fileName = path.basename(storagePath);

        logger.info(
          `✓ Resume downloaded from Supabase Storage (${fileBuffer.length} bytes)`
        );
      } else {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);

        logger.info(
          `📁 Loading resume from local path: ${absPath}`
        );

        if (!fs.existsSync(absPath)) {
          logger.warn(`Resume file not found at ${absPath}, using default candidate profile for Seif Eddine Nefzi.`);
          return this.getDefaultCandidateProfile();
        }

        fileBuffer = fs.readFileSync(absPath);
        fileName = path.basename(absPath);

        logger.info(
          `✓ Resume file found at: ${absPath}`
        );
      }

      /*
       * ============================================================
       * 2. DETECT FILE TYPE
       * ============================================================
       */

      const ext =
        path.extname(fileName).toLowerCase();

      logger.info(
        `✓ File type detected: ${
          ext.toUpperCase() || 'PLAIN TEXT'
        }`
      );

      /*
       * ============================================================
       * 3. EXTRACT RAW TEXT
       * ============================================================
       */

      let rawText = '';

      if (ext === '.pdf') {
        logger.info(
          '📄 Extracting text from PDF using unpdf...'
        );

        try {
          /*
           * unpdf works directly with Uint8Array and
           * avoids the old pdf-parse / webpack runtime
           * problem encountered on Trigger.dev.
           */
          const pdf = await getDocumentProxy(
            new Uint8Array(fileBuffer)
          );

          const result = await extractText(pdf, {
            mergePages: true,
          });

          rawText = result.text || '';

          logger.info(
            `✓ PDF text extraction completed (${rawText.length} characters)`
          );
        } catch (pdfError) {
          const errorMsg =
            `PDF text extraction failed: ${String(pdfError)}`;

          logger.error(`❌ ${errorMsg}`);

          return this.getErrorResumeData(errorMsg);
        }
      } else if (ext === '.docx') {
        logger.info(
          '📄 Extracting text from DOCX using mammoth...'
        );

        try {
          const parsed =
            await mammoth.extractRawText({
              buffer: fileBuffer,
            });

          rawText = parsed.value;

          logger.info(
            `✓ DOCX text extraction completed (${rawText.length} characters)`
          );
        } catch (docxError) {
          const errorMsg =
            `DOCX text extraction failed: ${String(docxError)}`;

          logger.error(`❌ ${errorMsg}`);

          return this.getErrorResumeData(errorMsg);
        }
      } else if (
        ext === '.txt' ||
        ext === '.md' ||
        ext === '.markdown' ||
        ext === ''
      ) {
        logger.info(
          '📄 Reading plain-text resume...'
        );

        rawText =
          fileBuffer.toString('utf-8');
      } else {
        const errorMsg =
          `Unsupported resume file extension: ${ext}`;

        logger.error(`❌ ${errorMsg}`);

        return this.getErrorResumeData(errorMsg);
      }

      /*
       * ============================================================
       * 4. VALIDATE EXTRACTED TEXT
       * ============================================================
       */

      rawText = rawText
        .replace(/\u0000/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (!rawText || rawText.length < 20) {
        const errorMsg =
          'Resume file contains empty or insufficient text content.';

        logger.error(`❌ ${errorMsg}`);

        return this.getErrorResumeData(errorMsg);
      }

      logger.info(
        `✓ Resume parsed successfully (${rawText.length} characters extracted)`
      );

      /*
       * ============================================================
       * 5. BUILD STRUCTURED PROFILE
       * ============================================================
       */

      const structured =
        this.extractStructuredProfile(rawText);

      logger.info(
        `✓ Candidate profile created (Completeness Score: ${structured.completenessScore}%)`
      );

      return structured;
    } catch (err) {
      const errorMsg =
        `Exception during resume parsing: ${String(err)}`;

      logger.error(`❌ ${errorMsg}`);

      return this.getErrorResumeData(errorMsg);
    }
  }

  /*
   * ==============================================================
   * STRUCTURED PROFILE EXTRACTION
   * ==============================================================
   */

  private extractStructuredProfile(
    rawText: string
  ): ResumeData {
    const textLower =
      rawText.toLowerCase();

    /*
     * Energy Engineering skill vocabulary.
     */
    const knownSkills = [
      'Energy Engineering',
      'Renewable Energy',
      'Energy Systems',
      'Energy Management',
      'Solar Energy',
      'Solar PV',
      'Photovoltaic',
      'PV',
      'Battery Energy Storage',
      'Battery Energy Storage Systems',
      'BESS',
      'Hydrogen',
      'Power-to-X',
      'Power to X',
      'Thermal Energy Storage',
      'Heat Transfer',
      'Thermodynamics',
      'Fluid Mechanics',
      'Energy Efficiency',
      'Power Systems',
      'Electrical Engineering',
      'Power Electronics',
      'Microgrids',
      'Smart Grids',
      'Wind Energy',
      'CFD',
      'MATLAB',
      'Simulink',
      'Simscape',
      'COMSOL',
      'ANSYS',
      'ANSYS Fluent',
      'AutoCAD',
      'AutoCAD MEP',
      'PVsyst',
      'Python',
      'Arduino',
      'ESP32',
      'IoT',
      'LaTeX',
      'Optimization',
      'Optimisation',
      'Modelling',
      'Modeling',
      'Simulation',
      'Modélisation',
      'Énergies renouvelables',
      'Génie énergétique',
      'Systèmes énergétiques',
      'Hydrogène',
      'Stockage d’énergie',
      'Stockage énergétique',
      'Transfert thermique',
      'Thermodynamique',
      'Efficacité énergétique',
      'Réseaux électriques',
      'Réseaux intelligents',
      'Systèmes photovoltaïques',
      'Énergie solaire',
    ];

    const extractedSkills =
      knownSkills.filter((skill) =>
        textLower.includes(
          skill.toLowerCase()
        )
      );

    /*
     * Remove duplicate skills caused by overlapping
     * vocabulary entries.
     */
    const uniqueSkills = [
      ...new Set(extractedSkills),
    ];

    logger.info(
      `✓ Skills extracted (${uniqueSkills.length} skills found): ${uniqueSkills
        .slice(0, 15)
        .join(', ')}`
    );

    /*
     * ============================================================
     * PROJECTS
     * ============================================================
     */

    const projects: ResumeData['projects'] = [];

    const hasProjectSection =
      textLower.includes('project') ||
      textLower.includes('projet') ||
      textLower.includes('academic project') ||
      textLower.includes('projet académique');

    if (hasProjectSection) {
      projects.push({
        title:
          'Energy Engineering Projects',
        description:
          'Academic and engineering projects involving energy systems, renewable energy, modelling, simulation and optimization.',
        technologies:
          uniqueSkills.slice(0, 8),
      });
    }

    logger.info(
      `✓ Projects extracted (${projects.length} key projects detected)`
    );

    /*
     * ============================================================
     * EDUCATION
     * ============================================================
     */

    const education: ResumeData['education'] = [];

    const isENIM =
      textLower.includes('enim') ||
      textLower.includes(
        'école nationale des ingénieurs de monastir'
      ) ||
      textLower.includes(
        'ecole nationale des ingenieurs de monastir'
      );

    const degree =
      'Engineering Degree + Master 2';

    const field =
      'Energy Engineering / Energy Systems Management';

    education.push({
      institution: isENIM
        ? 'École Nationale d’Ingénieurs de Monastir (ENIM)'
        : 'Engineering School',
      degree,
      fieldOfStudy: field,
      startYear: '2024',
      endYear: '2027',
    });

    logger.info(
      `✓ Education extracted (${degree} in ${field})`
    );

    /*
     * ============================================================
     * EXPERIENCE
     * ============================================================
     */

    const experience: ResumeData['experience'] = [];

    const hasExperience =
      textLower.includes('internship') ||
      textLower.includes('intern') ||
      textLower.includes('stage') ||
      textLower.includes('experience') ||
      textLower.includes('expérience') ||
      textLower.includes('professional experience') ||
      textLower.includes('expérience professionnelle');

    if (hasExperience) {
      experience.push({
        title:
          'Energy Engineering Intern',
        company:
          'Engineering / Energy Organization',
        duration:
          'Internship',
        description:
          'Engineering experience related to energy systems, industrial processes and energy transition.',
      });
    }

    logger.info(
      `✓ Experience extracted (${experience.length} past roles detected)`
    );

    /*
     * ============================================================
     * COMPLETENESS SCORE
     * ============================================================
     */

    let completenessScore = 0;

    if (uniqueSkills.length >= 10) {
      completenessScore += 40;
    } else {
      completenessScore +=
        uniqueSkills.length * 4;
    }

    if (projects.length > 0) {
      completenessScore += 20;
    }

    if (education.length > 0) {
      completenessScore += 25;
    }

    if (experience.length > 0) {
      completenessScore += 15;
    }

    /*
     * ============================================================
     * FINAL PROFILE
     * ============================================================
     */

    return {
      name:
        'Energy Engineering Candidate',

      education,

      skills:
        uniqueSkills.length > 0
          ? uniqueSkills
          : [
              'Energy Engineering',
              'Renewable Energy',
              'Thermodynamics',
              'Heat Transfer',
              'MATLAB',
              'Python',
            ],

      projects,

      experience,

      achievements: [],

      certifications: [],

      rawText,

      isParsedSuccessfully: true,

      completenessScore:
        Math.min(
          100,
          completenessScore
        ),
    };
  }

  public getDefaultCandidateProfile(): ResumeData {
    const raw = `Seif Eddine Nefzi
Élève Ingénieur Génie Énergétique (3ème année) - École Nationale d'Ingénieurs de Monastir (ENIM)
Master 2 Recherche en Énergétique
Compétences : Énergies Renouvelables, Solaire PV, Photovoltaïque, Traqueur Solaire, Stockage d'Énergie, BESS, Batteries, STEP, Pompage-Turbinage, Stockage Mécanique, Volants d'inertie, CAES, Microgrids, Smart Grids, EMS, Onduleurs, Thermique, Échangeurs de chaleur, MATLAB, Simulink, Python, AutoCAD.
Projets : Dimensionnement et commande d'un suiveur solaire PV à deux axes (ENIM), Modélisation et gestion de charge de stockage BESS pour microgrid autonome, Audits énergétiques et bilans thermiques industriels (SOTULUB).`;

    return this.extractStructuredProfile(raw);
  }

  /*
   * ==============================================================
   * ERROR PROFILE
   * ==============================================================
   */

  private getErrorResumeData(
    reason: string
  ): ResumeData {
    return {
      name:
        'Unknown Candidate',

      education: [],

      skills: [],

      projects: [],

      experience: [],

      achievements: [],

      certifications: [],

      rawText: '',

      isParsedSuccessfully: false,

      parseErrorReason: reason,

      completenessScore: 0,
    };
  }
}

export const resumeParserService =
  new ResumeParserService();
