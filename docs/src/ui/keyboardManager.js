/**
 * Lightweight keyboard shortcut manager providing combo normalisation,
 * contextual registration and animated visual feedback.
 * The class registers a single keydown listener on `document` and dispatches
 * callbacks when the matching shortcut is triggered.
 */
export class KeyboardManager {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
        this.feedbackTimeout = null;
        this.helpVisible = false;

        this.handleKeydown = this.handleKeydown.bind(this);
        this.toggleHelp = this.toggleHelp.bind(this);
    }

    /**
     * Initialise DOM bindings. Must be called once after construction.
     *
     * @returns {void}
     */
    init() {
        document.addEventListener('keydown', this.handleKeydown, { passive: false });
        this.ensureFeedbackNode();
        this.ensureHelpPanel();

        // Default shortcut to toggle the cheat sheet
        this.registerShortcut('shift+/', this.toggleHelp, {
            description: 'Afficher / masquer la liste des raccourcis',
            global: true
        });
    }

    /**
     * Ensure the feedback toast exists in the DOM.
     *
     * @returns {void}
     */
    ensureFeedbackNode() {
        if (document.getElementById('shortcut-feedback')) {
            return;
        }

        const node = document.createElement('div');
        node.id = 'shortcut-feedback';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        node.className = 'shortcut-feedback';
        document.body.appendChild(node);
    }

    /**
     * Create the help panel container when it does not exist yet.
     *
     * @returns {void}
     */
    ensureHelpPanel() {
        if (document.getElementById('shortcut-help')) {
            return;
        }

        const panel = document.createElement('aside');
        panel.id = 'shortcut-help';
        panel.className = 'shortcut-help hidden';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Aide des raccourcis clavier');
        panel.setAttribute('aria-hidden', 'true');

        const title = document.createElement('h2');
        title.textContent = 'Raccourcis clavier';
        title.className = 'shortcut-help__title';

        const list = document.createElement('ul');
        list.className = 'shortcut-help__list';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'Fermer';
        closeButton.className = 'shortcut-help__close';
        closeButton.addEventListener('click', () => this.toggleHelp());

        panel.append(title, list, closeButton);
        document.body.appendChild(panel);
        this.helpList = list;
    }

    /**
     * Register a new keyboard shortcut.
     *
     * @param {string} combo - Combination description such as `ctrl+k`.
     * @param {Function} handler - Callback triggered when the shortcut fires.
     * @param {Object} [options] - Additional configuration.
     * @param {string} [options.description] - Human readable description.
     * @param {HTMLElement} [options.element] - Related element to annotate with tooltip data.
     * @param {boolean} [options.global=false] - Whether to trigger even when focus is inside inputs.
     * @returns {void}
     */
    registerShortcut(combo, handler, options = {}) {
        const normalised = KeyboardManager.normaliseCombo(combo);
        if (!normalised) {
            return;
        }

        this.shortcuts.set(normalised, { handler, options });
        this.updateHelpPanel();

        if (options.element) {
            options.element.dataset.shortcut = KeyboardManager.formatComboForDisplay(normalised);
        }
    }

    /**
     * Handle global keydown events and trigger shortcut callbacks when relevant.
     *
     * @param {KeyboardEvent} event - DOM keyboard event instance.
     * @returns {void}
     */
    handleKeydown(event) {
        if (!this.isEnabled) {
            return;
        }

        const combo = KeyboardManager.normaliseEvent(event);
        if (!combo) {
            return;
        }

        const registration = this.shortcuts.get(combo);
        if (!registration) {
            return;
        }

        const { handler, options } = registration;
        const target = event.target;
        const isFormField = target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement
            || target?.isContentEditable;

        if (!options?.global && isFormField) {
            return;
        }

        event.preventDefault();
        handler(event);
        this.flashFeedback(combo, options?.description);
    }

    /**
     * Display a toast describing the executed shortcut.
     *
     * @param {string} combo - Normalised combo string.
     * @param {string} [description] - Optional description to display.
     * @returns {void}
     */
    flashFeedback(combo, description) {
        const node = document.getElementById('shortcut-feedback');
        if (!node) {
            return;
        }

        node.textContent = `${KeyboardManager.formatComboForDisplay(combo)}${description ? ` — ${description}` : ''}`;
        node.classList.add('shortcut-feedback--visible');

        clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = setTimeout(() => {
            node.classList.remove('shortcut-feedback--visible');
        }, 1200);
    }

    /**
     * Toggle the visibility of the help panel.
     *
     * @returns {void}
     */
    toggleHelp() {
        const panel = document.getElementById('shortcut-help');
        if (!panel) {
            return;
        }

        this.helpVisible = !this.helpVisible;
        panel.classList.toggle('hidden', !this.helpVisible);
        panel.setAttribute('aria-hidden', this.helpVisible ? 'false' : 'true');

        if (this.helpVisible) {
            panel.querySelector('.shortcut-help__close')?.focus();
        }
    }

    /**
     * Update the shortcuts list inside the help panel.
     *
     * @returns {void}
     */
    updateHelpPanel() {
        if (!this.helpList) {
            return;
        }

        this.helpList.innerHTML = '';
        this.shortcuts.forEach(({ options }, combo) => {
            const item = document.createElement('li');
            item.className = 'shortcut-help__item';

            const comboBadge = document.createElement('span');
            comboBadge.className = 'shortcut-help__combo';
            comboBadge.textContent = KeyboardManager.formatComboForDisplay(combo);

            const description = document.createElement('span');
            description.className = 'shortcut-help__description';
            description.textContent = options?.description || 'Action personnalisée';

            item.append(comboBadge, description);
            this.helpList.appendChild(item);
        });
    }

    /**
     * Normalise a key combo string by ordering modifiers and trimming spacing.
     *
     * @param {string} combo - Raw user combo.
     * @returns {string} Lowercase sorted combo.
     */
    static normaliseCombo(combo) {
        if (!combo || typeof combo !== 'string') {
            return '';
        }

        const parts = combo
            .toLowerCase()
            .split('+')
            .map(part => part.trim())
            .filter(Boolean);

        const modifiers = [];
        const keys = [];
        parts.forEach((part) => {
            if (['ctrl', 'alt', 'shift', 'meta'].includes(part)) {
                modifiers.push(part);
            } else {
                keys.push(part);
            }
        });

        modifiers.sort();
        keys.sort();

        return [...modifiers, ...keys].join('+');
    }

    /**
     * Convert a keyboard event into a normalised combo string.
     *
     * @param {KeyboardEvent} event - DOM event.
     * @returns {string} Combo or empty string when irrelevant.
     */
    static normaliseEvent(event) {
        const parts = [];
        if (event.ctrlKey) parts.push('ctrl');
        if (event.altKey) parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        if (event.metaKey) parts.push('meta');

        const key = event.key.toLowerCase();

        // Ignore keys that are purely modifier presses.
        if (['control', 'shift', 'alt', 'meta'].includes(key)) {
            return '';
        }

        if (key === ' ') {
            parts.push('space');
        } else {
            parts.push(key);
        }

        return parts.join('+');
    }

    /**
     * Format a combo for visual display with uppercase modifier names.
     *
     * @param {string} combo - Normalised combo string.
     * @returns {string} Human readable representation.
     */
    static formatComboForDisplay(combo) {
        return combo
            .split('+')
            .map(part => part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
            .join(' + ');
    }
}
