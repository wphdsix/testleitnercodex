const HOURS_TO_MS = 3600 * 1000;

export class LeitnerEngine {
    static DEFAULT_CURVE = [1, 3, 9, 27, 81];

    static DEFAULT_DIFFICULTIES = {
        easy: 0.8,
        normal: 1,
        hard: 1.4
    };

    static getIntervalForBox(box, curve = LeitnerEngine.DEFAULT_CURVE) {
        const index = Math.max(0, Math.min(curve.length - 1, (parseInt(box, 10) || 1) - 1));
        return Number(curve[index]) || curve[curve.length - 1] || 1;
    }

    static getDifficultyMultiplier(key, difficulties = LeitnerEngine.DEFAULT_DIFFICULTIES) {
        if (!key) {
            return 1;
        }
        const normalizedKey = key.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(difficulties, normalizedKey)) {
            const multiplier = Number(difficulties[normalizedKey]);
            return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
        }
        return 1;
    }

    static computeCardNextReview(card, curve, difficulties, now = Date.now()) {
        if (!card) {
            return now;
        }

        const effectiveCurve = curve || LeitnerEngine.DEFAULT_CURVE;
        const effectiveDifficulties = difficulties || LeitnerEngine.DEFAULT_DIFFICULTIES;

        if (card.nextReview && Number.isFinite(Number(card.nextReview))) {
            return Number(card.nextReview);
        }

        const lastReview = LeitnerEngine.resolveLastReview(card, now);
        const difficultyKey = card.difficulty || card.difficultyKey;
        const multiplier = LeitnerEngine.getDifficultyMultiplier(difficultyKey, effectiveDifficulties);
        const intervalHours = LeitnerEngine.getIntervalForBox(card.box, effectiveCurve) * multiplier;
        return lastReview + intervalHours * HOURS_TO_MS;
    }

    static evaluateAnswer(card, { isCorrect, difficulty, curve, difficulties, now = Date.now() }) {
        const effectiveCurve = curve || LeitnerEngine.DEFAULT_CURVE;
        const effectiveDifficulties = difficulties || LeitnerEngine.DEFAULT_DIFFICULTIES;

        const currentBox = parseInt(card.box, 10) || 1;
        const nextBox = isCorrect
            ? Math.min(currentBox + 1, effectiveCurve.length)
            : 1;

        const nextDifficulty = difficulty || card.difficulty || card.difficultyKey;
        const multiplier = LeitnerEngine.getDifficultyMultiplier(nextDifficulty, effectiveDifficulties);
        const intervalHours = LeitnerEngine.getIntervalForBox(nextBox, effectiveCurve) * multiplier;

        const scheduledAt = now + intervalHours * HOURS_TO_MS;

        return {
            ...card,
            box: nextBox,
            lastReview: now,
            difficulty: nextDifficulty || card.difficulty || 'normal',
            nextReview: scheduledAt
        };
    }

    static summariseBoxes(cards, curve, difficulties, now = Date.now()) {
        const effectiveCurve = curve || LeitnerEngine.DEFAULT_CURVE;
        const summaries = [];

        for (let index = 0; index < effectiveCurve.length; index++) {
            const boxNumber = index + 1;
            const cardsInBox = (cards || []).filter(card => (parseInt(card.box, 10) || 1) === boxNumber);

            const nextReview = cardsInBox.length > 0
                ? Math.min(
                    ...cardsInBox.map(card =>
                        LeitnerEngine.computeCardNextReview(card, effectiveCurve, difficulties, now)
                    )
                )
                : null;

            summaries.push({
                box: boxNumber,
                count: cardsInBox.length,
                nextReview: Number.isFinite(nextReview) ? nextReview : null
            });
        }

        return summaries;
    }

    static normaliseCard(card, { curve, difficulties, defaultDifficulty = 'normal', now = Date.now() } = {}) {
        const effectiveCurve = curve || LeitnerEngine.DEFAULT_CURVE;
        const effectiveDifficulties = difficulties || LeitnerEngine.DEFAULT_DIFFICULTIES;

        const normalisedBox = Math.max(1, Math.min(effectiveCurve.length, parseInt(card.box, 10) || 1));
        const lastReview = LeitnerEngine.resolveLastReview(card, now);
        const difficulty = (card.difficulty || card.difficultyKey || defaultDifficulty || 'normal').toLowerCase();

        const baseCard = {
            ...card,
            box: normalisedBox,
            lastReview,
            difficulty
        };

        const nextReview = card.nextReview && Number.isFinite(Number(card.nextReview))
            ? Number(card.nextReview)
            : LeitnerEngine.computeCardNextReview(baseCard, effectiveCurve, effectiveDifficulties, now);

        return {
            ...baseCard,
            nextReview
        };
    }

    static resolveLastReview(card, fallback) {
        if (!card) {
            return fallback;
        }

        if (typeof card.lastReview === 'number') {
            return card.lastReview;
        }

        if (card.lastReview instanceof Date) {
            return card.lastReview.getTime();
        }

        const parsed = Date.parse(card.lastReview);
        if (Number.isFinite(parsed)) {
            return parsed;
        }

        return fallback;
    }
}
