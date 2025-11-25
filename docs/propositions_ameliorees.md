# Recommandations améliorées pour la réinitialisation de la boîte 1

Ces propositions reprennent et structurent les idées partagées pour fiabiliser le changement de jeu de cartes (CSV) dans le système de Leitner. L'objectif principal est de **réinitialiser proprement la boîte 1 lors du changement de fichier tout en préservant l'historique des autres decks**.

## 1. Déclenchement clair au changement de CSV

- Écoute l'événement `change` sur le sélecteur de fichiers CSV.
- Sauvegarde l'état actuel avant tout basculement.
- Réinitialise la boîte 1 du nouveau paquet, puis charge les cartes.

```javascript
const csvSelector = document.getElementById('csv-selector');

csvSelector.addEventListener('change', (event) => {
  const selectedCsv = event.target.value;

  saveCurrentProgress();
  resetBox1(selectedCsv);
  loadCsvData(selectedCsv);
});
```

## 2. Réinitialisation ciblée de la boîte 1

- Supprime uniquement les données de boîte 1 associées au CSV choisi (clé isolée par nom de fichier).
- Remet à zéro le compteur et les cartes de la boîte 1 dans les statistiques du deck.
- Efface au passage la file de review associée pour repartir d'un état cohérent.

```javascript
function resetBox1(csvFilename) {
  const box1Key = `leitner_box1_${csvFilename}`;
  localStorage.removeItem(box1Key);

  const statsKey = `leitner_stats_${csvFilename}`;
  const stats = JSON.parse(localStorage.getItem(statsKey) || '{}');
  stats.box1Count = 0;
  stats.box1Cards = [];
  localStorage.setItem(statsKey, JSON.stringify(stats));

  const reviewKey = `leitner_reviewing_${csvFilename}`;
  localStorage.removeItem(reviewKey);
}
```

## 3. Structure de stockage conseillée

Encapsuler chaque deck sous une clé unique pour éviter tout mélange d'états entre CSV :

```javascript
// Exemple de structure par deck
leitner_state_[filename] = {
  boxes: { 1: [...], 2: [...], 3: [...] },
  stats: { totalCards: 0, mastered: 0, reviewCount: 0 },
  lastUsed: '2025-11-25'
};

// Préférences globales
leitner_config = {
  currentCsv: 'vocabulaire.csv',
  userPreferences: { timer: 30, autoAdvance: true }
};
```

## 4. Chargement robuste des fichiers CSV

- Combine une liste issue de l'API GitHub et un manifeste local (fallback hors ligne).
- Valide le contenu du CSV et initialise la boîte 1 si aucune sauvegarde n'existe encore.
- Affiche un état de chargement et gère les erreurs avec un message utilisateur.

```javascript
async function loadCsvData(filename) {
  try {
    showLoadingState();

    const response = await fetch(`data/${filename}`);
    const csvText = await response.text();

    const cards = parseCsv(csvText);
    if (!cards.length) throw new Error('CSV vide ou invalide');

    const stateKey = `leitner_state_${filename}`;
    if (!localStorage.getItem(stateKey)) {
      initializeNewDeck(filename, cards);
    } else {
      restoreDeckState(filename);
    }
  } catch (error) {
    console.error('Erreur chargement CSV:', error);
    showError(`Impossible de charger ${filename}`);
  } finally {
    hideLoadingState();
  }
}
```

## 5. UI/UX lors du changement de jeu

- **Confirmation préalable** : prévenir que la boîte 1 sera réinitialisée et proposer de sauvegarder.
- **Aperçu rapide** : afficher le nombre de cartes par boîte avant le switch.
- **Mise en évidence** : badge « Actif » sur le deck choisi, barre de progression par boîte et timer optionnel pendant la révision.

## 6. Sauvegarde automatique et sortie propre

- Déclencher `saveCurrentProgress()` avant fermeture de l'onglet.
- Stocker l'état courant (boxes, stats, horodatage) sous une clé spécifique au CSV.
- Mémoriser le dernier deck utilisé pour reprendre la session sans friction.

## 7. Validation et parsing des CSV

- Ignorer les lignes invalides (question/réponse manquante) en journalisant un avertissement.
- Fournir un identifiant de repli (`i` ou `parseInt(id)`) et placer par défaut les cartes en boîte 1 si l'information manque.
- Lever une erreur explicite si le fichier est vide pour éviter un état incohérent.

## 8. Statistiques et export

- Tableau de bord minimal : cartes en boîte 1, cartes maîtrisées, reviews du jour, taux de réussite.
- Ajout d'un export JSON pour sauvegarder tous les états `leitner_state_*` dans un fichier unique (`leitner-backup.json`).
- Prévoir un import symétrique pour restaurer rapidement un deck.

## 9. Checklist de validation

- [ ] Changer de CSV vide correctement la boîte 1 du nouveau deck.
- [ ] Les fichiers CSV mal formés sont refusés avec un message clair.
- [ ] Le localStorage est nettoyé des clés obsolètes lors d'un switch.
- [ ] Un mode démo/échantillon est disponible pour tester sans CSV externe.
- [ ] Le README décrit le format attendu des CSV et les métadonnées stockées.

Ces pistes fournissent une base concise pour fiabiliser le reset de la boîte 1 et améliorer l'expérience de changement de deck dans votre application de flashcards Leitner.
