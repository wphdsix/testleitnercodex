const HISTORY_STORAGE_KEY = 'leitnerHistorySessions';

export class HistoryService {
    constructor(storageService) {
        this.storage = storageService;
        this.currentSession = null;
    }

    getSessions() {
        return this.storage.getJSON(HISTORY_STORAGE_KEY, []);
    }

    restoreSession() {
        if (this.currentSession) {
            return this.currentSession;
        }

        const sessions = this.getSessions();
        for (let index = sessions.length - 1; index >= 0; index -= 1) {
            const candidate = sessions[index];
            if (candidate && !candidate.completedAt) {
                this.currentSession = candidate;
                this.#emit('leitner:session-restored', candidate);
                this.#emit('leitner:session-started', candidate);
                return candidate;
            }
        }

        return null;
    }

    startSession(context = {}) {
        if (this.currentSession) {
            return this.currentSession;
        }

        const session = {
            id: `session_${Date.now()}`,
            startedAt: Date.now(),
            completedAt: null,
            context,
            stats: {
                reviewed: 0,
                correct: 0,
                incorrect: 0
            },
            events: []
        };

        this.currentSession = session;
        this.#persistSession(session);
        this.#emit('leitner:session-started', session);
        return session;
    }

    recordInteraction(type, context = {}) {
        const timestamp = Date.now();
        const session = {
            id: `interaction_${timestamp}`,
            startedAt: timestamp,
            completedAt: timestamp,
            context: { ...context, type },
            stats: {
                reviewed: 0,
                correct: 0,
                incorrect: 0
            },
            events: []
        };

        this.#persistSession(session);
        this.#emit('leitner:session-recorded', session);
        return session;
    }

    recordReview(event) {
        if (!this.currentSession) {
            this.startSession({ reason: 'implicit' });
        }

        const session = this.currentSession;
        const reviewEvent = {
            ...event,
            timestamp: event.timestamp || Date.now(),
            sessionId: session.id
        };

        session.stats.reviewed += 1;
        if (event.isCorrect) {
            session.stats.correct += 1;
        } else {
            session.stats.incorrect += 1;
        }

        session.events.push(reviewEvent);
        this.#persistSession(session);
        this.#emit('leitner:card-reviewed', reviewEvent);
    }

    endSession(context = {}) {
        if (!this.currentSession) {
            return null;
        }

        const session = this.currentSession;
        session.completedAt = Date.now();
        session.context = { ...session.context, ...context };

        this.#persistSession(session);
        this.#emit('leitner:session-recorded', session);
        this.currentSession = null;
        return session;
    }

    #persistSession(session) {
        const sessions = this.getSessions();
        const index = sessions.findIndex(item => item.id === session.id);
        if (index === -1) {
            sessions.push(session);
        } else {
            sessions[index] = session;
        }
        this.storage.setJSON(HISTORY_STORAGE_KEY, sessions);
    }

    #emit(name, detail) {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        }
    }
}
