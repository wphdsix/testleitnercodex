/**
 * Aggregate statistics based on history sessions stored by the Leitner app.
 */
export class StatisticsService {
    /**
     * @param {Object} options - Service configuration.
     * @param {import('../core/historyService.js').HistoryService} options.historyService - History data provider.
     * @param {Function} [options.nowProvider] - Optional function returning the current timestamp.
     */
    constructor({ historyService, nowProvider } = {}) {
        this.historyService = historyService;
        this.now = typeof nowProvider === 'function' ? nowProvider : () => Date.now();
    }

    /**
     * Retrieve sessions from the underlying history service.
     *
     * @returns {Array<Object>} List of sessions.
     */
    getSessions() {
        if (!this.historyService || typeof this.historyService.getSessions !== 'function') {
            return [];
        }
        return this.historyService.getSessions();
    }

    /**
     * Build a comprehensive dataset for the statistics dashboard.
     *
     * @returns {Object} Dashboard data structure.
     */
    getDashboardData() {
        const sessions = this.getSessions();
        return {
            overview: this.computeOverview(sessions),
            heatmap: this.buildHeatmap(sessions, 30),
            durations: this.computeDurations(sessions),
            sessions: this.formatSessions(sessions)
        };
    }

    /**
     * Compute high-level overview metrics.
     *
     * @param {Array<Object>} sessions - History sessions.
     * @returns {Object} Overview metrics.
     */
    computeOverview(sessions) {
        const totals = sessions.reduce((acc, session) => {
            const stats = session.stats || {};
            const reviewed = stats.reviewed ?? session.events?.length ?? 0;
            const correct = stats.correct ?? 0;
            const incorrect = stats.incorrect ?? 0;
            const duration = this.getSessionDuration(session);

            acc.sessions += 1;
            acc.reviews += reviewed;
            acc.correct += correct;
            acc.incorrect += incorrect;
            acc.durationMs += duration;
            return acc;
        }, {
            sessions: 0,
            reviews: 0,
            correct: 0,
            incorrect: 0,
            durationMs: 0
        });

        const accuracy = totals.reviews === 0
            ? 0
            : Math.round((totals.correct / totals.reviews) * 100);

        return {
            sessions: totals.sessions,
            reviews: totals.reviews,
            accuracy,
            duration: this.formatDuration(totals.durationMs)
        };
    }

    /**
     * Build a daily heatmap for the provided sessions.
     *
     * @param {Array<Object>} sessions - History sessions.
     * @param {number} days - Number of days to include.
     * @returns {Array<Object>} Heatmap data.
     */
    buildHeatmap(sessions, days = 30) {
        const now = this.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const buckets = new Map();

        for (let i = 0; i < days; i += 1) {
            const date = new Date(now - i * dayMs);
            const key = date.toISOString().slice(0, 10);
            buckets.set(key, { date: key, sessions: 0 });
        }

        sessions.forEach((session) => {
            const key = new Date(session.startedAt || session.completedAt || now).toISOString().slice(0, 10);
            if (!buckets.has(key)) {
                buckets.set(key, { date: key, sessions: 0 });
            }
            const bucket = buckets.get(key);
            bucket.sessions += 1;
        });

        return Array.from(buckets.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((bucket) => ({
                ...bucket,
                label: new Date(bucket.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
            }));
    }

    /**
     * Compute per-session durations along with totals and averages.
     *
     * @param {Array<Object>} sessions - History sessions.
     * @returns {Object} Duration statistics.
     */
    computeDurations(sessions) {
        const perSession = sessions.map((session, index) => {
            const durationMs = this.getSessionDuration(session);
            return {
                label: `Session ${index + 1}`,
                duration: this.formatDuration(durationMs),
                durationMinutes: Math.round((durationMs / 60000) * 100) / 100,
                durationMs
            };
        });

        const totalMs = perSession.reduce((acc, session) => acc + session.durationMs, 0);
        const averageMs = perSession.length === 0 ? 0 : totalMs / perSession.length;

        return {
            perSession: perSession.map(({ durationMs, ...rest }) => rest),
            total: this.formatDuration(totalMs),
            average: this.formatDuration(averageMs)
        };
    }

    /**
     * Produce formatted session rows for tabular display.
     *
     * @param {Array<Object>} sessions - History sessions.
     * @returns {Array<Object>} Row data for tables.
     */
    formatSessions(sessions) {
        return sessions.map((session) => {
            const stats = session.stats || {};
            const reviewed = stats.reviewed ?? session.events?.length ?? 0;
            const correct = stats.correct ?? 0;
            const accuracy = reviewed === 0 ? 0 : Math.round((correct / reviewed) * 100);
            const started = session.startedAt ? new Date(session.startedAt) : null;
            const timestamp = session.startedAt || session.completedAt || this.now();
            const context = Object.entries(session.context || {})
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');

            return {
                id: session.id,
                date: started ? started.toLocaleString('fr-FR') : 'Inconnu',
                duration: this.formatDuration(this.getSessionDuration(session)),
                reviews: reviewed,
                accuracy,
                context: context || '—',
                timestamp
            };
        }).sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Compute the duration of a session in milliseconds.
     *
     * @param {Object} session - Session record.
     * @returns {number} Duration in milliseconds.
     */
    getSessionDuration(session) {
        const end = session.completedAt || this.now();
        const start = session.startedAt || end;
        return Math.max(0, end - start);
    }

    /**
     * Format a duration in milliseconds into a human readable string.
     *
     * @param {number} durationMs - Duration in milliseconds.
     * @returns {string} Formatted duration.
     */
    formatDuration(durationMs) {
        const totalSeconds = Math.round(durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const hours = Math.floor(minutes / 60);
        const displayMinutes = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${displayMinutes}m`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    }
}
