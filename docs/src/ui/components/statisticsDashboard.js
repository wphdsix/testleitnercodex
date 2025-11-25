import { StatisticsService } from '../../analytics/statisticsService.js';
import { FilterableTable } from './filterableTable.js';

/**
 * Render statistics cards, heatmap and review durations by consuming the
 * statistics service. The dashboard refreshes automatically when sessions are
 * recorded.
 */
export class StatisticsDashboard {
    /**
     * @param {Object} options - Component options.
     * @param {HTMLElement} options.container - Root DOM element for the dashboard.
     * @param {import('../../core/historyService.js').HistoryService} options.historyService - Source history service.
     * @param {import('../keyboardManager.js').KeyboardManager} [options.keyboardManager] - Optional shortcut manager.
     * @param {import('../../core/leitnerApp.js').LeitnerApp} [options.app] - Optional application instance for session controls.
     */
    constructor({ container, historyService, keyboardManager, app } = {}) {
        this.container = container;
        this.historyService = historyService;
        this.keyboardManager = keyboardManager || null;
        this.app = app || null;
        this.service = new StatisticsService({ historyService });
        this.table = null;
        this.currentSessionContainer = null;
        this.resumeButton = null;
        this.clearButton = null;

        this.refresh = this.refresh.bind(this);
        this.debouncedRefresh = this.debounce(this.refresh, 400);
        this.resumeActiveSession = this.resumeActiveSession.bind(this);
        this.clearSessionFiles = this.clearSessionFiles.bind(this);
    }

    /**
     * Initialise markup, child components and event listeners.
     *
     * @returns {void}
     */
    init() {
        if (!this.container) {
            console.warn('StatisticsDashboard requires a container element.');
            return;
        }

        this.renderSkeleton();
        this.table = new FilterableTable({
            container: this.container.querySelector('[data-dashboard-table]'),
            columns: [
                { key: 'date', label: 'Date' },
                { key: 'duration', label: 'Durée', formatter: value => value },
                { key: 'reviews', label: 'Révisions' },
                { key: 'accuracy', label: 'Précision', formatter: value => `${value}%` },
                { key: 'context', label: 'Contexte' }
            ],
            ariaLabel: 'Historique des sessions de révision',
            keyboardManager: this.keyboardManager
        });
        this.table.init();

        this.registerShortcuts();
        this.refresh();

        window.addEventListener('leitner:card-reviewed', this.debouncedRefresh);
        window.addEventListener('leitner:session-recorded', this.refresh);
        window.addEventListener('leitner:session-started', this.refresh);
        window.addEventListener('leitner:sessions-cleared', this.refresh);
    }

    /**
     * Build static dashboard structure.
     *
     * @returns {void}
     */
    renderSkeleton() {
        this.container.classList.add('statistics-dashboard');
        this.container.innerHTML = `
            <section class="statistics-dashboard__panel" aria-label="Session en cours">
                <header class="statistics-dashboard__panel-header">
                    <h3 class="statistics-dashboard__panel-title">Session en cours</h3>
                    <span class="statistics-dashboard__panel-caption">Reprendre ou nettoyer l'historique</span>
                </header>
                <div class="statistics-dashboard__current" data-current-session></div>
                <div class="statistics-dashboard__actions">
                    <button type="button" class="btn" data-action="resume-session">Reprendre la session</button>
                    <button type="button" class="btn btn--danger" data-action="clear-sessions">Effacer les sessions</button>
                </div>
            </section>
            <div class="statistics-dashboard__summary" role="list"></div>
            <div class="statistics-dashboard__grid">
                <section class="statistics-dashboard__panel" aria-label="Carte de chaleur des sessions">
                    <header class="statistics-dashboard__panel-header">
                        <h3 class="statistics-dashboard__panel-title">Activité des 30 derniers jours</h3>
                        <span class="statistics-dashboard__panel-caption">Nombre de sessions complétées par jour</span>
                    </header>
                    <div class="statistics-dashboard__heatmap" data-heatmap role="list"></div>
                </section>
                <section class="statistics-dashboard__panel" aria-label="Temps de révision">
                    <header class="statistics-dashboard__panel-header">
                        <h3 class="statistics-dashboard__panel-title">Durée des sessions</h3>
                        <span class="statistics-dashboard__panel-caption">Total et moyenne des temps passés</span>
                    </header>
                    <div class="statistics-dashboard__bars" data-bars></div>
                </section>
            </div>
            <section class="statistics-dashboard__panel statistics-dashboard__panel--table" aria-label="Table des sessions">
                <header class="statistics-dashboard__panel-header">
                    <h3 class="statistics-dashboard__panel-title">Historique détaillé</h3>
                    <span class="statistics-dashboard__panel-caption">Filtrer et analyser chaque session</span>
                </header>
                <div data-dashboard-table></div>
            </section>
        `;

        this.currentSessionContainer = this.container.querySelector('[data-current-session]');
        this.resumeButton = this.container.querySelector('[data-action="resume-session"]');
        this.clearButton = this.container.querySelector('[data-action="clear-sessions"]');

        this.resumeButton?.addEventListener('click', this.resumeActiveSession);
        this.clearButton?.addEventListener('click', this.clearSessionFiles);
    }

