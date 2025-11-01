/**
 * Simple tab navigation router managing ARIA attributes and visibility.
 * The router reads tab definitions from the DOM using `data-tab-target` and
 * `data-tab-panel` attributes to keep HTML declarative.
 */
export class TabRouter {
    constructor(options = {}) {
        this.defaultTab = options.defaultTab || 'review';
        this.storageKey = options.storageKey || 'leitnerActiveTab';
        this.tabButtons = [];
        this.tabPanels = [];
        this.activeTab = null;
    }

    /**
     * Initialise listeners and restore the last active tab when possible.
     */
    init() {
        this.tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
        this.tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

        const storedTab = localStorage.getItem(this.storageKey);
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
     * @param {string} tabId - Identifier matching the `data-tab-panel` attribute.
     */
    activateTab(tabId) {
        if (!this.isValidTab(tabId)) {
            return;
        }

        this.activeTab = tabId;
        localStorage.setItem(this.storageKey, tabId);

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
     * @param {string|null} tabId
     * @returns {boolean}
     */
    isValidTab(tabId) {
        if (!tabId) {
            return false;
        }
        return this.tabPanels.some((panel) => panel.dataset.tabPanel === tabId);
    }
}
