/**
 * Lightweight modal displaying the current session summary and review history.
 * The component coordinates with LeitnerApp to resume an interrupted review
 * and surface previously recorded sessions without leaving the current page.
 */
export class SessionModal {
    /**
     * @param {Object} options - Component options.
     * @param {import('../../core/leitnerApp.js').LeitnerApp} [options.app] - Active Leitner application instance.
     * @param {import('../../core/historyService.js').HistoryService} [options.historyService] - History service used to fetch sessions.
     */
    constructor({ app, historyService } = {}) {
        this.app = app || null;
        this.historyService = historyService || null;

        this.modal = null;
        this.closeButton = null;
        this.resumeButton = null;
        this.currentSessionSection = null;
        this.sessionInfo = null;
        this.historyList = null;

        this.isOpen = false;
        this.isAppReady = false;
        this.promptedResume = false;

        this.open = this.open.bind(this);
        this.close = this.close.bind(this);
        this.resume = this.resume.bind(this);
        this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
        this.updateCurrentSession = this.updateCurrentSession.bind(this);
        this.updateHistory = this.updateHistory.bind(this);
        this.maybePromptResume = this.maybePromptResume.bind(this);
    }

    /**
     * Initialise DOM references and listeners.
     *
     * @returns {void}
     */
    init() {
        this.modal = document.getElementById('statsModal');
        if (!this.modal) {
            return;
        }

        this.closeButton = this.modal.querySelector('[data-action="close-stats"]');
        this.resumeButton = this.modal.querySelector('[data-action="resume-session"]');
        this.currentSessionSection = document.getElementById('currentSession');
        this.sessionInfo = document.getElementById('sessionInfo');
        this.historyList = document.getElementById('historyList');

        this.closeButton?.addEventListener('click', this.close);
        this.resumeButton?.addEventListener('click', () => {
            void this.resume();
        });

        this.modal.addEventListener('click', (event) => {
            if (event.target === this.modal) {
                this.close();
            }
        });

        document.querySelectorAll('[data-open-stats]').forEach((trigger) => {
            trigger.addEventListener('click', (event) => {
                event.preventDefault();
                this.open();
            });
        });

        if (typeof window !== 'undefined') {
            window.openStats = this.open;
            window.closeStats = this.close;
            window.resumeSession = () => {
                void this.resume();
            };
        }

        window.addEventListener('leitner:card-reviewed', this.updateCurrentSession, { passive: true });
        window.addEventListener('leitner:cards-updated', this.updateCurrentSession, { passive: true });
        window.addEventListener('leitner:session-started', this.updateCurrentSession, { passive: true });
        window.addEventListener('leitner:session-recorded', () => {
            this.updateCurrentSession();
            this.updateHistory();
        }, { passive: true });

        window.addEventListener('leitner:app-ready', () => {
            this.isAppReady = true;
            this.updateCurrentSession();
            this.updateHistory();
            this.maybePromptResume();
        }, { once: true });

        this.updateCurrentSession();
        this.updateHistory();
        this.maybePromptResume();
    }

    /**
     * Wait for the application bootstrap to finish.
     *
     * @returns {Promise<void>}
     */
    async waitUntilReady() {
        if (this.isAppReady) {
            return;
        }

        await new Promise((resolve) => {
            window.addEventListener('leitner:app-ready', resolve, { once: true });
        });
        this.isAppReady = true;
    }

