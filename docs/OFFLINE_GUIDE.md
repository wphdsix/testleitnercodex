# Utilisation hors-ligne et sauvegardes du Leitner Codex

Ce guide explique comment préparer l'application pour un usage hors-ligne, comment les synchronisations différées fonctionnent et comment sauvegarder/revenir à un état précédent.

## Installation hors-ligne

1. **Servir les fichiers du dossier `docs/`.** Publiez le contenu (via GitHub Pages ou un serveur statique). L'application inclut désormais un *service worker* (`src/workers/offlineWorker.js`) qui met automatiquement en cache les ressources critiques.
2. **Visiter l'application au moins une fois en ligne.** Lors de la première visite, le service worker est enregistré et pré-télécharge les fichiers HTML, CSS, JavaScript et images clés.
3. **Vérifier l'installation du service worker.** Dans votre navigateur :
   - Ouvrez les outils de développement → onglet *Application* → section *Service Workers*.
   - Confirmez que `offlineWorker.js` est « Activated and running ».
4. **Ajouter l'application à l'écran d'accueil (optionnel).** Les navigateurs mobiles proposeront l'installation en PWA dès que le service worker est actif, ce qui permet une utilisation hors-ligne complète.

Une fois ces étapes réalisées, l'application reste fonctionnelle sans connexion réseau. Les ressources sont servies depuis le cache, et les requêtes d'arrière-plan sont mises en file pour synchronisation ultérieure.

## Synchronisation différée

Le service worker capture les requêtes `POST`/`PUT`/`DELETE` transmises via `queue-sync`. Les actions sont enregistrées dans IndexedDB tant que la connexion n'est pas disponible.

- Lors du retour en ligne, le gestionnaire de synchronisation (`background sync`) rejoue chaque requête et supprime les entrées réussies.
- Vous pouvez forcer une synchronisation immédiate en envoyant un message `flush-queue` au service worker.
- Les notifications planifiées sont également stockées hors-ligne et seront affichées dès que leur échéance est atteinte, même si l'application n'est plus ouverte.

## Notifications locales

Les rappels créés par `NotificationService` utilisent le service worker pour programmer des notifications futures. Le service worker garde une copie des notifications planifiées et les affiche même après un redémarrage du navigateur (grâce au stockage IndexedDB et au `SyncManager`).

## Sauvegarde et revert

Deux mécanismes facilitent la sauvegarde des paquets et leur restauration :

1. **Export PDF des statistiques.** Depuis l'interface (ou via `ImportExportService.exportStatisticsToPDF`), générez un PDF qui capture les indicateurs clés. Conservez ce document comme trace des progrès.
2. **Partage / sauvegarde de paquets.** Utilisez `ImportExportService.sharePackageAsFile` pour télécharger une sauvegarde JSON du paquet actuel ou `sharePackageAsSignedUrl` pour générer une URL signée partageable. Ces exports incluent une date d'expiration et une signature HMAC.
3. **Restauration.** Reimportez un paquet sauvegardé en fournissant l'URL signée à `importFromSignedUrl`, ou importez le fichier JSON directement via l'interface. Après restauration, vérifiez les statistiques et répétez un export pour garder une trace.

En cas de problème avec une synchronisation différée, vous pouvez annuler une notification programmée (`NotificationService.cancelReminder`) ou nettoyer la file des requêtes via `flush-queue`. Les sauvegardes vous permettent de revenir rapidement à un état connu.
