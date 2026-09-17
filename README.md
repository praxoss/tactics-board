# Implaqubles Tactics Board

## Idée du projet

Implaqubles Tactics Board est un outil léger de préparation tactique au rugby pour l’équipe des Implacables 1993. Il permet de dessiner une combinaison, de positionner les joueurs, de préparer les touches et les mêlées, d’enregistrer plusieurs phases et de rejouer les mouvements de manière fluide.

Le projet fonctionne dans un navigateur et sauvegarde les combinaisons localement. Il n’utilise pas de base de données : les fichiers JSON exportés restent la sauvegarde portable de référence.

## Fonctionnalités

- Créer une combinaison phase par phase
- Ajouter les joueurs de l’équipe et les joueurs adverses
- Déplacer directement les joueurs et le ballon sur le terrain
- Dessiner des courses, portés, passes et coups de pied
- Ajouter des notes et des zones mises en évidence
- Rejouer les phases avec une interpolation fluide des joueurs et du ballon
- Utiliser les vues `Pitch In`, `Pitch Middle`, `Pitch Out` et `Lineout`
- Générer les placements de départ pour les touches et les mêlées
- Sauvegarder les combinaisons dans le navigateur
- Exporter et importer un fichier tactique JSON complet
- Partager une combinaison avec un lien généré
- Utiliser le blason transparent des Implacables 1993
- Réordonner les stages par glisser-déposer ou avec les flèches
- Réduire le panneau de contrôle et la barre des stages pour libérer le terrain
- Exporter une séquence complète en GIF ou en MP4 depuis le navigateur

## Structure du projet

```text
index.html          Point d’entrée de l’application
app.js              Entrée du bundle navigateur
src/app.js          Interface, édition et orchestration
src/state.js        Modèle v3, migration et identifiants stables
src/playback.js     Plan de lecture et interpolation courbe
src/stage-renderer.js Rendu commun du terrain et des stages
src/stage-menu.js   Cartes, sélection et réordonnancement des stages
src/media-export.js Export GIF / MP4
src/gif-worker.js   Encodage GIF hors du thread d’interface
styles.css          Styles de l’interface
setpiece-data.js    Données des configurations de mêlée
badge-logo.png      Logo des Implacables 1993
start-local.command Lanceur macOS
test/               Tests du modèle et de la lecture
```

## Lancer le projet en local

Depuis le dossier du dépôt :

```bash
./start-local.command
```

Le lanceur construit l’application puis démarre le serveur sur [http://localhost:8000](http://localhost:8000).

Pour lancer les étapes séparément :

```bash
npm install
npm run check
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

Pour arrêter le serveur local, utilise `Ctrl+C` dans le Terminal.

## Données et confidentialité

Les combinaisons sont enregistrées dans le stockage local du navigateur. L’application n’envoie aucune donnée vers un serveur. Utilise l’export JSON pour conserver une sauvegarde ou déplacer une combinaison vers un autre navigateur.

## Déploiement Cloud Run

Le service est déployé sur le projet GCP existant, dans la région `europe-west1` :

[Ouvrir Implaqubles Tactics Board](https://implaqubles-tactics-board-h2b47nssaq-ew.a.run.app)

Le conteneur utilise Nginx pour servir les fichiers statiques sur le port `8080`, attendu par Cloud Run. Les fichiers `Dockerfile`, `nginx.conf` et `.dockerignore` décrivent ce déploiement.

## CI/CD GitHub Actions

Chaque commit poussé sur la branche `main` déclenche automatiquement le workflow `.github/workflows/deploy.yml` :

1. vérification de la syntaxe JavaScript ;
2. construction de l’image Docker ;
3. publication dans Artifact Registry ;
4. déploiement de la nouvelle image sur Cloud Run.

Le workflow peut également être lancé manuellement depuis l’onglet **Actions** de GitHub. L’authentification utilise OIDC entre GitHub et GCP : aucune clé JSON longue durée n’est stockée dans le dépôt.

## Export vidéo

L’export est effectué localement dans le navigateur, afin que la combinaison ne quitte pas l’appareil. Le GIF est encodé à 880 × 560 et 15 images par seconde, dans un Worker dédié. Le MP4 utilise un encodage H.264/AVC à 1100 × 700 et 30 images par seconde lorsque le navigateur le prend en charge. Les exports utilisent les positions enregistrées dans les stages ; les `Run`, `Pass`, `Kick` et autres annotations restent des éléments visuels.

Pendant un export, la progression est affichée et l’opération peut être annulée. Le stage sélectionné et l’état de lecture sont restaurés à la fin.

## Dépôt

Ce projet est conservé dans un dépôt GitHub privé pour l’équipe des Implacables.
