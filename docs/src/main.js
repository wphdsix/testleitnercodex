/**
 * LEITNER SYSTEM - MAIN LOGIC
 * Version: 3.5 (Fix Clic Historique + Stats Difficulté)
 */

// --- CONSTANTES ---
const STORAGE_KEYS = {
    SESSION: 'leitner_active_session',
    HISTORY: 'leitner_session_history',
    CONFIG: 'leitner_config',
    CARD_STATE: 'leitner_card_state'
};

const BOX_INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const APP_STATE = {
    currentDeck: [],
    session: null,
    isResuming: false,
    config: { owner: 'leitexper1', repo: 'testleitnercodex', branch: 'main', path: 'docs/' }
};

// --- 1. PERSISTANCE (Ajout de la difficulté) ---

const CardPersistence = {
    getStoredState: (filename) => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_STATE) || '{}')[filename] || {};
        } catch (e) { return {}; }
    },

    updateCard: (filename, cardId, box, lastReview, difficulty) => {
        const allStates = JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_STATE) || '{}');
        if (!allStates[filename]) allStates[filename] = {};
        
        // On sauvegarde tout
        allStates[filename][cardId] = { box, lastReview, difficulty };
        
        localStorage.setItem(STORAGE_KEYS.CARD_STATE, JSON.stringify(allStates));
    },

    applyState: (filename, csvData) => {
        const stored = CardPersistence.getStoredState(filename);
        csvData.forEach(card => {
            const state = stored[card.id];
            if (state) {
                if (typeof state === 'number') card.box = state; // Migration
                else {
                    if (state.box) card.box = state.box;
                    if (state.lastReview) card.lastReview = state.lastReview;
                    if (state.difficulty) card.difficulty = state.difficulty; // Nouveau
                }
            }
        });
        return csvData;
    }
};

// --- 2. UI & ADMIN ---

const UI = {
    init: () => {
        UI.loadConfig();
        UI.setupAdminListeners();
        UI.setupTabListeners();
    },

    loadConfig: () => {
        const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
        if (saved) APP_STATE.config = { ...APP_STATE.config, ...JSON.parse(saved) };
        const safeVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
        safeVal('repo-owner', APP_STATE.config.owner);
        safeVal('repo-name', APP_STATE.config.repo);
        safeVal('repo-branch', APP_STATE.config.branch);
        safeVal('repo-path', APP_STATE.config.path);
    },

    saveConfig: () => {
        const val = (id) => document.getElementById(id).value.trim();
        const newConfig = {
            owner: val('repo-owner'),
            repo: val('repo-name'),
            branch: val('repo-branch') || 'main',
            path: val('repo-path') || ''
        };
        APP_STATE.config = newConfig;
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
        alert('Configuration sauvegardée !');
        document.getElementById('admin-panel').classList.add('hidden');
        document.getElementById('admin-panel').setAttribute('aria-hidden', 'true');
    },

    setupAdminListeners: () => {
        const toggleModal = (id, show) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (show) {
                el.classList.remove('hidden');
                el.setAttribute('aria-hidden', 'false');
            } else {
                el.classList.add('hidden');
                el.setAttribute('aria-hidden', 'true');
            }
        };

        document.getElementById('admin-button').addEventListener('click', () => toggleModal('admin-panel', true));
        document.getElementById('close-admin').addEventListener('click', () => toggleModal('admin-panel', false));
        document.getElementById('load-github-csv').addEventListener('click', () => { UI.saveConfig(); location.reload(); });

        const openGuide = () => toggleModal('github-guide-modal', true);
        const closeGuide = () => toggleModal('github-guide-modal', false);
        document.getElementById('beginner-guide-btn')?.addEventListener('click', openGuide);
        document.getElementById('open-github-guide')?.addEventListener('click', openGuide);
        document.getElementById('close-github-guide')?.addEventListener('click', closeGuide);
        
        document.getElementById('open-import-export')?.addEventListener('click', () => {
            if (window.openImportExport) window.openImportExport();
        });
    },

    setupTabListeners: () => {
        document.querySelectorAll('.tab-button').forEach(btn => {
            if(btn.dataset.action === 'open-import-export') return;
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
                document.querySelectorAll('.tab-button').forEach(b => {
                    b.classList.remove('tab-button-active', 'bg-blue-600', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });
                const targetId = btn.dataset.tabTarget;
                const panel = document.querySelector(`[data-tab-panel="${targetId}"]`);
                if(panel) panel.classList.remove('hidden');
                btn.classList.add('tab-button-active', 'bg-blue-600', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                if (targetId === 'stats') StatsUI.init();
            });
        });
        const defaultTab = document.getElementById('tab-review-trigger');
        if(defaultTab) defaultTab.click();
    },

    populateCSVSelector: function(files, options = {}) {
        const select = document.getElementById('csv-selector');
        if (!select) return;
        select.innerHTML = '<option value="">-- Choisir un paquet --</option>';
        files.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

        const groups = {};
        const orphans = [];

        files.forEach(file => {
            const cleanName = file.name.replace('.csv', '');
            if (cleanName.includes('_')) {
                const parts = cleanName.split('_');
                const category = parts[0];
                const label = parts.slice(1).join(' ');
                if (!groups[category]) groups[category] = [];
                groups[category].push({ file, label });
            } else {
                orphans.push({ file, label: cleanName });
            }
        });

        const addOption = (parent, item) => {
            const option = document.createElement('option');
            option.value = item.file.download_url || item.file.publicPath;
            option.textContent = item.label;
            option.dataset.name = item.file.name;
            if(options.selectedName === item.file.name) option.selected = true;
            parent.appendChild(option);
        };

        for (const [category, items] of Object.entries(groups)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = category.charAt(0).toUpperCase() + category.slice(1);
            items.forEach(item => addOption(optgroup, item));
            select.appendChild(optgroup);
        }
        if (orphans.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Autres";
            orphans.forEach(item => addOption(optgroup, item));
            select.appendChild(optgroup);
        }
    }
};

