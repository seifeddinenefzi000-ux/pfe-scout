import { pluginRegistry } from './PluginRegistry.js';
import { GenericHtmlPlugin } from './impl/GenericHtmlPlugin.js';
import { GitHubInternshipPlugin } from './impl/GitHubInternshipPlugin.js';
import { RssSitemapPlugin } from './impl/RssSitemapPlugin.js';
import { ATSScraperPlugin } from './impl/ats/ATSScraperPlugin.js';

export function initializePlugins(): void {
  /*
   * PFE Scout is international.
   *
   * India-specific plugins such as AICTE,
   * Indian Government Research Labs, and
   * Unstop/Internshala are intentionally not
   * registered in the production crawler.
   *
   * Their source files are kept for reference
   * and can be re-enabled later if needed.
   */

  pluginRegistry.register(new ATSScraperPlugin());
  pluginRegistry.register(new GitHubInternshipPlugin());
  pluginRegistry.register(new RssSitemapPlugin());
  pluginRegistry.register(new GenericHtmlPlugin());
}