import { GitHubManager } from '../data/github.js';
import { UIManager } from '../ui/uiManager.js';
import { CRUDManager } from '../data/crud.js';

export class LeitnerApp {
    constructor(options = {}) {
        this.github = new GitHubManager();
        this.ui = new UIManager();
        this.crud = new CRUDManager();

        /**
         * Tab router instance enabling navigation between application sections.
         * Stored for future interactions (e.g. forcing the review tab to open after
         * specific actions). Phase 1 only keeps a reference without additional logic
         * to avoid side effects on existing behaviour.
         */
        this.tabRouter = options.tabRouter || null;

        this.flashcards = [];
        this.currentCSV = 'default';
        this.currentCard = null;
        this.currentBoxNumber = 1;
        this.reviewIntervals = [1, 3, 9, 27, 81]; // Intervalles par défaut en heures

        this.currentQuestionImageFile = null;
        this.currentAnswerImageFile = null;        

        this.init();
    }
    
    async init() {
        this.loadConfig();
        this.loadIntervals();
        this.ui.init(this);
        this.crud.init(this);
        
        // Charger automatiquement les fichiers CSV au démarrage
        await this.loadCSVFromGitHub();
        
        this.createBoxes();
        this.bindEvents();
    }
    
    loadConfig() {
        // Valeurs par défaut
        const defaultConfig = {
            repoOwner: 'leitexper1',
            repoName: 'leitexp',
            repoPath: 'docs/',
            githubToken: ''
        };
        
        // Charger la configuration sauvegardée ou utiliser les valeurs par défaut
        const savedConfig = JSON.parse(localStorage.getItem('leitnerConfig') || '{}');
        const config = {...defaultConfig, ...savedConfig};
        
        // Remplir les champs du formulaire
        document.getElementById('repo-owner').value = config.repoOwner;
        document.getElementById('repo-name').value = config.repoName;
        document.getElementById('repo-path').value = config.repoPath;
        document.getElementById('github-token').value = config.githubToken;
        
        // Sauvegarder la configuration complète
        localStorage.setItem('leitnerConfig', JSON.stringify(config));
        
        // Configurer le gestionnaire GitHub
        this.github.setConfig(config);
    }
    
    saveConfig() {
        const config = {
            repoOwner: document.getElementById('repo-owner').value || 'leitexper1',
            repoName: document.getElementById('repo-name').value || 'leitexp',
            repoPath: document.getElementById('repo-path').value || 'docs/',
            githubToken: document.getElementById('github-token').value || ''
        };
        
        localStorage.setItem('leitnerConfig', JSON.stringify(config));
        this.github.setConfig(config);
    }
    
