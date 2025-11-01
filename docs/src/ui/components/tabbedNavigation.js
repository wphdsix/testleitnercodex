/**
 * Accessible tabs component enhancing the existing TabRouter by providing
 * keyboard navigation, ARIA annotations and optional shortcut integration.
 */
export class TabbedNavigation {
    /**
     * @param {Object} options - Configuration options.
     * @param {HTMLElement} options.tablist - Container holding the tab buttons.
     * @param {import('../tabRouter.js').TabRouter} options.router - Router managing panel visibility.
     * @param {import('../keyboardManager.js').KeyboardManager} [options.keyboardManager] - Shortcut registry.
     */
    constructor({ tablist, router, keyboardManager } = {}) {
        this.tablist = tablist;
        this.router = router;
        this.keyboardManager = keyboardManager || null;
        this.tabs = [];

        this.handleKeydown = this.handleKeydown.bind(this);
    }

    /**
     * Initialise DOM bindings, register keyboard shortcuts and activate the router.
     *
     * @returns {void}
     */
    init() {
        if (!this.tablist || !this.router) {
            console.warn('TabbedNavigation requires both a tablist and a router.');
            return;
        }

        this.enhanceDOM();
        this.bindKeyboard();
        this.router.init();
    }

    /**
     * Enhance DOM nodes with ARIA attributes and internal references.
     *
     * @returns {void}
     */
    enhanceDOM() {
        this.tablist.setAttribute('role', 'tablist');
        this.tablist.setAttribute('aria-orientation', 'horizontal');

        this.tabs = Array.from(this.tablist.querySelectorAll('[data-tab-target]'));
        this.tabs.forEach((tabButton, index) => {
            const targetId = tabButton.dataset.tabTarget;
            const panel = document.querySelector(`[data-tab-panel="${targetId}"]`);
            const tabId = tabButton.id || `${targetId}-tab`;

            tabButton.setAttribute('role', 'tab');
            tabButton.setAttribute('aria-selected', 'false');
            tabButton.setAttribute('tabindex', index === 0 ? '0' : '-1');
            tabButton.id = tabId;
            tabButton.setAttribute('aria-controls', panel ? panel.id || `${targetId}-panel` : '');
            tabButton.addEventListener('keydown', this.handleKeydown);

            if (panel) {
                panel.id = panel.id || `${targetId}-panel`;
                panel.setAttribute('role', 'tabpanel');
                panel.setAttribute('tabindex', '0');
                panel.setAttribute('aria-labelledby', tabId);
            }
        });
    }

    /**
     * Bind navigation shortcuts for arrow keys and optional global combos.
     *
     * @returns {void}
     */
    bindKeyboard() {
        if (!this.keyboardManager) {
            return;
        }

        this.tabs.forEach((button, index) => {
            const combo = `ctrl+${index + 1}`;
            this.keyboardManager.registerShortcut(combo, () => {
                this.router.activateTab(button.dataset.tabTarget);
                button.focus();
            }, {
                description: `Ouvrir l'onglet « ${button.textContent.trim()} »`,
                element: button
            });
        });
    }

    /**
     * Handle roving tabindex and arrow key navigation inside the tablist.
     *
     * @param {KeyboardEvent} event - DOM keydown event.
     * @returns {void}
     */
    handleKeydown(event) {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        const currentIndex = this.tabs.indexOf(event.currentTarget);

        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % this.tabs.length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = this.tabs.length - 1;
        }

        const nextTab = this.tabs[nextIndex];
        this.tabs.forEach((tab, index) => {
            const isActive = index === nextIndex;
            tab.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        nextTab.focus();
        this.router.activateTab(nextTab.dataset.tabTarget);
    }
}
