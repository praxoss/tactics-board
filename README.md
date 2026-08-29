# Implaqubles Tactics Board

## Idée du projet

Implaqubles Tactics Board est un outil léger de préparation tactique au rugby pour l’équipe des Implacables 1993. Il permet de dessiner une combinaison, de positionner les joueurs, de préparer les touches et les mêlées, d’enregistrer plusieurs phases et de rejouer les mouvements de manière fluide.

Le projet est volontairement simple : il fonctionne dans un navigateur, sauvegarde les combinaisons localement et ne nécessite ni base de données, ni compte, ni système de compilation, ni dépendance externe.

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

## Structure du projet

```text
index.html          Point d’entrée de l’application
app.js              Interactions, lecture et sauvegarde
styles.css          Styles de l’interface
setpiece-data.js    Données des configurations de mêlée
badge-logo.png      Logo des Implacables 1993
start-local.command Lanceur macOS
```

## Lancer le projet en local

Depuis le dossier du dépôt :

```bash
./start-local.command
```

Puis ouvre [http://localhost:8000](http://localhost:8000) dans un navigateur.

Alternative :

```bash
python3 -m http.server 8000
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

## Dépôt

Ce projet est conservé dans un dépôt GitHub privé pour l’équipe des Implacables.
