/**
 * LEITNER SYSTEM - MAIN LOGIC
 * Version: 2.0 (Avec gestion de session et groupement CSV)
 */

// --- CONFIGURATION & CONSTANTES ---
const STORAGE_KEYS = {
    SESSION: 'leitner_active_session', // Sauvegarde la session en cours
    HISTORY: 'leitner_session_history', // Sauvegarde l'historique
    CONFIG: 'leitner_config'
};

const APP_STATE = {
    currentDeck: [],     // Les cartes chargées depuis le CSV
    session: null,       // L'état de la session active (index, scores...)
    isResuming: false    // Indicateur si on reprend une session
};

// --- 1. GESTION DES CSV (SCALABILITÉ) ---

// Cette fonction est appelée par votre index.html pour remplir le select
window.leitnerApp = window.leitnerApp || {};
window.leitnerApp.ui = window.leitnerApp.ui || {};

window.leitnerApp.ui.populateCSVSelector = function(files, options = {}) {
    const select = document.getElementById('csv-selector');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choisir un paquet de cartes --</option>';

    // 1. Trier alphabétiquement
    files.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    // 2. Regrouper par préfixe (ex: "Histoire_Rome.csv" -> Groupe "Histoire")
    const groups = {};
    const orphans = [];

    files.forEach(file => {
        const cleanName = file.name.replace('.csv', '');
        if (cleanName.includes('_')) {
            const parts = cleanName.split('_');
            const category = parts[0]; // "Histoire"
            const label = parts.slice(1).join(' '); // "Rome"
            
            if (!groups[category]) groups[category] = [];
            groups[category].push({ file, label });
        } else {
            orphans.push({ file, label: cleanName });
        }
    });

    // 3. Afficher les groupes
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

    // 4. Afficher les orphelins (fichiers sans underscore)
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
};

// --- 2. GESTIONNAIRE DE SESSION (STATISTIQUES & REPRISE) ---

const SessionManager = {
    // Démarre une nouvelle session
    start: (deckName, cards) => {
        const session = {
            id: Date.now(),
            deckName: deckName,
            totalCards: cards.length,
            cardsQueue: cards.map((c, i) => i), // Stocke les index des cartes à voir
            currentIndex: 0,
            stats: { correct: 0, wrong: 0, startTime: Date.now() }
        };
        APP_STATE.session = session;
        SessionManager.save();
        return session;
    },

    // Sauvegarde l'état actuel dans le navigateur
    save: () => {
        if (APP_STATE.session) {
            localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(APP_STATE.session));
            StatsUI.checkForPendingSession(); // Mettre à jour l'UI stats
        }
    },

    // Enregistre une réponse (Vrai/Faux)
    recordResult: (isCorrect) => {
        if (!APP_STATE.session) return;
        
        if (isCorrect) APP_STATE.session.stats.correct++;
        else APP_STATE.session.stats.wrong++;

        APP_STATE.session.currentIndex++;
        SessionManager.save();
    },

    // Termine la session et archive dans l'historique
    complete: () => {
        if (!APP_STATE.session) return;
        
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        const s = APP_STATE.session;
        
        const entry = {
            date: new Date().toISOString(),
            deck: s.deckName,
            score: `${s.stats.correct}/${s.totalCards}`,
            percent: Math.round((s.stats.correct / s.totalCards) * 100),
            duration: Math.round((Date.now() - s.stats.startTime) / 1000) // en secondes
        };

        history.unshift(entry); // Ajouter au début
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
        
        // Nettoyer la session active
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        APP_STATE.session = null;
        
        StatsUI.renderHistory();
        StatsUI.checkForPendingSession();
    },

    // Charge une session existante
    loadPending: () => {
        const json = localStorage.getItem(STORAGE_KEYS.SESSION);
        return json ? JSON.parse(json) : null;
    },

    // Supprime la session en cours
    discard: () => {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        StatsUI.checkForPendingSession();
    }
};

// --- 3. UI DES STATISTIQUES ---

