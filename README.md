# DOJO

Suivi de musculation en remplacement de l'onglet **Suivit 2** de `Sport 2026.xlsx`.
Pensé pour le pouce sur iPhone 12 Pro, habillé en borne d'arcade pixel : la séance est
un adversaire dont la barre de vie descend à chaque série validée.

Mono-utilisateur, sans compte. Les données vivent sur le PC, dans un fichier JSON.

## Démarrer

```bash
npm install
npm run serve        # compile puis lance le serveur sur le port 5180
```

Puis, sur le téléphone : `http://<ip-du-pc>:5180` → *Partager* → *Sur l'écran d'accueil*.
L'application s'ouvre alors en plein écran, sans barre Safari.

En développement :

```bash
npm start            # serveur d'API seul (port 5180)
npm run dev          # Vite avec rechargement à chaud, proxy /api vers 5180
```

## Démarrage automatique

```bash
mkdir -p ~/.config/systemd/user
cp deploy/sport.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now sport
```

Pour que le service tourne même session fermée : `sudo loginctl enable-linger $USER`.

## Accès à distance

Le serveur écoute sur toutes les interfaces : une fois le VPN monté, l'adresse du PC
sur le réseau VPN suffit. Rien d'autre à configurer.

En `http://`, Safari refuse le *service worker* et le *Wake Lock* (contexte non
sécurisé) : l'application fonctionne pleinement — les données sont sur le serveur, et
l'écran reste allumé grâce au repli vidéo. Pour un vrai HTTPS et le mode hors-ligne
complet, `tailscale serve` suffit, sans changer une ligne de code.

## Données

| Chemin | Rôle |
|---|---|
| `data/sport.json` | source de vérité : programmes, journal, séance en cours |
| `data/backups/` | une copie datée par jour, les 14 dernières conservées |
| `scripts/seed.json` | état initial (programme P2 + historique importé du classeur) |

Sauvegarder revient à copier `data/sport.json`. Le supprimer réinitialise
l'application à partir de `scripts/seed.json` au prochain démarrage.

Export au format du tableur d'origine : bouton **exporter en csv** dans l'historique,
ou `curl localhost:5180/api/export.csv`.

Pour régénérer l'état initial depuis le classeur :

```bash
python3 scripts/extract-xlsx.py ~/Downloads/"Sport 2026.xlsx"
```

## Structure

```
server/     serveur HTTP sans dépendance : sert dist/ et l'API
shared/     opérations appliquées à l'identique par le client et le serveur
public/     icône, manifeste, et les deux polices bitmap embarquées
src/        application React
  screens/  Roster (sélection de l'adversaire), Arena (la séance), Results, History, Program
  store/    état, file d'envoi, synchronisation, sélecteurs
  fx/       audio, secousse d'écran, écran allumé, sprites des combattants
scripts/    import du classeur et état initial
```

### Habillage

Tout le dessin tient sur une grille de pixels : deux polices bitmap (Press Start 2P pour
les titres, Silkscreen pour le texte), des cadres crénelés en `box-shadow`, une palette
fixe, et des combattants décrits en clair dans `src/fx/sprites.ts` — un caractère par
pixel, rendus en `<svg>` par `src/components/Sprite.tsx`. Aucune image binaire.

Les polices sont **embarquées dans `public/fonts/`** (sous-ensemble latin, 28 Ko en tout,
licence dans `OFL.txt`) : l'application ne demande rien au réseau une fois chargée.

Deux règles à tenir en modifiant l'interface :

- **Press Start 2P uniquement pour des chaînes courtes et sans accent** — un cadratin par
  glyphe, et ses capitales accentuées sont dessinées à hauteur de bas de casse
  (« RÉPÉTITIONS » y devient « RePeTITIONS »). Tout le reste passe par `label-text`.
- **Les tailles sont des multiples de 8 px** (`text-p1` à `text-p5`), comme les échelles
  de sprite (entières), sinon le rendu bave.

### Montée en charge

Le RIR saisi sur la dernière série ne dort pas dans le journal : c'est lui qui fixe la
charge proposée la fois suivante. À chaque exercice, le dojo relit la dernière séance où
il a été pratiqué et applique une double progression, en trois cas :

| La dernière fois | Aujourd'hui |
|---|---|
| RIR au moins égal à la cible, et haut de fourchette de reps atteint | **+ 2,5 kg**, reps ramenées en bas de fourchette |
| RIR au moins égal à la cible, fourchette pas encore remplie | même charge, **une répétition de plus** |
| RIR sous la cible | à l'identique |

Jamais de baisse automatique : décharger reste un geste manuel. Le verdict ne touche que
les séries qui portaient le poids de travail — l'échauffement 40 / 60 / 80 du squat garde
ses valeurs, seule la série lourde monte. Et rien n'est imposé : un appui sur le compteur
suffit à revenir sur la proposition, qui s'efface alors du bandeau.

### Synchronisation

Valider une série met l'état local à jour immédiatement, puis dépose une opération
dans une file persistée en `localStorage`. La file part vers `POST /api/ops` ; chaque
opération porte un identifiant, et le serveur ignore celles qu'il a déjà appliquées.
Si le VPN tombe en pleine séance, la saisie continue, un compteur `⇅ N` s'affiche, et
tout remonte au retour du réseau.
