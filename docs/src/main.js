import { LeitnerApp } from '../app.js';
import { TabRouter } from './ui/tabRouter.js';

/**
 * Bootstrap file responsible for wiring UI navigation and the Leitner app.
 * Keeping this entry point tiny ensures future modules can be registered here
 * without touching the core classes.
 */
function bootstrap() {
    const tabRouter = new TabRouter({ defaultTab: 'review' });
    tabRouter.init();

    window.leitnerApp = new LeitnerApp({ tabRouter });
}

document.addEventListener('DOMContentLoaded', bootstrap);
