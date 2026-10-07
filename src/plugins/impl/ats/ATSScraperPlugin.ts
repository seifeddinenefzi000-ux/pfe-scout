import axios from 'axios';
import { SourcePlugin } from '../../SourcePlugin.js';
import {
  CollectedPage,
  RawInternship,
} from '../../../models/DomainModels.js';
import { logger } from '../../../utils/logger.js';

export class ATSScraperPlugin implements SourcePlugin {
  readonly id = 'ats-portal';

  readonly name =
    'Corporate ATS Scraper (Greenhouse)';

  readonly description =
    'Fetches internship and student opportunities from public Greenhouse ATS APIs.';

  readonly type = 'CORPORATE';

  // ------------------------------------------------------------
  // SOURCE DETECTION
  // ------------------------------------------------------------

  supports(url: string): boolean {
    const normalized = url.toLowerCase();

    return (
      normalized.includes('greenhouse.io') ||
      normalized.includes('boards-api.greenhouse.io')
    );
  }


  // ------------------------------------------------------------
  // DISCOVERY
  //
  // We no longer hardcode Postman/Razorpay.
  //
  // ATS sources will be added through the database.
  // ------------------------------------------------------------

  async discover(_baseUrl: string): Promise<string[]> {
    return [];
  }


  // ------------------------------------------------------------
  // COLLECT
  // ------------------------------------------------------------

  async collect(
    url: string
  ): Promise<CollectedPage> {

    try {
      logger.info(
        `Fetching Greenhouse ATS source: ${url}`
      );

      let apiUrl = url;

      /*
       * If a normal Greenhouse board URL is supplied,
       * convert it into the public Greenhouse jobs API.
       *
       * Example:
       * https://boards.greenhouse.io/company
       *
       * becomes:
       * https://boards-api.greenhouse.io/v1/boards/company/jobs?content=true
       */

      const normalBoardMatch =
        url.match(
          /boards\.greenhouse\.io\/([^/?#]+)/
        );

      if (normalBoardMatch) {
        const board = normalBoardMatch[1];

        apiUrl =
          `https://boards-api.greenhouse.io/v1/boards/` +
          `${encodeURIComponent(board)}/jobs?content=true`;
      }

      const response = await axios.get(
        apiUrl,
        {
          timeout: 15000,
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'PFE-Scout/1.0 internship-research-bot',
          },
        }
      );

      return {
        url: apiUrl,

        content:
          JSON.stringify(response.data),

        headers: {
          'content-type':
            response.headers['content-type'] ||
            'application/json',
        },

        statusCode: response.status,

        fetchedAt:
          new Date().toISOString(),
      };

    } catch (error) {

      logger.error(
        `Failed to fetch ATS source: ${url}`,
        {
          error: String(error),
        }
      );

      return {
        url,

        content: '',

        headers: {},

        statusCode: 500,

        fetchedAt:
          new Date().toISOString(),
      };
    }
  }


  // ------------------------------------------------------------
  // NORMALIZE GREENHOUSE JOBS
  // ------------------------------------------------------------

  async normalize(
    page: CollectedPage
  ): Promise<RawInternship[]> {

    const realListings: RawInternship[] = [];

    if (!page.content) {
      return realListings;
    }

    try {

      const data =
        JSON.parse(page.content);

      if (
        !data ||
        !Array.isArray(data.jobs)
      ) {
        logger.warn(
          `Greenhouse response contains no jobs: ${page.url}`
        );

        return realListings;
      }


      for (const job of data.jobs) {

        const title =
          String(job.title || '').trim();

        if (!title) {
          continue;
        }


        const description =
          job.content
            ? String(job.content)
                .replace(/<[^>]*>/gm, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 5000)
            : title;


        const titleLower =
          title.toLowerCase();

        const descriptionLower =
          description.toLowerCase();


        // ------------------------------------------------------
        // Internship / student / thesis detection
        // ------------------------------------------------------

        const internshipSignals = [
          'intern',
          'internship',
          'student',
          'trainee',
          'co-op',
          'coop',
          'apprentice',
          'apprenticeship',
          'thesis',
          'master thesis',
          'research intern',
          'research internship',
          'graduate project',
          'placement',
          'pfe',
          'stage',
          'stagiaire',
        ];


        const isInternship =
          internshipSignals.some(
            (keyword) =>
              titleLower.includes(keyword) ||
              descriptionLower.includes(keyword)
          );


        if (!isInternship) {
          continue;
        }


        // ------------------------------------------------------
        // Extract skills / domain keywords
        // ------------------------------------------------------

        const domainKeywords = [
          'energy',
          'renewable',
          'solar',
          'photovoltaic',
          'wind',
          'hydrogen',
          'battery',
          'bess',
          'energy storage',
          'thermal',
          'thermodynamics',
          'heat transfer',
          'cfd',
          'fluid mechanics',
          'power systems',
          'power electronics',
          'smart grid',
          'microgrid',
          'energy management',
          'energy efficiency',
          'sustainability',
          'decarbonization',
          'decarbonisation',
          'power-to-x',
          'power to x',
          'simulation',
          'modelling',
          'modeling',
          'matlab',
          'simulink',
          'python',
          'comsol',
          'ansys',
          'pvsyst',
        ];


        const matchedSkills =
          domainKeywords.filter(
            (keyword) =>
              titleLower.includes(keyword) ||
              descriptionLower.includes(keyword)
          );


        // ------------------------------------------------------
        // Location
        // ------------------------------------------------------

        const location =
          job.location?.name ||
          'Not specified';


        // ------------------------------------------------------
        // Company
        //
        // Greenhouse API usually gives the company indirectly
        // through the board. The source URL remains available
        // in metadata.
        // ------------------------------------------------------

        let companyName =
          'Unknown company';

        const boardMatch =
          page.url.match(
            /boards-api\.greenhouse\.io\/v1\/boards\/([^/]+)/
          );

        if (boardMatch) {
          companyName =
            decodeURIComponent(
              boardMatch[1]
            );
        }


        // ------------------------------------------------------
        // Create normalized raw internship
        // ------------------------------------------------------

        realListings.push({

          title,

          companyName,

          location,

          description,

          applyUrl:
            job.absolute_url ||
            job.url ||
            page.url,

          stipendText:
            'Not disclosed',

          deadlineText:
            'Open / not specified',

          rawSkills:
            matchedSkills,

          externalId:
            job.id
              ? String(job.id)
              : undefined,

          metadata: {

            source:
              'Greenhouse',

            ats:
              'Greenhouse',

            jobId:
              job.id,

            sourceUrl:
              page.url,

            scrapedAt:
              new Date().toISOString(),

            department:
              job.departments
                ?.map(
                  (department: any) =>
                    department.name
                ),

            offices:
              job.offices
                ?.map(
                  (office: any) =>
                    office.name
                ),
          },
        });
      }


      logger.info(
        `Greenhouse normalization produced ` +
        `${realListings.length} internship/student listings.`
      );


    } catch (error) {

      logger.error(
        `Failed to normalize Greenhouse response`,
        {
          error: String(error),
          url: page.url,
        }
      );
    }


    return realListings;
  }


  // ------------------------------------------------------------
  // HEALTH CHECK
  // ------------------------------------------------------------

  async healthCheck(
    sourceUrl: string
  ): Promise<boolean> {

    try {

      const page =
        await this.collect(sourceUrl);

      return (
        page.statusCode >= 200 &&
        page.statusCode < 300 &&
        page.content.length > 0
      );

    } catch {

      return false;
    }
  }
}