    loadIntervals() {
        const savedIntervals = JSON.parse(localStorage.getItem('leitnerIntervals'));
        if (savedIntervals && savedIntervals.length === 5) {
            this.reviewIntervals = savedIntervals;
        }
        
        // Mettre à jour les champs de formulaire
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`interval-${i}`).value = this.reviewIntervals[i-1];
        }
    }
    
    saveIntervals() {
        const newIntervals = [];
        for (let i = 1; i <= 5; i++) {
            const value = parseInt(document.getElementById(`interval-${i}`).value) || 1;
            newIntervals.push(value);
        }
        
        this.reviewIntervals = newIntervals;
        localStorage.setItem('leitnerIntervals', JSON.stringify(this.reviewIntervals));
        this.updateBoxes();
        alert('Intervalles sauvegardés avec succès!');
    }
    
    async loadCSVFromGitHub() {
        try {
            await this.github.loadCSVList();
            this.ui.populateCSVSelector(this.github.csvFiles);
            
            // Si des fichiers CSV sont disponibles, charger le premier automatiquement
            if (this.github.csvFiles.length > 0) {
                const firstCSV = this.github.csvFiles[0];
                await this.loadCSVFromURL(firstCSV.download_url, firstCSV.name);
            }
        } catch (error) {
            console.error('Erreur de chargement depuis GitHub:', error);
        }
    }
    
    async loadCSVFromURL(url, csvName) {
        try {
            const csvContent = await this.github.loadCSVContent(url);
            this.parseAndLoadCSV(csvContent, csvName);
        } catch (error) {
            console.error('Erreur de chargement du CSV:', error);
            alert('Erreur de chargement: ' + error.message);
        }
    }
    
    parseAndLoadCSV(csvContent, csvName) {
        const importedCards = this.github.parseCSV(csvContent);
        
        if (importedCards.length > 0) {
            // Corriger les URLs des images
            importedCards.forEach(card => {
                if (card.questionImage) {
                    card.questionImage = this.github.getImageUrl(card.questionImage, 'question');
                }
                if (card.answerImage) {
                    card.answerImage = this.github.getImageUrl(card.answerImage, 'answer');
                }
            });
            
            this.flashcards = importedCards;
            this.currentCSV = csvName;
            this.saveFlashcards();
            this.updateBoxes();
            
            // Afficher un message de confirmation
            alert(`${importedCards.length} cartes chargées depuis ${csvName}`);
        } else {
            alert('Aucune carte valide trouvée dans le fichier CSV');
        }
    }
    
    createBoxes() {
        const boxesContainer = document.getElementById('leitner-boxes');
        if (!boxesContainer) {
            console.warn('Leitner boxes container not found in DOM.');
            return;
        }
        boxesContainer.innerHTML = '';

        for (let i = 1; i <= 5; i++) {
            const box = document.createElement('div');
            box.className = `box box-border-${i} bg-white rounded-lg shadow-md p-4 text-center cursor-pointer hover:-translate-y-1 transition-transform`;
            box.dataset.boxNumber = i;
            
            const colorClass = `text-box${i}`;
            
            box.innerHTML = `
                <h2 class="text-xl font-bold mb-2 ${colorClass}">Boîte ${i}</h2>
                <div class="box-counter text-sm text-gray-600">0 carte(s)</div>
                <div class="box-next-review text-xs text-gray-400 mt-1"></div>
            `;
            
            box.addEventListener('click', () => {
                this.ui.showCardsList(i, this.flashcards, this.reviewIntervals);
            });
            
            boxesContainer.appendChild(box);
        }
        
        this.updateBoxes();
    }
    
    updateBoxes() {
        for (let i = 1; i <= 5; i++) {
            const boxCards = this.flashcards.filter(card => card.box === i);
            const boxElement = document.querySelector(`.box[data-box-number="${i}"]`);
            
            if (boxElement) {
                const counter = boxElement.querySelector('.box-counter');
                const nextReview = boxElement.querySelector('.box-next-review');
                
                counter.textContent = `${boxCards.length} carte(s)`;
                
                if (boxCards.length > 0) {
                    const nextReviewTime = this.getNextReviewTime(i);
                    nextReview.textContent = `Prochaine rev.: ${this.formatTime(nextReviewTime)}`;
                } else {
                    nextReview.textContent = '';
                }
            }
        }
    }
    
    getNextReviewTime(boxNumber) {
        const boxCards = this.flashcards.filter(card => card.box === boxNumber);
        if (boxCards.length === 0) return null;
        
        return boxCards.reduce((min, card) => {
            const cardNextReview = card.lastReview + this.reviewIntervals[card.box - 1] * 3600 * 1000;
            return Math.min(min, cardNextReview);
        }, Infinity);
    }
    
    formatTime(timestamp) {
        if (!timestamp) return '';
        
        const now = Date.now();
        const date = new Date(timestamp);
        
        if (timestamp <= now) {
            return 'Maintenant';
        }
        
        const today = new Date();
        if (date.getDate() === today.getDate() && 
            date.getMonth() === today.getMonth() && 
            date.getFullYear() === today.getFullYear()) {
            return date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        }
        
        return date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute:'2-digit'
        });
    }
    
    saveFlashcards() {
        if (this.currentCSV && this.currentCSV !== 'default') {
            localStorage.setItem(`leitnerFlashcards_${this.currentCSV}`, JSON.stringify(this.flashcards));
            this.updateBoxes();
        }
    }
    
    processAnswer(isCorrect) {
        if (!this.currentCard) return;
        
        this.currentCard.lastReview = Date.now();
        this.currentCard.box = isCorrect ? Math.min(this.currentCard.box + 1, 5) : 1;
        
        // Mettre à jour la carte dans la liste
        const index = this.flashcards.findIndex(c => c.id === this.currentCard.id);
        if (index !== -1) {
            this.flashcards[index] = this.currentCard;
        }
        
        this.saveFlashcards();
        this.ui.hideCardViewer();
        
        // Si on était en train de voir une liste, la mettre à jour
        if (!document.getElementById('cards-list-container').classList.contains('hidden')) {
            this.ui.showCardsList(this.currentBoxNumber, this.flashcards, this.reviewIntervals);
        }
    }
    
    resetAllData() {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser toutes les données? Cette action est irréversible.')) {
            localStorage.clear();
            this.flashcards = [];
            this.currentCSV = 'default';
            this.reviewIntervals = [1, 3, 9, 27, 81];
            this.loadConfig();
            this.loadIntervals();
            this.updateBoxes();
            
            alert('Toutes les données ont été réinitialisées.');
        }
    }
    
    exportAllData() {
        const allData = {};
        
        // Exporter la configuration
        allData.config = JSON.parse(localStorage.getItem('leitnerConfig') || '{}');
        
        // Exporter les intervalles
        allData.intervals = JSON.parse(localStorage.getItem('leitnerIntervals') || '[1,3,9,27,81]');
        
        // Exporter la liste des CSV
        allData.csvList = JSON.parse(localStorage.getItem('leitnerCSVList') || '[]');
        
        // Exporter tous les jeux de flashcards
        allData.flashcards = {};
        allData.csvList.forEach(csv => {
            const saved = localStorage.getItem(`leitnerFlashcards_${csv}`);
            if (saved) {
                allData.flashcards[csv] = JSON.parse(saved);
            }
        });
        
        // Créer un blob et un lien de téléchargement
        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `leitner-backup-${new Date().toISOString().split('T')[0]}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    bindEvents() {
        // Bouton Admin
        document.getElementById('admin-button').addEventListener('click', () => {
            document.getElementById('admin-panel').classList.remove('hidden');
        });
        
        // Fermer le panel Admin
        document.getElementById('close-admin').addEventListener('click', () => {
            document.getElementById('admin-panel').classList.add('hidden');
        });
        
        // Sauvegarder les intervalles
        document.getElementById('save-intervals').addEventListener('click', () => {
            this.saveIntervals();
        });
        
        // Réinitialiser toutes les données
        document.getElementById('reset-all').addEventListener('click', () => {
            this.resetAllData();
        });
        
        // Exporter toutes les données
        document.getElementById('export-all').addEventListener('click', () => {
            this.exportAllData();
        });
        
        // Charger les fichiers depuis GitHub
        document.getElementById('load-github-csv').addEventListener('click', () => {
            this.loadCSVFromGitHub();
        });
    }
}

// Bootstrap moved to src/main.js to centralise navigation + app initialisation.

