import { pluginRegistry } from './PluginRegistry.js';
import { ATSScraperPlugin } from './impl/ats/ATSScraperPlugin.js';

export function registerPlugins(): void {
  pluginRegistry.register(new ATSScraperPlugin());
}
