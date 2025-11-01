/**
 * Simple tab navigation router managing ARIA attributes and visibility.
 * The router reads tab definitions from the DOM using `data-tab-target` and
 * `data-tab-panel` attributes to keep HTML declarative.
 *
 * @class TabRouter
 * @property {string} defaultTab - Tab identifier used when no persisted state exists.
 * @property {string} storageKey - Key used to persist the last active tab in localStorage.
 * @property {HTMLButtonElement[]} tabButtons - Collection of tab triggers discovered in the DOM.
 * @property {HTMLElement[]} tabPanels - List of tab panels that get toggled.
 * @property {string|null} activeTab - Identifier of the currently selected tab.
 */
export class TabRouter {
    constructor(options = {}) {
        this.defaultTab = options.defaultTab || 'review';
        this.storageKey = options.storageKey || 'leitnerActiveTab';
        this.tabButtons = [];
        this.tabPanels = [];
        this.activeTab = null;
        this.storage = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage
            : {
                getItem: () => null,
                setItem: () => {}
            };
    }

    /**
     * Initialise listeners and restore the last active tab when possible.
     *
     * @returns {void}
     */
    init() {
        this.tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
        this.tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

        const storedTab = this.storage.getItem(this.storageKey);
        const initialTab = this.isValidTab(storedTab) ? storedTab : this.defaultTab;

        this.tabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.activateTab(button.dataset.tabTarget);
            });
        });

        this.activateTab(initialTab);
    }

    /**
     * Activate a tab by id and update ARIA attributes for accessibility.
     *
     * @param {string} tabId - Identifier matching the `data-tab-panel` attribute.
     * @returns {void}
     */
    activateTab(tabId) {
        if (!this.isValidTab(tabId)) {
            return;
        }

        this.activeTab = tabId;
        this.storage.setItem(this.storageKey, tabId);

        this.tabButtons.forEach((button) => {
            const isActive = button.dataset.tabTarget === tabId;
            button.classList.toggle('tab-button-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        this.tabPanels.forEach((panel) => {
            const isActive = panel.dataset.tabPanel === tabId;
            panel.classList.toggle('hidden', !isActive);
            panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });
    }

    /**
     * Determine whether the provided tab id exists in the current DOM.
     *
     * @param {string|null} tabId - Identifier of the tab to validate.
     * @returns {boolean} True when the tab exists, false otherwise.
     */
    isValidTab(tabId) {
        if (!tabId) {
            return false;
        }
        return this.tabPanels.some((panel) => panel.dataset.tabPanel === tabId);
    }
}
