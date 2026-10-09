
import { pluginRegistry } from './PluginRegistry.js';
import { ATSScraperPlugin } from './impl/ats/ATSScraperPlugin.js';
import { GenericHtmlPlugin } from './impl/GenericHtmlPlugin.js';
import { GitHubInternshipPlugin } from './impl/GitHubInternshipPlugin.js';
import { RssSitemapPlugin } from './impl/RssSitemapPlugin.js';

export function registerPlugins(): void {
  pluginRegistry.register(new ATSScraperPlugin());
  pluginRegistry.register(new GitHubInternshipPlugin());
  pluginRegistry.register(new RssSitemapPlugin());
  pluginRegistry.register(new GenericHtmlPlugin());
}
