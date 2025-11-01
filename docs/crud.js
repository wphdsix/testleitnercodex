export class CRUDManager {
    init(app) {
        this.app = app;
    }
    
    saveCard(cardData) {
        // Gérer l'upload des images si des fichiers ont été sélectionnés
        const processImageUpload = async (imageFile, imageType) => {
            if (!imageFile) return cardData[imageType === 'question' ? 'questionImage' : 'answerImage'];
            
            // Ici vous devrez implémenter l'upload vers GitHub
            // Pour l'instant, on retourne juste le nom du fichier
            return imageFile.name;
        };
        
        // Traiter les images de façon asynchrone
        Promise.all([
            processImageUpload(this.app.currentQuestionImageFile, 'question'),
            processImageUpload(this.app.currentAnswerImageFile, 'answer')
        ]).then(([questionImage, answerImage]) => {
            // Mettre à jour les chemins d'images avec les noms de fichiers
            cardData.questionImage = questionImage;
            cardData.answerImage = answerImage;
            
            // Réinitialiser les fichiers
            this.app.currentQuestionImageFile = null;
            this.app.currentAnswerImageFile = null;
            
            // Continuer avec la sauvegarde normale
            if (cardData.id) {
                // Modification
                const index = this.app.flashcards.findIndex(c => c.id == cardData.id);
                if (index !== -1) {
                    this.app.flashcards[index] = {
                        ...this.app.flashcards[index],
                        question: cardData.question,
                        questionImage: cardData.questionImage,
                        answer: cardData.answer,
                        answerImage: cardData.answerImage
                    };
                }
            } else {
                // Nouvelle carte
                const newId = Date.now(); // ID unique basé sur le timestamp
                this.app.flashcards.push({
                    id: newId,
                    question: cardData.question,
                    questionImage: cardData.questionImage,
                    answer: cardData.answer,
                    answerImage: cardData.answerImage,
                    box: 1,
                    lastReview: Date.now()
                });
            }
            
            this.app.saveFlashcards();
            this.app.ui.hideCardEditor();
            
            // Si on était en train de voir une liste, la mettre à jour
            if (!document.getElementById('cards-list-container').classList.contains('hidden')) {
                this.app.ui.showCardsList(this.app.currentBoxNumber, this.app.flashcards, this.app.reviewIntervals);
            }
        });
    }    
    deleteCard(cardId) {
        const index = this.app.flashcards.findIndex(c => c.id == cardId);
        if (index !== -1) {
            this.app.flashcards.splice(index, 1);
            this.app.saveFlashcards();
            this.app.ui.hideCardViewer();
            
            // Si on était en train de voir une liste, la mettre à jour
            if (!document.getElementById('cards-list-container').classList.contains('hidden')) {
                this.app.ui.showCardsList(this.app.currentBoxNumber, this.app.flashcards, this.app.reviewIntervals);
            }
        }
    }
    
    loadFlashcards(csvName) {
        const saved = localStorage.getItem(`leitnerFlashcards_${csvName}`);
        if (saved) {
            try {
                this.app.flashcards = JSON.parse(saved);
                this.app.currentCSV = csvName;
                this.app.updateBoxes();
                return true;
            } catch (e) {
                console.error('Erreur de chargement des flashcards:', e);
            }
        }
        
        this.app.flashcards = [];
        return false;
    }
    
    saveCSVList() {
        const csvList = [];
        const selector = document.getElementById('csv-selector');
        
        for (let i = 1; i < selector.options.length; i++) {
            csvList.push(selector.options[i].value);
        }
        
        localStorage.setItem('leitnerCSVList', JSON.stringify(csvList));
    }
    
    exportToCSV() {
        if (this.app.flashcards.length === 0) {
            alert('Aucune carte à exporter!');
            return;
        }
        
        // Entête CSV selon le format demandé
        let csvContent = "question_content,question_content_image,answer_content,answer_content_image,box_number,last_reviewed\n";
        
        // Données des cartes
        this.app.flashcards.forEach(card => {
            const row = [
                `"${card.question.replace(/"/g, '""')}"`,
                card.questionImage ? `"${this.app.github.simplifyImagePath(card.questionImage, 'question').replace(/"/g, '""')}"` : '',
                `"${card.answer.replace(/"/g, '""')}"`,
                card.answerImage ? `"${this.app.github.simplifyImagePath(card.answerImage, 'answer').replace(/"/g, '""')}"` : '',
                card.box,
                `"${new Date(card.lastReview).toISOString().split('T')[0]}"`
            ];
            csvContent += row.join(',') + '\n';
        });
        
        // Créer un blob et un lien de téléchargement
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${this.app.currentCSV}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    importFromCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvContent = e.target.result;
                this.app.parseAndLoadCSV(csvContent, file.name);
            } catch (error) {
                alert('Erreur lors de l\'importation: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
}