    /**
     * Refresh the dashboard content with the latest statistics.
     *
     * @returns {void}
     */
    refresh() {
        this.renderCurrentSession();
        const data = this.service.getDashboardData();
        this.renderSummary(data.overview);
        this.renderHeatmap(data.heatmap);
        this.renderDurations(data.durations);
        this.table?.setData(data.sessions);
    }

    renderCurrentSession() {
        if (!this.currentSessionContainer) {
            return;
        }

        const session = this.historyService?.currentSession || null;
        const snapshot = this.app?.getStoredSessionState?.() || null;
        const hasActiveSession = Boolean(session && !session.completedAt);

        if (!hasActiveSession) {
            this.currentSessionContainer.textContent = 'Aucune session en cours. Commence une nouvelle révision pour générer des statistiques.';
            if (this.resumeButton) {
                this.resumeButton.disabled = true;
            }
            return;
        }

        const reviewed = session?.stats?.reviewed ?? snapshot?.cardsSeen?.length ?? 0;
        const remaining = typeof snapshot?.totalDue === 'number'
            ? `${snapshot.totalDue} carte(s) restantes`
            : 'Progression en cours';
        const startedAt = session.startedAt ? new Date(session.startedAt) : null;
        const contextLabel = this.service.describeContext(session.context) || 'Session de révision';

        this.currentSessionContainer.innerHTML = `
            <p><strong>${contextLabel}</strong></p>
            <p>${reviewed} carte(s) vues • ${remaining}</p>
            <p>Commencée ${startedAt ? startedAt.toLocaleString('fr-FR') : 'à une date inconnue'}</p>
        `;

        if (this.resumeButton) {
            const hasSnapshot = Boolean(snapshot);
            this.resumeButton.disabled = !(this.app?.resumeSession && hasSnapshot);
        }
    }

    async resumeActiveSession() {
        if (!this.app?.resumeSession) {
            alert('Impossible de reprendre : application non disponible.');
            return;
        }

        const snapshot = this.app?.getStoredSessionState?.();
        if (!this.historyService?.currentSession || this.historyService.currentSession.completedAt || !snapshot) {
            alert('Aucune session à reprendre.');
            return;
        }

        if (this.resumeButton) {
            this.resumeButton.disabled = true;
        }

        try {
            const resumed = await this.app.resumeSession();
            if (!resumed) {
                alert('Reprise impossible. Vérifie que le fichier CSV est toujours disponible.');
            }
        } catch (error) {
            console.error('StatisticsDashboard: resume failed', error);
            alert('Une erreur est survenue pendant la reprise de session.');
        } finally {
            if (this.resumeButton) {
                this.resumeButton.disabled = false;
            }
        }
    }

