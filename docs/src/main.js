import { LeitnerApp } from './core/leitnerApp.js';
import { TabRouter } from './ui/tabRouter.js';
import { KeyboardManager } from './ui/keyboardManager.js';
import { TabbedNavigation } from './ui/components/tabbedNavigation.js';
import { StatisticsDashboard } from './ui/components/statisticsDashboard.js';
import { CSVInlineEditor } from './ui/components/csvInlineEditor.js';
import { SessionModal } from './ui/components/sessionModal.js';

/**
 * Bootstrap file responsible for wiring UI navigation and the Leitner app.
 * Keeping this entry point tiny ensures future modules can be registered here
 * without touching the core classes.
 *
 * @returns {void}
 */
function bootstrap() {
    const keyboardManager = new KeyboardManager();
    keyboardManager.init();

    const tabRouter = new TabRouter({ defaultTab: 'review' });
    const tablist = document.querySelector('.tab-nav');
    const tabNavigation = new TabbedNavigation({
        tablist,
        router: tabRouter,
        keyboardManager
    });
    tabNavigation.init();

    const advancedButton = document.getElementById('open-import-export');
    if (advancedButton) {
        const openAdvancedPage = () => {
            if (typeof window.openImportExport === 'function') {
                window.openImportExport();
            }
        };

        advancedButton.addEventListener('click', (event) => {
            event.preventDefault();
            openAdvancedPage();
        });

        keyboardManager.registerShortcut('ctrl+-', () => {
            advancedButton.focus();
            openAdvancedPage();
        }, {
            description: 'Ouvrir la page Import / Export avancé',
            element: advancedButton,
            global: true
        });
    }

    const app = new LeitnerApp({ tabRouter, keyboardManager });
    window.leitnerApp = app;

    const csvContainer = document.getElementById('csv-inline-editor');
    if (csvContainer) {
        const csvEditor = new CSVInlineEditor({
            container: csvContainer,
            keyboardManager
        });
        csvEditor.init();
        csvEditor.bindToApp(app);
    }

    const statsContainer = document.querySelector('[data-component="statistics-dashboard"]');
    if (statsContainer) {
        const dashboard = new StatisticsDashboard({
            container: statsContainer,
            historyService: app.history,
            keyboardManager
        });
        dashboard.init();
    }

    const sessionModal = new SessionModal({
        app,
        historyService: app.history
    });
    sessionModal.init();
}

document.addEventListener('DOMContentLoaded', bootstrap);