const StatsUI = {
    init: () => {
        StatsUI.checkForPendingSession();
        StatsUI.renderHistory();
        
        // Écouteurs d'événements
        document.getElementById('btn-resume-session')?.addEventListener('click', () => {
            const pending = SessionManager.loadPending();
            if (pending) {
                // Pour reprendre, il faut recharger le fichier CSV associé
                // Note: C'est une simplification. Idéalement on stockerait les données des cartes aussi,
                // mais pour l'instant on demande à l'utilisateur de resélectionner le fichier si nécessaire
                // ou on tente de le recharger auto.
                alert("Pour reprendre, veuillez vous assurer que le bon fichier CSV est chargé dans l'onglet 'Révision' puis cliquez sur ce bouton.");
                // Bascule vers l'onglet révision
                document.getElementById('tab-review-trigger').click();
                // La logique de reprise réelle est gérée par le flux de jeu
                APP_STATE.isResuming = true;
                APP_STATE.session = pending;
                CoreApp.startReview(true); // true = mode reprise
            }
        });

        document.getElementById('btn-discard-session')?.addEventListener('click', () => {
            if(confirm('Êtes-vous sûr de vouloir abandonner cette session ?')) {
                SessionManager.discard();
            }
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
            const remaining = pending.totalCards - pending.currentIndex;
            document.getElementById('resume-count').textContent = remaining;
            document.getElementById('resume-deck-name').textContent = "Fichier : " + pending.deckName;
        } else {
            area.classList.add('hidden');
        }
    },

    renderHistory: () => {
        const list = document.getElementById('stats-history-list');
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
        
        if (history.length === 0) {
            list.innerHTML = '<li class="p-4 text-center text-gray-500 italic">Aucune session terminée.</li>';
            // Reset badges
            document.getElementById('stat-total-reviewed').textContent = '0';
            document.getElementById('stat-success-rate').textContent = '0%';
            return;
        }

        let html = '';
        let totalCards = 0;
        let totalCorrect = 0;
        let totalSessions = history.length;

        history.forEach(h => {
            const date = new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' });
            // Extraction des scores pour les badges globaux
            const [correct, total] = h.score.split('/').map(Number);
            totalCards += total;
            totalCorrect += correct;

            html += `
            <li class="stats-history__item flex justify-between items-center mb-2 p-3 bg-gray-50 rounded border-l-4 ${h.percent >= 80 ? 'border-green-500' : 'border-yellow-500'}">
                <div>
                    <strong class="text-gray-800 text-sm block">${h.deck}</strong>
                    <span class="text-xs text-gray-500">${date} - Durée: ${Math.floor(h.duration/60)}m ${h.duration%60}s</span>
                </div>
                <div class="text-right">
                    <span class="block font-bold ${h.percent >= 80 ? 'text-green-600' : 'text-yellow-600'}">${h.percent}%</span>
                    <span class="text-xs text-gray-400">${h.score}</span>
                </div>
            </li>`;
        });

        list.innerHTML = html;

        // Mise à jour des badges
        document.getElementById('stat-total-reviewed').textContent = totalCards;
        const globalRate = totalCards > 0 ? Math.round((totalCorrect / totalCards) * 100) : 0;
        document.getElementById('stat-success-rate').textContent = globalRate + '%';
        document.getElementById('stat-streak').textContent = totalSessions;
    }
};

// --- 4. CŒUR DE L'APPLICATION (LECTURE & AFFICHAGE) ---

const CoreApp = {
    csvData: [],
    
    init: () => {
        // Gestion des onglets
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Masquer tous les panels
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
                document.querySelectorAll('.tab-button').forEach(b => {
                    b.classList.remove('tab-button-active', 'bg-blue-600', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });
                
                // Activer le courant
                const targetId = btn.dataset.tabTarget;
                const panel = document.querySelector(`[data-tab-panel="${targetId}"]`);
                if(panel) panel.classList.remove('hidden');
                
                btn.classList.add('tab-button-active', 'bg-blue-600', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-700');

                // Rafraîchir les stats si on ouvre l'onglet stats
                if (targetId === 'stats') {
                    StatsUI.init();
                }
            });
        });

        // Activer l'onglet par défaut (Review)
        document.getElementById('tab-review-trigger').click();

        // Gestion du chargement CSV
        const selector = document.getElementById('csv-selector');
        selector.addEventListener('change', async (e) => {
            const url = e.target.value;
            if(!url) return;
            
            const selectedOption = e.target.options[e.target.selectedIndex];
            const filename = selectedOption.dataset.name || "unknown.csv";

            try {
                document.getElementById('csv-load-status').classList.remove('hidden');
                document.getElementById('csv-load-status').textContent = "Chargement...";
                
                const response = await fetch(url);
                const text = await response.text();
                CoreApp.csvData = CoreApp.parseCSV(text);
                
                // On attache le nom du fichier aux données pour la session
                CoreApp.csvData.filename = filename;

                CoreApp.renderBoxes();
                document.getElementById('csv-load-status').textContent = "Chargé : " + CoreApp.csvData.length + " cartes";
                
                // Si une session est active pour ce fichier, proposer de la continuer
                const pending = SessionManager.loadPending();
                if(pending && pending.deckName === filename) {
                    APP_STATE.session = pending;
                    if(confirm("Une session est déjà en cours pour ce fichier. Voulez-vous la reprendre ?")) {
                        CoreApp.startReview(true);
                    }
                }
            } catch (err) {
                console.error(err);
                document.getElementById('csv-load-status').textContent = "Erreur de chargement";
                document.getElementById('csv-load-status').classList.add('text-red-600');
            }
        });

        // Boutons de réponse Flashcard
        document.getElementById('show-answer-btn').addEventListener('click', () => {
            document.getElementById('answer-section').classList.remove('hidden');
            document.getElementById('show-answer-btn').classList.add('hidden');
        });

        document.getElementById('right-answer').addEventListener('click', () => CoreApp.handleAnswer(true));
        document.getElementById('wrong-answer').addEventListener('click', () => CoreApp.handleAnswer(false));
        document.getElementById('close-cards-list').addEventListener('click', () => {
            document.getElementById('cards-list-container').classList.add('hidden');
        });
        
        // Fermeture des modales
        document.querySelectorAll('.modal .close, .flashcard-container').forEach(el => {
            el.addEventListener('click', (e) => {
                if(e.target === el) {
                    document.getElementById('flashcard-container').classList.add('hidden');
                }
            });
        });
    },

    parseCSV: (text) => {
        // Parser CSV simple (suppose header en ligne 1)
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        return lines.slice(1).map((line, index) => {
            // Gestion basique des guillemets
            const regex = /(".*?"|[^",\s]+)(?=\s*,|\s*$)/g; // Regex simplifiée
            // Pour faire simple ici, on split par virgule si pas de guillemets complexes
            // Amélioration possible : utiliser une lib CSV robuste
            const values = line.split(','); 
            
            // Mapping selon vos headers
            // header attendu : question_content, question_content_image, answer_content, answer_content_image, box_number, last_reviewed
            return {
                id: index,
                question: values[0]?.replace(/"/g, ''),
                qImage: values[1]?.replace(/"/g, ''),
                answer: values[2]?.replace(/"/g, ''),
                aImage: values[3]?.replace(/"/g, ''),
                box: parseInt(values[4]) || 1,
                lastReview: values[5]
            };
        });
    },

    renderBoxes: () => {
        const container = document.getElementById('leitner-boxes');
        container.innerHTML = '';
        
        const boxes = [1, 2, 3, 4, 5];
        boxes.forEach(num => {
            const count = CoreApp.csvData.filter(c => c.box === num).length;
            const div = document.createElement('div');
            // Utilisation de vos classes CSS existantes box-border-X
            div.className = `bg-white p-4 rounded shadow border-t-4 box-border-${num} hover:shadow-lg transition cursor-pointer`;
            div.innerHTML = `
                <h3 class="font-bold text-gray-700 text-box${num}">Boîte ${num}</h3>
                <p class="text-2xl font-bold mt-2">${count}</p>
                <p class="text-xs text-gray-500">cartes</p>
            `;
            
            // Clic sur une boîte = Lancer la session pour cette boîte
            div.addEventListener('click', () => {
                const cardsInBox = CoreApp.csvData.filter(c => c.box === num);
                if(cardsInBox.length === 0) {
                    alert("Cette boîte est vide !");
                    return;
                }
                
                // Nouvelle session avec uniquement les cartes de cette boîte
                SessionManager.start(CoreApp.csvData.filename || "Inconnu", cardsInBox);
                CoreApp.startReview(true); // true = utilise la session active
            });
            
            container.appendChild(div);
        });
    },

    startReview: (useSession = false) => {
        if (!APP_STATE.session) return;

        const session = APP_STATE.session;
        
        // Vérifier s'il reste des cartes
        if (session.currentIndex >= session.totalCards) {
            alert(`Session terminée !\nScore : ${session.stats.correct}/${session.totalCards}`);
            SessionManager.complete();
            document.getElementById('flashcard-container').classList.add('hidden');
            return;
        }

        const cardIndexInDeck = session.cardsQueue[session.currentIndex]; // Récupère l'ID réel de la carte
        // Retrouver la carte dans les données chargées (Attention: suppose que le CSV n'a pas changé entre temps)
        // Pour robustesse, on cherche par contenu ou ID si possible. Ici on prend l'objet stocké dans cardsQueue
        // Simplification : cardsQueue stocke l'objet carte complet pour éviter les soucis de synchro
        // Correction : Pour localStorage léger, on stocke l'index relatif au tableau csvData filtré ?
        // Solution simple : On récupère la carte depuis csvData[cardIndexInDeck] si on a stocké l'index global, 
        // ou ici on va faire simple : on regarde dans session.cardsQueue qui contient les cartes (objets)
        
        // ATTENTION : Pour le localStorage, il vaut mieux ne pas stocker tout l'objet carte.
        // Mais pour l'instant, faisons fonctionner l'affichage.
        const card = session.cardsQueue[session.currentIndex]; 

        // Affichage
        CoreApp.showCardUI(card);
    },

    showCardUI: (card) => {
        const container = document.getElementById('flashcard-container');
        const qContent = document.getElementById('question-content');
        const aContent = document.getElementById('answer-content');
        
        container.classList.remove('hidden');
        document.getElementById('answer-section').classList.add('hidden');
        document.getElementById('show-answer-btn').classList.remove('hidden');

        // Contenu Question
        let qHtml = `<p>${card.question || card.question_content || ''}</p>`; // Supporte formats import/export
        if(card.qImage || card.question_content_image) {
             // Ici il faudrait gérer l'URL complète avec GitHub si nécessaire
             const imgName = card.qImage || card.question_content_image;
             // Si pas d'URL absolue, on suppose que c'est relatif (à gérer selon votre config GitHub)
             if(imgName.startsWith('http')) {
                 qHtml += `<img src="${imgName}" class="max-w-full h-auto mt-2 rounded">`;
             } else {
                 // Placeholder ou logique URL GitHub (à connecter avec admin settings)
                 qHtml += `<div class="text-xs text-gray-500 mt-2">[Image: ${imgName}]</div>`;
             }
        }
        qContent.innerHTML = qHtml;

        // Contenu Réponse
        let aHtml = `<p>${card.answer || card.answer_content || ''}</p>`;
        if(card.aImage || card.answer_content_image) {
            const imgName = card.aImage || card.answer_content_image;
            aHtml += `<div class="text-xs text-gray-500 mt-2">[Image: ${imgName}]</div>`;
        }
        aContent.innerHTML = aHtml;
    },

    handleAnswer: (isCorrect) => {
        // Logique Leitner (mise à jour de la boîte)
        // Note: Ici on simule la mise à jour visuelle, mais on ne sauvegarde pas dans le CSV (car pas de backend)
        const session = APP_STATE.session;
        const currentCard = session.cardsQueue[session.currentIndex];
        
        // Mise à jour locale de la boîte pour l'affichage immédiat
        if(isCorrect) {
            if(currentCard.box < 5) currentCard.box++;
        } else {
            currentCard.box = 1;
        }

        // Enregistrer la stats de session
        SessionManager.recordResult(isCorrect);

        // Passer à la suivante
        CoreApp.startReview(true);
    }
};

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    CoreApp.init();
    StatsUI.init();
});

// Export pour usage externe si besoin
window.LeitnerCore = CoreApp;