    clearSessionFiles() {
        if (!this.historyService?.clearSessions) {
            alert('Impossible d’effacer les sessions : service indisponible.');
            return;
        }

        const confirmed = window.confirm('Supprimer toutes les sessions enregistrées ? Cette action est définitive.');
        if (!confirmed) {
            return;
        }

        this.historyService.clearSessions();
        this.app?.clearSessionSnapshot?.();
        this.refresh();
    }

    /**
     * Render the summary badges.
     *
     * @param {Object} overview - Overview data.
     * @returns {void}
     */
    renderSummary(overview) {
        const list = this.container.querySelector('.statistics-dashboard__summary');
        list.innerHTML = '';

        const badges = [
            {
                label: 'Sessions totales',
                value: overview.sessions,
                tone: 'primary'
            },
            {
                label: 'Révisions totales',
                value: overview.reviews,
                tone: 'success'
            },
            {
                label: 'Précision moyenne',
                value: `${overview.accuracy}%`,
                tone: 'info'
            },
            {
                label: 'Temps total',
                value: overview.duration,
                tone: 'warning'
            }
        ];

        badges.forEach((badge) => {
            const item = document.createElement('article');
            item.className = `progress-badge progress-badge--${badge.tone}`;
            item.setAttribute('role', 'listitem');
            item.innerHTML = `
                <span class="progress-badge__value">${badge.value}</span>
                <span class="progress-badge__label">${badge.label}</span>
            `;
            list.appendChild(item);
        });
    }

    /**
     * Render heatmap tiles based on daily activity data.
     *
     * @param {Array<Object>} heatmap - Collection of day entries.
     * @returns {void}
     */
    renderHeatmap(heatmap) {
        const container = this.container.querySelector('[data-heatmap]');
        container.innerHTML = '';

        if (!heatmap.length) {
            container.textContent = 'Aucune session enregistrée.';
            return;
        }

        const maxSessions = Math.max(...heatmap.map(day => day.sessions));
        heatmap.forEach((day) => {
            const tile = document.createElement('div');
            tile.className = 'statistics-dashboard__tile';
            tile.setAttribute('role', 'listitem');
            tile.setAttribute('aria-label', `${day.label}: ${day.sessions} session(s)`);

            const intensity = maxSessions === 0 ? 0 : day.sessions / maxSessions;
            tile.style.setProperty('--intensity', intensity.toString());
            tile.textContent = day.sessions;
            container.appendChild(tile);
        });
    }

    /**
     * Render the bar chart describing session durations.
     *
     * @param {Object} durations - Duration statistics.
     * @returns {void}
     */
    renderDurations(durations) {
        const container = this.container.querySelector('[data-bars]');
        container.innerHTML = '';

        if (!durations.perSession.length) {
            container.textContent = 'Aucune donnée de durée disponible.';
            return;
        }

        const maxDuration = Math.max(...durations.perSession.map(item => item.durationMinutes));
        durations.perSession.forEach((session) => {
            const bar = document.createElement('div');
            bar.className = 'statistics-dashboard__bar';
            bar.style.setProperty('--bar-scale', (session.durationMinutes / (maxDuration || 1)).toString());
            bar.innerHTML = `
                <span class="statistics-dashboard__bar-label">${session.label}</span>
                <span class="statistics-dashboard__bar-value">${session.duration}</span>
            `;
            container.appendChild(bar);
        });

        const footer = document.createElement('p');
        footer.className = 'statistics-dashboard__bars-footer';
        footer.textContent = `Temps total : ${durations.total} • Moyenne : ${durations.average}`;
        container.appendChild(footer);
    }

    /**
     * Register dashboard specific shortcuts.
     *
     * @returns {void}
     */
    registerShortcuts() {
        if (!this.keyboardManager) {
            return;
        }

        this.keyboardManager.registerShortcut('ctrl+5', () => this.refresh(), {
            description: 'Actualiser le tableau de bord des statistiques'
        });
    }

    /**
     * Utility to debounce functions.
     *
     * @param {Function} fn - Function to debounce.
     * @param {number} wait - Delay in milliseconds.
     * @returns {Function} Debounced function.
     */
    debounce(fn, wait = 300) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    }
}