    /**
     * Close the modal when Escape is pressed.
     *
     * @param {KeyboardEvent} event - Keyboard event payload.
     * @returns {void}
     */
    handleDocumentKeydown(event) {
        if (event.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Display the statistics modal.
     *
     * @returns {void}
     */
    open() {
        if (!this.modal) {
            return;
        }

        this.updateCurrentSession();
        this.updateHistory();

        this.modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        document.addEventListener('keydown', this.handleDocumentKeydown);
        this.isOpen = true;

        const focusable = this.modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable && typeof focusable.focus === 'function') {
            focusable.focus();
        }
    }

    /**
     * Hide the statistics modal.
     *
     * @returns {void}
     */
    close() {
        if (!this.modal) {
            return;
        }

        this.modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', this.handleDocumentKeydown);
        this.isOpen = false;
    }

    /**
     * Resume the active session.
     *
     * @returns {Promise<void>}
     */
    async resume() {
        if (!this.app || !this.resumeButton) {
            return;
        }

        await this.waitUntilReady();

        const session = this.historyService?.currentSession;
        const snapshot = this.app.getStoredSessionState?.();
        if (!session || session.completedAt || !snapshot) {
            alert('Aucune session en cours à reprendre.');
            return;
        }

        this.resumeButton.disabled = true;
        try {
            const resumed = await this.app.resumeSession?.();
            if (!resumed) {
                alert('Impossible de reprendre la session en cours.');
            } else {
                this.close();
            }
        } catch (error) {
            console.error('Resume session failed', error);
            alert('Impossible de reprendre la session en cours.');
        } finally {
            this.resumeButton.disabled = !this.isAppReady;
        }
    }

    /**
     * Update the "current session" summary displayed in the modal.
     *
     * @returns {void}
     */
    updateCurrentSession() {
        if (!this.currentSessionSection || !this.sessionInfo) {
            return;
        }

        const session = this.historyService?.currentSession || null;
        const snapshot = this.app?.getStoredSessionState?.() || null;
        const hasActiveSession = Boolean(session && !session.completedAt);

        if (!hasActiveSession) {
            this.currentSessionSection.classList.add('hidden');
            if (this.resumeButton) {
                this.resumeButton.disabled = true;
            }
            return;
        }

        const seen = session?.stats?.reviewed ?? snapshot?.cardsSeen?.length ?? 0;
        let remaining = snapshot?.totalDue ?? null;
        if (remaining === null && Array.isArray(this.app?.flashcards)) {
            remaining = Math.max(this.app.flashcards.length - seen, 0);
        }
        const remainingLabel = typeof remaining === 'number'
            ? `${remaining} restante(s)`
            : 'Progression en cours';

        const elapsedMs = Date.now() - (session?.startedAt || Date.now());
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        let elapsedLabel = 'moins d’une minute';
        if (elapsedMinutes === 1) {
            elapsedLabel = '1 minute';
        } else if (elapsedMinutes > 1) {
            elapsedLabel = `${elapsedMinutes} minutes`;
        }

        this.sessionInfo.textContent = `${seen} carte(s) vues, ${remainingLabel}. Commencée il y a ${elapsedLabel}.`;
        this.currentSessionSection.classList.remove('hidden');

        if (this.resumeButton) {
            this.resumeButton.disabled = !this.isAppReady;
        }
    }

    /**
     * Refresh the history list with completed sessions.
     *
     * @returns {void}
     */
    updateHistory() {
        if (!this.historyList || !this.historyService?.getSessions) {
            return;
        }

        const sessions = this.historyService.getSessions();
        const completed = sessions
            .filter((session) => session && session.completedAt)
            .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
            .slice(0, 10);

        if (!completed.length) {
            this.historyList.innerHTML = '';
            const emptyItem = document.createElement('li');
            emptyItem.className = 'stats-history__item';
            emptyItem.textContent = 'Aucune session terminée';
            this.historyList.appendChild(emptyItem);
            return;
        }

        this.historyList.innerHTML = '';
        completed.forEach((session) => {
            const item = document.createElement('li');
            item.className = 'stats-history__item';

            const title = document.createElement('strong');
            title.textContent = this.formatDate(session.completedAt || session.startedAt || Date.now());
            item.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'stats-history__meta';

            const contextLabel = this.describeContext(session.context);
            if (contextLabel) {
                const contextSpan = document.createElement('span');
                contextSpan.textContent = contextLabel;
                meta.appendChild(contextSpan);
            }

            const reviewed = session.stats?.reviewed ?? 0;
            const correct = session.stats?.correct ?? 0;
            const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
            const duration = this.formatDuration((session.completedAt || Date.now()) - (session.startedAt || Date.now()));

            [
                `${reviewed} carte(s)`,
                `Précision ${accuracy}%`,
                `Durée ${duration}`
            ].forEach((text) => {
                const span = document.createElement('span');
                span.textContent = text;
                meta.appendChild(span);
            });

            if (session.context?.mode) {
                const span = document.createElement('span');
                span.textContent = `Mode ${session.context.mode}`;
                meta.appendChild(span);
            }

            item.appendChild(meta);
            this.historyList.appendChild(item);
        });
    }

    /**
     * Format a duration for display.
     *
     * @param {number} durationMs - Duration in milliseconds.
     * @returns {string}
     */
    formatDuration(durationMs) {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            return '<1 min';
        }

        const totalMinutes = Math.round(durationMs / 60000);
        if (totalMinutes <= 0) {
            return '<1 min';
        }

        if (totalMinutes >= 60) {
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            if (minutes === 0) {
                return `${hours} h`;
            }
            return `${hours} h ${minutes} min`;
        }

        return `${totalMinutes} min`;
    }

    /**
     * Format a timestamp for display in the history list.
     *
     * @param {number} timestamp - Epoch timestamp in milliseconds.
     * @returns {string}
     */
    formatDate(timestamp) {
        try {
            return new Date(timestamp).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
        } catch (error) {
            console.warn('SessionModal: unable to format date', error);
            return '';
        }
    }

    /**
     * Prompt the user to resume the session once per load.
     *
     * @returns {void}
     */
    maybePromptResume() {
        if (this.promptedResume || !this.isAppReady) {
            return;
        }

        const session = this.historyService?.currentSession;
        const snapshot = this.app?.getStoredSessionState?.();

        if (!session || session.completedAt || !snapshot) {
            return;
        }

        this.promptedResume = true;
        if (window.confirm('Tu as une session en cours. La reprendre ?')) {
            void this.resume();
        }
    }

    describeContext(rawContext = {}) {
        if (!rawContext || typeof rawContext !== 'object') {
            return '';
        }

        const context = rawContext || {};
        if (context.type === 'csv-changed') {
            const from = context.from || 'inconnu';
            const to = context.to || 'inconnu';
            return `Changement de CSV (${from} → ${to})`;
        }

        if (context.mode) {
            return `Mode ${context.mode}`;
        }

        const entries = Object.entries(context)
            .filter(([key]) => key !== 'type')
            .map(([key, value]) => `${key}: ${value}`);

        return entries.join(', ');
    }
}
