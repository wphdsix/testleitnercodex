export class GitHubManager {
    constructor() {
        this.config = {
            repoOwner: 'leitexper1',
            repoName: 'leitexp',
            repoPath: 'docs/',
            githubToken: ''
        };
        this.csvFiles = [];
    }
    
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    
    async apiRequest(endpoint, options = {}) {
        const url = `https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}${endpoint}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        };
        
        if (this.config.githubToken) {
            headers['Authorization'] = `token ${this.config.githubToken}`;
        }
        
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            throw new Error(`Erreur GitHub: ${response.status} ${response.statusText}`);
        }
        
        return response.json();
    }
    
    async loadCSVList() {
        try {
            let endpoint = '/contents/';
            if (this.config.repoPath) {
                endpoint = `/contents/${this.config.repoPath}`;
            }
            
            const contents = await this.apiRequest(endpoint);
            
            // Filtrer les fichiers CSV
            this.csvFiles = contents.filter(item => 
                item.type === 'file' && item.name.endsWith('.csv')
            );
            
            // Sauvegarder la liste pour une utilisation hors ligne
            const csvList = this.csvFiles.map(file => file.name);
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('leitnerCSVList', JSON.stringify(csvList));
            }
            
            return this.csvFiles;
        } catch (error) {
            console.error('Erreur de chargement de la liste CSV:', error);
            throw error;
        }
    }
    
    async loadCSVContent(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error('Erreur de chargement du contenu CSV:', error);
            throw error;
        }
    }
    
    parseCSV(csvContent) {
        const lines = csvContent.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            throw new Error('Fichier CSV vide ou mal formaté');
        }
        
        // Vérifier l'en-tête
        const headers = lines[0].split(',').map(h => h.trim());
        const expectedHeaders = [
            'question_content',
            'question_content_image',
            'answer_content',
            'answer_content_image',
            'box_number',
            'last_reviewed'
        ];
        
        if (headers.length !== expectedHeaders.length || !expectedHeaders.every((h, i) => headers[i] === h)) {
            throw new Error('Format de fichier CSV invalide. Les en-têtes doivent être: ' + expectedHeaders.join(', '));
        }
        
        // Parser les données
        const importedCards = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length < 6) continue;
            
            importedCards.push({
                id: Date.now() + i, // ID unique
                question: values[0].replace(/^"|"$/g, ''),
                questionImage: values[1].replace(/^"|"$/g, ''),
                answer: values[2].replace(/^"|"$/g, ''),
                answerImage: values[3].replace(/^"|"$/g, ''),
                box: parseInt(values[4]) || 1,
                lastReview: new Date(values[5].replace(/^"|"$/g, '')).getTime() || Date.now()
            });
        }
        
        return importedCards;
    }
    
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current);
        return values.map(v => v.trim());
    }

    getImageUrl(imagePath, imageType = 'question') {
        if (!imagePath) return null;
        
        // Si c'est déjà une URL complète, la retourner telle quelle
        if (imagePath.startsWith('http')) return imagePath;
        
        // Si c'est une image encodée en base64 (data URL), la retourner
        if (imagePath.startsWith('data:')) return imagePath;
        
        // Construire l'URL GitHub pour l'image
        const baseUrl = `https://raw.githubusercontent.com/${this.config.repoOwner}/${this.config.repoName}/main/`;
        
        // Utiliser le chemin du dépôt comme base
        let fullPath = this.config.repoPath || '';
        
        // Ajouter un slash si nécessaire
        if (fullPath && !fullPath.endsWith('/')) {
            fullPath += '/';
        }
        
        // Si le chemin commence déjà par images_questions ou images_reponses
        if (imagePath.startsWith('images_questions/')) {
            fullPath += imagePath;
        } 
        else if (imagePath.startsWith('images_reponses/')) {
            fullPath += imagePath;
        }
        else {
            // Déterminer le répertoire en fonction du type d'image
            if (imageType === 'question') {
                fullPath += 'images_questions/';
            } else if (imageType === 'answer') {
                fullPath += 'images_reponses/';
            }
            
            // Ajouter le nom du fichier image
            fullPath += imagePath;
        }
        
        return baseUrl + fullPath;
    }
    simplifyImagePath(imageUrl, imageType = 'question') {
        if (!imageUrl) return '';
        
        // Si c'est une URL GitHub, extraire juste le nom du fichier
        if (imageUrl.includes('raw.githubusercontent.com')) {
            const parts = imageUrl.split('/');
            const filename = parts[parts.length - 1];
            
            // Pour les images questions
            if (imageUrl.includes('images_questions')) {
                return `images_questions/${filename}`;
            }
            // Pour les images réponses
            else if (imageUrl.includes('images_reponses')) {
                return `images_reponses/${filename}`;
            }
            // Pour les autres cas, retourner juste le nom du fichier
            else {
                return filename;
            }
        }
        
        // Pour les autres types d'URL, les retourner telles quelles
        return imageUrl;
    }
}