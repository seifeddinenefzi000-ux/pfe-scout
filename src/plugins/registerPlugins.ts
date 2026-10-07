import { pluginRegistry } from './PluginRegistry.js';
import { ATSScraperPlugin } from './corporate/ATSScraperPlugin.js';

export function registerPlugins(): void {
  pluginRegistry.register(new ATSScraperPlugin());
}