window.leitnerApp = window.leitnerApp || {};
window.leitnerApp.ui = window.leitnerApp.ui || {};
window.leitnerApp.ui.populateCSVSelector = UI.populateCSVSelector;

// --- 3. GESTION DE SESSION ---

const SessionManager = {
    start: (deckName, cards) => {
        const session = {
            id: Date.now(),
            deckName: deckName,
            totalCards: cards.length,
            cardsQueue: cards.map((c) => c.id),
            currentIndex: 0,
            stats: { correct: 0, wrong: 0, startTime: Date.now() }
        };
        APP_STATE.session = session;
        SessionManager.save();
        return session;
    },

    save: () => {
        if (APP_STATE.session) {
            localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(APP_STATE.session));
            StatsUI.renderHistory();
        }
    },

    recordResult: (isCorrect) => {
        if (!APP_STATE.session) return;
        if (isCorrect) APP_STATE.session.stats.correct++;
        else APP_STATE.session.stats.wrong++;
        APP_STATE.session.currentIndex++;
        SessionManager.save();
    },

    pauseAndExit: () => {
        CoreApp.closeFlashcard();
        alert("Session mise en pause. Retrouvez-la dans l'onglet Statistiques.");
    },

    complete: () => {
        if (!APP_STATE.session) return;
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        const s = APP_STATE.session;
        const entry = {
            date: new Date().toISOString(),
            deck: s.deckName,
            score: `${s.stats.correct}/${s.totalCards}`,
            percent: Math.round((s.stats.correct / s.totalCards) * 100),
            duration: Math.round((Date.now() - s.stats.startTime) / 1000)
        };
        history.unshift(entry);
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        APP_STATE.session = null;
        StatsUI.renderHistory();
    },

    loadPending: () => {
        const json = localStorage.getItem(STORAGE_KEYS.SESSION);
        return json ? JSON.parse(json) : null;
    },

    discard: () => {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        StatsUI.renderHistory();
    }
};

// --- 4. STATISTIQUES ---

