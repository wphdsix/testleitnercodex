# Composants UI avancés

Ce dossier regroupe les widgets utilisés par l'interface de l'application Leitner. Chaque composant est entièrement autonome et peut être initialisé avec des options simples afin d'être réutilisé dans d'autres contextes.

## `TabbedNavigation`
- **Rôle :** améliore le `TabRouter` natif avec navigation clavier, intégration des raccourcis et attributs ARIA.
- **Accessibilité :** attribue `role="tab"` aux déclencheurs, gère l'orientation du tablist et lie chaque onglet à son panneau via `aria-controls`/`aria-labelledby`.
- **Utilisation rapide :**
  ```js
  const navigation = new TabbedNavigation({ tablist, router, keyboardManager });
  navigation.init();
  ```

## `FilterableTable`
- **Rôle :** affiche des sessions avec recherche en texte libre et colonnes formatées.
- **Accessibilité :** applique une étiquette ARIA au tableau si fournie et diffuse l'état vide via un conteneur `role="status"` en direct.
- **Utilisation rapide :**
  ```js
  const table = new FilterableTable({ container, columns, keyboardManager });
  table.init();
  table.setData(rows);
  ```

## `CSVInlineEditor`
- **Rôle :** permet la modification en ligne d'un CSV synchronisé avec une zone de texte.
- **Accessibilité :** expose la zone d'édition comme région nommée, annonce les statuts avec `aria-live` et conserve le focus clavier dans les cellules éditables.
- **Utilisation rapide :**
  ```js
  const editor = new CSVInlineEditor({ container, keyboardManager });
  editor.init();
  editor.bindToApp(app);
  ```

## `StatisticsDashboard`
- **Rôle :** consomme `StatisticsService` pour produire badges, heatmap et graphiques de durée.
- **Accessibilité :** sépare les panneaux avec des sections étiquetées et fournit des descriptions textuelles pour les tuiles et barres.
- **Utilisation rapide :**
  ```js
  const dashboard = new StatisticsDashboard({ container, historyService, keyboardManager });
  dashboard.init();
  ```

## Gestion des raccourcis (`KeyboardManager`)
- **Fonction** : centralise l'enregistrement des combinaisons clavier, affiche un toast animé et une aide modale.
- **Exemple** :
  ```js
  const keyboardManager = new KeyboardManager();
  keyboardManager.init();
  keyboardManager.registerShortcut('ctrl+f', () => focusSearch(), {
      description: 'Placer le focus sur la recherche',
      global: true
  });
  ```

## Styles et animations
Les animations CSS (badge-pop, feedback toast, barres dynamiques) sont définies dans `docs/style.css`. Pensez à importer cette feuille pour bénéficier des transitions et badges de progression.
