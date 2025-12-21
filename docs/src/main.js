/**
 * LEITNER SYSTEM - MAIN LOGIC
 * Version: 2.1 (Correctif Images & Admin)
 */

// --- CONFIGURATION & CONSTANTES ---
const STORAGE_KEYS = {
    SESSION: 'leitner_active_session',
    HISTORY: 'leitner_session_history',
    CONFIG: 'leitner_config' // Pour stocker user/repo/branch
};

const APP_STATE = {
    currentDeck: [],
    session: null,
    isResuming: false,
    config: {
        owner: 'leitexper1', // Valeur par défaut
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
        // Remplir les champs du panel admin
        document.getElementById('repo-owner').value = APP_STATE.config.owner || '';
        document.getElementById('repo-name').value = APP_STATE.config.repo || '';
        document.getElementById('repo-branch').value = APP_STATE.config.branch || '';
        document.getElementById('repo-path').value = APP_STATE.config.path || '';
    },

    saveConfig: () => {
        const newConfig = {
            owner: document.getElementById('repo-owner').value.trim(),
            repo: document.getElementById('repo-name').value.trim(),
            branch: document.getElementById('repo-branch').value.trim() || 'main',
            path: document.getElementById('repo-path').value.trim() || ''
        };
        APP_STATE.config = newConfig;
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
        alert('Configuration sauvegardée !');
        document.getElementById('admin-panel').classList.add('hidden');
    },

    setupAdminListeners: () => {
        // Ouvrir/Fermer Admin
        document.getElementById('admin-button').addEventListener('click', () => {
            document.getElementById('admin-panel').classList.remove('hidden');
        });
        document.getElementById('close-admin').addEventListener('click', () => {
            document.getElementById('admin-panel').classList.add('hidden');
        });

        // Sauvegarder Config GitHub
        document.getElementById('load-github-csv').addEventListener('click', () => {
            UI.saveConfig();
            location.reload(); // Recharger pour prendre en compte les nouveaux params
        });

        // Guide Débutant / GitHub
        const guideModal = document.getElementById('github-guide-modal');
        const openGuide = () => guideModal.classList.remove('hidden');
        const closeGuide = () => guideModal.classList.add('hidden');

        document.getElementById('beginner-guide-btn')?.addEventListener('click', openGuide);
        document.getElementById('open-github-guide')?.addEventListener('click', openGuide);
        document.getElementById('close-github-guide')?.addEventListener('click', closeGuide);
        
        // Import/Export Bouton
        document.getElementById('open-import-export')?.addEventListener('click', () => {
            if (window.openImportExport) window.openImportExport();
        });
    },

    setupTabListeners: () => {
        document.querySelectorAll('.tab-button').forEach(btn => {
            if(btn.dataset.action === 'open-import-export') return; // Ignorer le bouton spécial
            
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
        // Activer Review par défaut
        const defaultTab = document.getElementById('tab-review-trigger');
        if(defaultTab) defaultTab.click();
    },

    // Appelé par index.html pour remplir le select (Logique de groupement)
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

        for (const [category, items] of Object.entries(groups)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = category.charAt(0).toUpperCase() + category.slice(1);
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.file.download_url || item.file.publicPath;
                option.textContent = item.label;
                option.dataset.name = item.file.name;
                if(options.selectedName === item.file.name) option.selected = true;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }

        if (orphans.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Autres";
            orphans.forEach(item => {
                const option = document.createElement('option');
                option.value = item.file.download_url || item.file.publicPath;
                option.textContent = item.label;
                option.dataset.name = item.file.name;
                if(options.selectedName === item.file.name) option.selected = true;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
    }
};

// Exposer la fonction pour index.html
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
            cardsQueue: cards.map((c, i) => i),
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
                CoreApp.startReview(true);
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
        
        // Listener Selecteur CSV
        const selector = document.getElementById('csv-selector');
        selector.addEventListener('change', async (e) => {
            const url = e.target.value;
            if(!url) return;
            
            // Robustesse : on cherche le nom via dataset ou value
            const selectedOption = e.target.options[e.target.selectedIndex];
            const filename = selectedOption.dataset.name || selectedOption.value || "unknown.csv";

            try {
                const status = document.getElementById('csv-load-status');
                status.classList.remove('hidden');
                status.textContent = "Chargement...";
                
                const response = await fetch(url);
                if(!response.ok) throw new Error("Fichier introuvable");
                
                const text = await response.text();
                CoreApp.csvData = CoreApp.parseCSV(text);
                CoreApp.csvData.filename = filename;

                CoreApp.renderBoxes();
                status.textContent = `${CoreApp.csvData.length} cartes chargées.`;
                status.className = "mt-2 w-full text-sm text-green-600";
            } catch (err) {
                console.error(err);
                const status = document.getElementById('csv-load-status');
                status.textContent = "Erreur de chargement.";
                status.className = "mt-2 w-full text-sm text-red-600";
            }
        });

        // Listeners Cartes
        document.getElementById('show-answer-btn').addEventListener('click', () => {
            document.getElementById('answer-section').classList.remove('hidden');
            document.getElementById('show-answer-btn').classList.add('hidden');
        });
        document.getElementById('right-answer').addEventListener('click', () => CoreApp.handleAnswer(true));
        document.getElementById('wrong-answer').addEventListener('click', () => CoreApp.handleAnswer(false));
        document.getElementById('close-cards-list').addEventListener('click', () => {
            document.getElementById('cards-list-container').classList.add('hidden');
        });
        
        // Modales
        document.querySelectorAll('.modal .close, .flashcard-container, #admin-panel, #github-guide-modal').forEach(el => {
            el.addEventListener('click', (e) => {
                if(e.target === el || e.target.classList.contains('close')) {
                    el.classList.add('hidden');
                    document.getElementById('flashcard-container').classList.add('hidden');
                    document.getElementById('admin-panel').classList.add('hidden');
                    document.getElementById('github-guide-modal').classList.add('hidden');
                }
            });
        });
    },

    parseCSV: (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        return lines.slice(1).map((line, index) => {
            // Regex pour gérer les guillemets CSV correctement
            const values = [];
            let match;
            const regex = /(?:^|,)(?:"([^"]*)"|([^",]*))/g;
            while ((match = regex.exec(line)) !== null) {
                values.push(match[1] ? match[1] : match[2]);
            }
            
            return {
                id: index,
                question: values[0] || '',
                qImage: values[1] || '',
                answer: values[2] || '',
                aImage: values[3] || '',
                box: parseInt(values[4]) || 1,
                lastReview: values[5] || ''
            };
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
                    CoreApp.startReview(true);
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
        
        // Construction URL GitHub
        const c = APP_STATE.config;
        const folder = type === 'q' ? 'images_questions' : 'images_reponses';
        
        // Nettoyage du path config (ex: "docs/" -> "docs")
        const basePath = c.path.endsWith('/') ? c.path.slice(0, -1) : c.path;
        
        return `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/${basePath}/${folder}/${encodeURIComponent(filename)}`;
    },

    startReview: () => {
        if (!APP_STATE.session) return;
        const s = APP_STATE.session;
        if (s.currentIndex >= s.totalCards) {
            alert(`Fin de session ! Score: ${s.stats.correct}/${s.totalCards}`);
            SessionManager.complete();
            document.getElementById('flashcard-container').classList.add('hidden');
            return;
        }
        const card = s.cardsQueue[s.currentIndex];
        CoreApp.showCardUI(card);
    },

    showCardUI: (card) => {
        const container = document.getElementById('flashcard-container');
        container.classList.remove('hidden');
        document.getElementById('answer-section').classList.add('hidden');
        document.getElementById('show-answer-btn').classList.remove('hidden');

        // Question
        let qHtml = `<p class="text-xl">${card.question}</p>`;
        const qImgUrl = CoreApp.buildImageUrl(card.qImage, 'q');
        if(qImgUrl) qHtml += `<img src="${qImgUrl}" class="max-w-full h-auto mt-4 rounded shadow-sm mx-auto max-h-60 object-contain" onerror="this.style.display='none'">`;
        document.getElementById('question-content').innerHTML = qHtml;

        // Réponse
        let aHtml = `<p class="text-xl">${card.answer}</p>`;
        const aImgUrl = CoreApp.buildImageUrl(card.aImage, 'a');
        if(aImgUrl) aHtml += `<img src="${aImgUrl}" class="max-w-full h-auto mt-4 rounded shadow-sm mx-auto max-h-60 object-contain" onerror="this.style.display='none'">`;
        document.getElementById('answer-content').innerHTML = aHtml;
    },

    handleAnswer: (isCorrect) => {
        const s = APP_STATE.session;
        const card = s.cardsQueue[s.currentIndex];
        
        // Mise à jour visuelle uniquement (pas d'écriture CSV)
        if(isCorrect && card.box < 5) card.box++;
        else if(!isCorrect) card.box = 1;
        
        SessionManager.recordResult(isCorrect);
        CoreApp.startReview();
    }
};

document.addEventListener('DOMContentLoaded', CoreApp.init);