const StatsUI = {
    init: () => {
        StatsUI.renderHistory();
        StatsUI.renderDifficultyStats();
        
        document.getElementById('btn-clear-history')?.addEventListener('click', () => {
            if(confirm('Tout effacer ?')) {
                localStorage.removeItem(STORAGE_KEYS.HISTORY);
                StatsUI.renderHistory();
            }
        });
        
        // FIX CLIC HISTORIQUE : Utilisation de l'Event Delegation sur la liste
        const historyList = document.getElementById('stats-history-list');
        if (historyList) {
            historyList.addEventListener('click', (e) => {
                const li = e.target.closest('li');
                if (!li) return;

                // Mode reprise
                if (li.dataset.action === 'resume') {
                    StatsUI.resumePending();
                } 
                // Mode info (historique terminé)
                else if (li.dataset.action === 'info') {
                    alert(li.dataset.info || 'Session terminée');
                }
            });
        }
        
        const oldResume = document.getElementById('resume-area');
        if(oldResume) oldResume.classList.add('hidden');
    },

    // NOUVEAU : Calcul des statistiques de difficulté
    renderDifficultyStats: () => {
        if (!CoreApp.csvData || CoreApp.csvData.length === 0) {
            // Reset à 0 si rien n'est chargé
            ['easy', 'normal', 'hard'].forEach(diff => {
                document.getElementById(`stat-count-${diff}`).textContent = '0';
            });
            return;
        }

        let counts = { easy: 0, normal: 0, hard: 0 };
        
        CoreApp.csvData.forEach(card => {
            const diff = card.difficulty || 'normal';
            if (counts[diff] !== undefined) counts[diff]++;
            else counts['normal']++; // fallback
        });

        document.getElementById('stat-count-easy').textContent = counts.easy;
        document.getElementById('stat-count-normal').textContent = counts.normal;
        document.getElementById('stat-count-hard').textContent = counts.hard;
    },

    renderHistory: () => {
        const list = document.getElementById('stats-history-list');
        if(!list) return;

        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        const pending = SessionManager.loadPending();
        
        let html = '';
        
        if (pending && pending.currentIndex < pending.totalCards) {
            const dateObj = new Date(pending.stats.startTime);
            const dateStr = dateObj.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'});
            const remaining = pending.totalCards - pending.currentIndex;
            
            // Note: Ajout de data-action="resume" pour le clic
            html += `
            <li data-action="resume" class="cursor-pointer hover:bg-blue-100 transition p-3 bg-blue-50 rounded border-l-4 border-blue-600 mb-2 shadow-sm">
                <div class="flex justify-between items-center">
                    <div>
                        <strong class="text-blue-900 text-sm block">▶️ ${pending.deckName} (En cours)</strong>
                        <span class="text-xs text-blue-700">${dateStr}</span>
                    </div>
                    <div class="text-right">
                        <span class="block font-bold text-blue-800">${remaining} à voir</span>
                        <span class="text-xs text-blue-600">sur ${pending.totalCards}</span>
                    </div>
                </div>
            </li>`;
        }

        if (history.length === 0 && !pending) {
            list.innerHTML = '<li class="p-4 text-center text-gray-500 italic">Aucune session.</li>';
            return;
        }

        let totalCards = 0;
        let totalCorrect = 0;

        history.forEach((h) => {
            const dateObj = new Date(h.date);
            const dateStr = dateObj.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'});
            const [correct, total] = h.score.split('/').map(Number);
            totalCards += total;
            totalCorrect += correct;

            const borderClass = h.percent >= 80 ? 'border-green-500' : (h.percent >= 50 ? 'border-yellow-500' : 'border-red-400');
            const scoreColor = h.percent >= 80 ? 'text-green-700' : 'text-yellow-700';

            // Note: Ajout de data-action="info"
            html += `
            <li data-action="info" data-info="Session terminée le ${dateStr}. Score : ${h.score}" class="cursor-pointer hover:bg-gray-100 transition p-3 bg-white rounded border-l-4 ${borderClass} mb-2 shadow-sm">
                <div class="flex justify-between items-center">
                    <div>
                        <strong class="text-gray-800 text-sm block">${h.deck}</strong>
                        <span class="text-xs text-gray-500">${dateStr}</span>
                    </div>
                    <div class="text-right">
                        <span class="block font-bold ${scoreColor}">Terminé</span>
                        <span class="text-xs text-gray-400">Score: ${h.score}</span>
                    </div>
                </div>
            </li>`;
        });

        list.innerHTML = html;

        document.getElementById('stat-total-reviewed').textContent = totalCards;
        const globalRate = totalCards > 0 ? Math.round((totalCorrect / totalCards) * 100) : 0;
        document.getElementById('stat-success-rate').textContent = globalRate + '%';
        document.getElementById('stat-streak').textContent = history.length;
    },

    resumePending: () => {
        const pending = SessionManager.loadPending();
        if (pending) {
            // Vérification si le bon CSV est chargé
            if(CoreApp.csvData.length === 0 || CoreApp.csvData.filename !== pending.deckName) {
                if(confirm(`Le fichier "${pending.deckName}" doit être chargé. Aller à l'onglet Révision ?`)) {
                    document.getElementById('tab-review-trigger').click();
                }
            } else {
                document.getElementById('tab-review-trigger').click();
                APP_STATE.isResuming = true;
                APP_STATE.session = pending;
                // IMPORTANT : Forcer l'affichage de la carte
                CoreApp.startReview();
            }
        }
    }
};

