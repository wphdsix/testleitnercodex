/**
 * LEITNER SYSTEM - MAIN LOGIC
 * Version: 2.2 (Correctif ARIA & CSV Parser)
 */

// --- CONFIGURATION & CONSTANTES ---
const STORAGE_KEYS = {
    SESSION: 'leitner_active_session',
    HISTORY: 'leitner_session_history',
    CONFIG: 'leitner_config'
};

const APP_STATE = {
    currentDeck: [],
    session: null,
    isResuming: false,
    config: {
        owner: 'leitexper1',
        repo: 'testleitnercodex',
        branch: 'main',
        path: 'docs/'
    }
};

// --- 1. GESTION DE L'UI & ADMIN ---

const UI = {
    init: () => {
        UI.loadConfig();
        UI.setupAdminListeners();
        UI.setupTabListeners();
    },

    loadConfig: () => {
        const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
        if (saved) {
            APP_STATE.config = { ...APP_STATE.config, ...JSON.parse(saved) };
        }
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

        document.getElementById('load-github-csv').addEventListener('click', () => {
            UI.saveConfig();
            location.reload();
        });

        // Guide Débutant / GitHub
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


// --- 2. GESTION DE SESSION ---

const SessionManager = {
    start: (deckName, cards) => {
        const session = {
            id: Date.now(),
            deckName: deckName,
            totalCards: cards.length,
            cardsQueue: cards.map((c) => c.id), // Stocker les IDs seulement pour être sûr
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
            StatsUI.checkForPendingSession();
        }
    },

    recordResult: (isCorrect) => {
        if (!APP_STATE.session) return;
        if (isCorrect) APP_STATE.session.stats.correct++;
        else APP_STATE.session.stats.wrong++;
        APP_STATE.session.currentIndex++;
        SessionManager.save();
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
        StatsUI.checkForPendingSession();
    },

    loadPending: () => {
        const json = localStorage.getItem(STORAGE_KEYS.SESSION);
        return json ? JSON.parse(json) : null;
    },

    discard: () => {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        StatsUI.checkForPendingSession();
    }
};

// --- 3. UI STATISTIQUES ---

const StatsUI = {
    init: () => {
        StatsUI.checkForPendingSession();
        StatsUI.renderHistory();
        
        document.getElementById('btn-resume-session')?.addEventListener('click', () => {
            const pending = SessionManager.loadPending();
            if (pending) {
                alert("Assurez-vous que le fichier CSV correspondant est chargé, puis validez.");
                document.getElementById('tab-review-trigger').click();
                APP_STATE.isResuming = true;
                APP_STATE.session = pending;
                // On attend que l'utilisateur charge le CSV, ou s'il est déjà là :
                if (CoreApp.csvData.length > 0 && CoreApp.csvData.filename === pending.deckName) {
                     CoreApp.startReview();
                }
            }
        });

        document.getElementById('btn-discard-session')?.addEventListener('click', () => {
            if(confirm('Abandonner la session ?')) SessionManager.discard();
        });

        document.getElementById('btn-clear-history')?.addEventListener('click', () => {
            if(confirm('Tout effacer ?')) {
                localStorage.removeItem(STORAGE_KEYS.HISTORY);
                StatsUI.renderHistory();
            }
        });
    },

    checkForPendingSession: () => {
        const pending = SessionManager.loadPending();
        const area = document.getElementById('resume-area');
        if (pending && pending.currentIndex < pending.totalCards) {
            area.classList.remove('hidden');
            document.getElementById('resume-count').textContent = pending.totalCards - pending.currentIndex;
            document.getElementById('resume-deck-name').textContent = "Fichier : " + pending.deckName;
        } else {
            area.classList.add('hidden');
        }
    },

    renderHistory: () => {
        const list = document.getElementById('stats-history-list');
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        if (history.length === 0) {
            list.innerHTML = '<li class="p-4 text-center text-gray-500 italic">Historique vide.</li>';
            document.getElementById('stat-total-reviewed').textContent = '0';
            document.getElementById('stat-success-rate').textContent = '0%';
            return;
        }
        let html = '';
        let totalCards = 0, totalCorrect = 0;
        history.forEach(h => {
            const date = new Date(h.date).toLocaleDateString('fr-FR');
            const [correct, total] = h.score.split('/').map(Number);
            totalCards += total; totalCorrect += correct;
            html += `
            <li class="flex justify-between items-center mb-2 p-3 bg-gray-50 rounded border-l-4 ${h.percent >= 80 ? 'border-green-500' : 'border-yellow-500'}">
                <div><strong class="text-gray-800 text-sm block">${h.deck}</strong><span class="text-xs text-gray-500">${date}</span></div>
                <div class="text-right"><span class="font-bold">${h.percent}%</span></div>
            </li>`;
        });
        list.innerHTML = html;
        document.getElementById('stat-total-reviewed').textContent = totalCards;
        document.getElementById('stat-success-rate').textContent = (totalCards > 0 ? Math.round((totalCorrect/totalCards)*100) : 0) + '%';
        document.getElementById('stat-streak').textContent = history.length;
    }
};

// --- 4. COEUR DE L'APP ---

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
                CoreApp.csvData = CoreApp.parseCSV(text);
                CoreApp.csvData.filename = filename;

                CoreApp.renderBoxes();
                status.textContent = `${CoreApp.csvData.length} cartes chargées.`;
                status.className = "mt-2 w-full text-sm text-green-600";
                
                // Reprise auto si session correspondante
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
        document.getElementById('close-cards-list').addEventListener('click', () => {
            document.getElementById('cards-list-container').classList.add('hidden');
        });
        
        // Gestion générique de la fermeture des modales (CORRECTION ARIA ICI)
        document.querySelectorAll('.modal .close, .flashcard-container, #admin-panel, #github-guide-modal').forEach(el => {
            el.addEventListener('click', (e) => {
                if(e.target === el || e.target.classList.contains('close')) {
                    el.classList.add('hidden');
                    el.setAttribute('aria-hidden', 'true'); // IMPORTANT: Marquer comme caché
                    
                    document.getElementById('flashcard-container').classList.add('hidden');
                    document.getElementById('flashcard-container').setAttribute('aria-hidden', 'true');
                    
                    document.getElementById('admin-panel').classList.add('hidden');
                    document.getElementById('admin-panel').setAttribute('aria-hidden', 'true');
                    
                    document.getElementById('github-guide-modal').classList.add('hidden');
                    document.getElementById('github-guide-modal').setAttribute('aria-hidden', 'true');
                }
            });
        });
    },

    parseCSV: (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return [];

        return lines.slice(1).map((line, index) => {
            // Regex améliorée pour CSV
            const matches = [];
            // Cette regex capture : "valeur entre guillemets" OU valeur sans virgule
            const regex = /(?:^|,)(?:"([^"]*)"|([^",]*))/g;
            let match;
            while ((match = regex.exec(line)) !== null) {
                // match[1] = avec guillemets, match[2] = sans guillemets
                let val = match[1] !== undefined ? match[1] : match[2];
                val = val ? val.trim() : '';
                matches.push(val);
            }
            
            // Sécurité : s'assurer qu'on a les champs minimes
            const question = matches[0] || 'Question vide';
            const qImage = matches[1] || '';
            const answer = matches[2] || 'Réponse vide';
            const aImage = matches[3] || '';
            const box = parseInt(matches[4]) || 1;
            const lastReview = matches[5] || '';

            return { id: index, question, qImage, answer, aImage, box, lastReview };
        });
    },

    renderBoxes: () => {
        const container = document.getElementById('leitner-boxes');
        container.innerHTML = '';
        [1, 2, 3, 4, 5].forEach(num => {
            const count = CoreApp.csvData.filter(c => c.box === num).length;
            const div = document.createElement('div');
            div.className = `bg-white p-4 rounded shadow border-t-4 box-border-${num} hover:shadow-lg transition cursor-pointer`;
            div.innerHTML = `<h3 class="font-bold text-gray-700 text-box${num}">Boîte ${num}</h3><p class="text-2xl font-bold mt-2">${count}</p>`;
            div.addEventListener('click', () => {
                const cards = CoreApp.csvData.filter(c => c.box === num);
                if(cards.length) {
                    SessionManager.start(CoreApp.csvData.filename, cards);
                    CoreApp.startReview();
                } else {
                    alert('Boîte vide.');
                }
            });
            container.appendChild(div);
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
            const el = document.getElementById('flashcard-container');
            el.classList.add('hidden');
            el.setAttribute('aria-hidden', 'true');
            return;
        }
        
        // On récupère l'ID de la carte courante dans la file d'attente
        const cardId = s.cardsQueue[s.currentIndex];
        // On cherche la carte complète dans les données chargées
        const card = CoreApp.csvData.find(c => c.id === cardId);

        if (card) {
            CoreApp.showCardUI(card);
        } else {
            console.error("Carte introuvable pour l'ID:", cardId);
            // Passer à la suivante si erreur
            s.currentIndex++;
            CoreApp.startReview();
        }
    },

    showCardUI: (card) => {
        const container = document.getElementById('flashcard-container');
        // CORRECTION ARIA : On rend le conteneur visible aux lecteurs d'écran AVANT
        container.classList.remove('hidden');
        container.setAttribute('aria-hidden', 'false'); 
        
        document.getElementById('answer-section').classList.add('hidden');
        document.getElementById('show-answer-btn').classList.remove('hidden');

        // Question
        let qHtml = `<p class="text-xl">${card.question || '...'}</p>`;
        const qImgUrl = CoreApp.buildImageUrl(card.qImage, 'q');
        if(qImgUrl) qHtml += `<img src="${qImgUrl}" class="max-w-full h-auto mt-4 rounded shadow-sm mx-auto max-h-60 object-contain" onerror="this.style.display='none'">`;
        document.getElementById('question-content').innerHTML = qHtml;

        // Réponse
        let aHtml = `<p class="text-xl">${card.answer || '...'}</p>`;
        const aImgUrl = CoreApp.buildImageUrl(card.aImage, 'a');
        if(aImgUrl) aHtml += `<img src="${aImgUrl}" class="max-w-full h-auto mt-4 rounded shadow-sm mx-auto max-h-60 object-contain" onerror="this.style.display='none'">`;
        document.getElementById('answer-content').innerHTML = aHtml;
        
        // Donner le focus au bouton de réponse pour la navigation clavier
        setTimeout(() => document.getElementById('show-answer-btn').focus(), 50);
    },

    handleAnswer: (isCorrect) => {
        const s = APP_STATE.session;
        const cardId = s.cardsQueue[s.currentIndex];
        const card = CoreApp.csvData.find(c => c.id === cardId);
        
        if(card) {
            if(isCorrect && card.box < 5) card.box++;
            else if(!isCorrect) card.box = 1;
        }
        
        SessionManager.recordResult(isCorrect);
        CoreApp.startReview();
    }
};

document.addEventListener('DOMContentLoaded', CoreApp.init);