// --- 5. COEUR DE L'APPLICATION ---

const CoreApp = {
    csvData: [],

    init: () => {
        UI.init();
        
        const selector = document.getElementById('csv-selector');
        selector.addEventListener('change', async (e) => {
            const url = e.target.value;
            if(!url) return;
            const selectedOption = e.target.options[e.target.selectedIndex];
            const filename = selectedOption.dataset.name || selectedOption.value || "unknown.csv";

            try {
                const status = document.getElementById('csv-load-status');
                status.classList.remove('hidden');
                status.textContent = "Chargement...";
                status.className = "mt-2 w-full text-sm text-blue-600";
                
                const response = await fetch(url);
                if(!response.ok) throw new Error("Fichier introuvable");
                
                const text = await response.text();
                let data = CoreApp.parseCSV(text);
                data = CardPersistence.applyState(filename, data);
                
                CoreApp.csvData = data;
                CoreApp.csvData.filename = filename;

                CoreApp.renderBoxes();
                CoreApp.renderDeckOverview(); 
                
                // Mise à jour des stats de difficulté dès le chargement
                StatsUI.renderDifficultyStats();

                status.textContent = `${CoreApp.csvData.length} cartes chargées.`;
                status.className = "mt-2 w-full text-sm text-green-600";
                
                StatsUI.renderHistory();

                if (APP_STATE.isResuming && APP_STATE.session && APP_STATE.session.deckName === filename) {
                    CoreApp.startReview();
                }

            } catch (err) {
                console.error(err);
                const status = document.getElementById('csv-load-status');
                status.textContent = "Erreur de chargement.";
                status.className = "mt-2 w-full text-sm text-red-600";
            }
        });

        document.getElementById('show-answer-btn').addEventListener('click', () => {
            document.getElementById('answer-section').classList.remove('hidden');
            document.getElementById('show-answer-btn').classList.add('hidden');
        });
        document.getElementById('right-answer').addEventListener('click', () => CoreApp.handleAnswer(true));
        document.getElementById('wrong-answer').addEventListener('click', () => CoreApp.handleAnswer(false));
        
        document.querySelectorAll('.modal .close, .flashcard-container, #admin-panel, #github-guide-modal').forEach(el => {
            el.addEventListener('click', (e) => {
                if(e.target === el || e.target.classList.contains('close')) {
                    if(el.id === 'flashcard-container' || el.classList.contains('flashcard-container')) {
                        CoreApp.closeFlashcard();
                    } else {
                        el.classList.add('hidden');
                        el.setAttribute('aria-hidden', 'true');
                    }
                }
            });
        });
    },

    closeFlashcard: () => {
        const el = document.getElementById('flashcard-container');
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
        CoreApp.renderBoxes();
        CoreApp.renderDeckOverview();
        StatsUI.renderDifficultyStats(); // Rafraîchir les stats
    },

    parseCSV: (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return [];
        return lines.slice(1).map((line, index) => {
            const matches = [];
            const regex = /(?:^|,)(?:"([^"]*)"|([^",]*))/g;
            let match;
            while ((match = regex.exec(line)) !== null) {
                let val = match[1] !== undefined ? match[1] : match[2];
                val = val ? val.trim() : '';
                matches.push(val);
            }
            return {
                id: index,
                question: matches[0] || 'Question vide',
                qImage: matches[1] || '',
                answer: matches[2] || 'Réponse vide',
                aImage: matches[3] || '',
                box: parseInt(matches[4]) || 1, 
                lastReview: matches[5] || ''
            };
        });
    },

    getNextReviewDateForBox: (boxNum, cards) => {
        const now = new Date();
        let earliestDate = null;
        let pendingCount = 0;
        const intervalDays = BOX_INTERVALS[boxNum] || 1;

        cards.forEach(card => {
            if (!card.lastReview) {
                pendingCount++;
            } else {
                const last = new Date(card.lastReview);
                if (!isNaN(last.getTime())) {
                    const next = new Date(last);
                    next.setDate(last.getDate() + intervalDays);
                    if (next <= now) pendingCount++;
                    else {
                        if (!earliestDate || next < earliestDate) earliestDate = next;
                    }
                } else pendingCount++;
            }
        });

        if (pendingCount > 0) return { text: "Maintenant", count: pendingCount, urgent: true };
        if (earliestDate) {
            const dateStr = earliestDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
            const timeStr = earliestDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            return { text: `${dateStr} à ${timeStr}`, count: 0, urgent: false };
        }
        return { text: "Aucune", count: 0, urgent: false };
    },

    renderBoxes: () => {
        const container = document.getElementById('leitner-boxes');
        if(!container) return;
        container.innerHTML = '';
        [1, 2, 3, 4, 5].forEach(num => {
            const cards = CoreApp.csvData.filter(c => c.box === num);
            const count = cards.length;
            const reviewInfo = CoreApp.getNextReviewDateForBox(num, cards);
            const reviewHtml = reviewInfo.urgent 
                ? `<span class="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">À réviser (${reviewInfo.count})</span>`
                : `<span class="text-xs text-gray-500">Prochaine : ${reviewInfo.text}</span>`;

            const div = document.createElement('div');
            div.className = `bg-white p-4 rounded shadow border-t-4 box-border-${num} hover:shadow-lg transition cursor-pointer flex flex-col justify-between`;
            div.innerHTML = `
                <div>
                    <h3 class="font-bold text-gray-700 text-box${num}">Boîte ${num}</h3>
                    <p class="text-3xl font-bold mt-2 text-gray-800 transition-all duration-300" id="box-count-${num}">${count}</p>
                    <p class="text-xs text-gray-500 uppercase tracking-wide mb-3">cartes</p>
                </div>
                <div class="mt-2 border-t pt-2">${reviewHtml}</div>
            `;
            div.addEventListener('click', () => {
                if(cards.length) {
                    SessionManager.start(CoreApp.csvData.filename, cards);
                    CoreApp.startReview();
                } else alert('Boîte vide.');
            });
            container.appendChild(div);
        });
    },

    renderDeckOverview: () => {
        const container = document.getElementById('deck-overview-container');
        if(!container) return;
        
        container.innerHTML = ''; 
        
        [1, 2, 3, 4, 5].forEach(boxNum => {
            const cards = CoreApp.csvData.filter(c => c.box === boxNum);
            
            if (cards.length > 0) {
                const section = document.createElement('div');
                section.className = 'bg-white rounded-lg shadow-md p-5';
                
                const title = document.createElement('h3');
                title.className = `text-xl font-bold mb-4 text-box${boxNum} border-b pb-2`;
                title.textContent = `Boîte ${boxNum} (${cards.length} cartes)`;
                section.appendChild(title);
                
                const grid = document.createElement('div');
                grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
                
                cards.forEach(card => {
                    const cardEl = document.createElement('div');
                    cardEl.className = 'border rounded p-3 hover:bg-gray-50 text-sm flex gap-3';
                    
                    let imgHtml = '';
                    const imgUrl = CoreApp.buildImageUrl(card.qImage, 'q');
                    if (imgUrl) {
                        imgHtml = `<div class="w-12 h-12 flex-shrink-0 bg-gray-200 rounded overflow-hidden"><img src="${imgUrl}" class="w-full h-full object-cover" onerror="this.style.display='none'"></div>`;
                    }
                    
                    let dateInfo = '';
                    if(card.lastReview) {
                        const d = new Date(card.lastReview);
                        dateInfo = `<span class="text-xs text-gray-400 block mt-1">Vu : ${d.toLocaleDateString()} ${d.toLocaleTimeString()}</span>`;
                    }

                    // Badge difficulté
                    let diffBadge = '';
                    if (card.difficulty) {
                        const colors = { easy: 'text-green-600', normal: 'text-blue-600', hard: 'text-red-600' };
                        const labels = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };
                        diffBadge = `<span class="text-xs ${colors[card.difficulty] || 'text-gray-500'} font-bold ml-2">(${labels[card.difficulty] || ''})</span>`;
                    }

                    cardEl.innerHTML = `${imgHtml}<div class="flex-1 min-w-0"><p class="font-semibold text-gray-800 truncate" title="${card.question}">${card.question}</p><p class="text-gray-500 truncate" title="${card.answer}">${card.answer}</p>${dateInfo} ${diffBadge}</div>`;
                    grid.appendChild(cardEl);
                });
                
                section.appendChild(grid);
                container.appendChild(section);
            }
        });
    },

    buildImageUrl: (filename, type) => {
        if (!filename) return null;
        if (filename.startsWith('http')) return filename;
        const c = APP_STATE.config;
        const folder = type === 'q' ? 'images_questions' : 'images_reponses';
        const basePath = c.path.endsWith('/') ? c.path.slice(0, -1) : c.path;
        return `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/${basePath}/${folder}/${encodeURIComponent(filename)}`;
    },

    startReview: () => {
        if (!APP_STATE.session) return;
        const s = APP_STATE.session;
        if (s.currentIndex >= s.totalCards) {
            alert(`Fin de session ! Score: ${s.stats.correct}/${s.totalCards}`);
            SessionManager.complete();
            CoreApp.closeFlashcard();
            return;
        }
        const cardId = s.cardsQueue[s.currentIndex];
        const card = CoreApp.csvData.find(c => c.id === cardId);
        if (card) CoreApp.showCardUI(card);
        else {
            s.currentIndex++;
            CoreApp.startReview();
        }
    },

    showCardUI: (card) => {
        const container = document.getElementById('flashcard-container');
        container.classList.remove('hidden');
        container.setAttribute('aria-hidden', 'false'); 
        
        document.getElementById('answer-section').classList.add('hidden');
        document.getElementById('show-answer-btn').classList.remove('hidden');

        // Reset radio button to default 'normal'
        const normalRadio = document.getElementById('difficulty-normal');
        if(normalRadio) normalRadio.checked = true;

        const qSection = document.querySelector('.question-section');
        const oldQuit = document.getElementById('temp-quit-btn');
        if(oldQuit) oldQuit.remove();

        const quitBtn = document.createElement('button');
        quitBtn.id = 'temp-quit-btn';
        quitBtn.textContent = "⏹ Quitter & Sauvegarder";
        quitBtn.className = "mb-4 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded w-full md:w-auto";
        quitBtn.onclick = SessionManager.pauseAndExit;
        qSection.parentNode.insertBefore(quitBtn, qSection);

        let qHtml = `<p class="text-xl">${card.question || '...'}</p>`;
        const qImgUrl = CoreApp.buildImageUrl(card.qImage, 'q');
        if(qImgUrl) qHtml += `<img src="${qImgUrl}" class="max-w-full h-auto mt-4 rounded shadow-sm mx-auto max-h-60 object-contain" onerror="this.style.display='none'">`;
        document.getElementById('question-content').innerHTML = qHtml;

        let aHtml = `<p class="text-xl">${card.answer || '...'}</p>`;
        const aImgUrl = CoreApp.buildImageUrl(card.aImage, 'a');
        if(aImgUrl) aHtml += `<img src="${aImgUrl}" class="max-w-full h-auto mt-4 rounded shadow-sm mx-auto max-h-60 object-contain" onerror="this.style.display='none'">`;
        document.getElementById('answer-content').innerHTML = aHtml;
        
        setTimeout(() => document.getElementById('show-answer-btn').focus(), 50);
    },

    handleAnswer: (isCorrect) => {
        const s = APP_STATE.session;
        const cardId = s.cardsQueue[s.currentIndex];
        const card = CoreApp.csvData.find(c => c.id === cardId);
        
        if(card) {
            const oldBox = parseInt(card.box) || 1;
            let newBox = oldBox;
            if(isCorrect) {
                if(newBox < 5) newBox++;
            } else {
                newBox = 1;
            }

            // Récupération de la difficulté choisie
            const difficultyInput = document.querySelector('input[name="difficulty"]:checked');
            const difficulty = difficultyInput ? difficultyInput.value : 'normal';

            card.box = newBox;
            card.lastReview = new Date().toISOString(); 
            card.difficulty = difficulty;

            // Sauvegarde complète (Box, Date, Difficulté)
            CardPersistence.updateCard(CoreApp.csvData.filename, cardId, newBox, card.lastReview, difficulty);
            
            const feedback = document.createElement('div');
            feedback.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-xl font-bold text-white shadow-2xl z-[100] text-xl flex flex-col items-center gap-2 animate-bounce ${isCorrect ? 'bg-green-600' : 'bg-red-500'}`;
            
            let message = '';
            if(!isCorrect) message = "👎 Retour Boîte 1";
            else if(oldBox === 5) message = "🎉 Maîtrise Max !";
            else message = `👍 Boîte ${oldBox} ➔ Boîte ${newBox}`;
            
            feedback.innerHTML = `<span>${message}</span>`;
            document.body.appendChild(feedback);
            
            setTimeout(() => {
                feedback.style.opacity = '0';
                setTimeout(() => feedback.remove(), 300);
            }, 800);

            CoreApp.renderBoxes();
        }
        
        SessionManager.recordResult(isCorrect);
        CoreApp.startReview();
    }
};

document.addEventListener('DOMContentLoaded', CoreApp.init);