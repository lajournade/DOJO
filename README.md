# DOJO

Suivi de musculation en remplacement de l'onglet **Suivit 2** de `Sport 2026.xlsx`.
Pensé pour le pouce sur iPhone 12 Pro, habillé en borne d'arcade pixel : la séance est
un adversaire dont la barre de vie descend à chaque série validée.

Plusieurs joueurs, sans compte ni mot de passe : on choisit son profil à l'ouverture et le
téléphone s'en souvient. Les données vivent sur le PC, dans un fichier JSON.

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
npm run dev          # Vite sur le port 5174, rechargement à chaud, proxy /api vers 5180
```

Les ports sont figés (`strictPort`) : Comptes tient le 5173, DOJO le 5174, Vigie le 5175, et un port
déjà pris échoue au lieu de faire glisser l'URL sous les pieds du téléphone. Le tableau complet est
dans le README de `../Vigie`, qui surveille les trois.

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
| `data/sport.json` | source de vérité : joueurs, programmes, journaux, séances en cours |
| `data/backups/` | une copie datée par jour, les 14 dernières conservées |
| `data/backups/sport-v1-*.json` | l'état d'avant les profils, archivé une fois pour toutes |
| `scripts/seed.json` | état initial (programme P2 + historique importé du classeur) |

Un fichier antérieur aux profils est converti au premier démarrage : tout ce qu'il contenait
revient à un joueur nommé *Joueur 1*, les programmes rejoignent la famille *hypertrophie*, et
le fichier d'origine est archivé sous `sport-v1-<date>.json` avant la moindre écriture.

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
  screens/     Players (le choix du profil), Roster (sélection de l'adversaire), Arena (la
               séance), Results, History, Program (la bibliothèque et ses éditeurs)
  components/  PreFight (le briefing d'avant-combat), FightIntro, barres de vie, compteurs,
               PowerUp et Plateau (ce qui monte, ce qui piétine)
  store/       état, file d'envoi, synchronisation, sélecteurs, familles de programme
  fx/          audio, secousse d'écran, écran allumé, appui long, sprites des combattants
scripts/    import du classeur et état initial
```

### Joueurs et programmes

L'écran d'accueil est un **select player** : une grille de portraits, un par joueur, sans
mot de passe. Le profil choisi est retenu par l'appareil, pas par le serveur — deux
téléphones peuvent donc mener deux séances en même temps sans jamais se croiser. Chacun
garde son journal, sa progression et sa séance en cours ; ce qui est commun, c'est le
catalogue d'exercices et la **bibliothèque de programmes**.

Un programme appartient à une famille — **force**, **hypertrophie** ou **endurance** — qui
range la bibliothèque et pré-remplit les exercices qu'on y ajoute :

| Famille | Répétitions | Repos | RIR visé |
|---|---|---|---|
| force | 3 – 5 | 180 s | 2 |
| hypertrophie | 8 – 12 | 90 s | 2 |
| endurance | 15 – 20 | 60 s | 3 |

Rien n'y est imposé : ces valeurs se corrigent ligne à ligne dans l'éditeur. Choisir un
programme le pose comme **programme en cours** — celui du joueur, pas celui du dojo : deux
personnes peuvent suivre le même sans partager une seule charge.

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
| jouée **hors de la fourchette prescrite** | charge **transposée** par le 1RM estimé |

Jamais de baisse automatique — mais plus jamais en silence non plus. Quand la série de
travail passe **trois séances** à la même charge sans gagner une répétition, le dojo le
constate : l'exercice porte un `bloqué` sur le briefing, et l'arène ouvre un bandeau
`stalled` à sa première série, avec un déchargement de 2,5 kg à un appui. Il constate et
propose, il n'applique rien : décharger reste un geste manuel, et la baisse consentie ne
vaut que pour la séance en cours — elle se reporte sur les séries suivantes de l'exercice
qui portaient cette charge, jamais sur son échauffement, et rien n'en est écrit au journal.
Les séances où le RIR a été oublié ne comptent pas : sans lui, une séance ne dit rien, ni
dans un sens ni dans l'autre.

La dernière ligne est le passage d'un cycle à l'autre. Changer de programme pour de la force
ne se règle pas d'une séance sur l'autre : la charge d'un travail à huit répétitions ne vaut
rien pour cinq. Le RIR déjà saisi donne les répétitions restantes, donc un 1RM estimé par la
formule d'Epley, qu'on renverse vers la nouvelle fourchette — 100 kg × 8 à RIR 2 valent un
1RM de 133 kg, donc **107,5 kg pour 5 répétitions à RIR 2**. Le rapport obtenu s'applique à
toutes les séries de l'exercice, si bien que la rampe d'échauffement garde sa forme au lieu
qu'une série lourde saute seule. Le briefing compte ces exercices comme `transposés`, l'arène
les annonce en `nouveau cycle`, et dès la séance suivante — l'historique étant rentré dans la
fourchette — la double progression reprend la main.

Trois garde-fous, parce qu'une estimation reste une estimation : rien ne se transpose sans
RIR (les séances importées du classeur n'en ont pas, elles sont reconduites telles quelles),
rien au-delà d'une douzaine de répétitions à l'échec, où la formule extrapole plus qu'elle
n'estime, et l'arrondi tombe toujours **en dessous** — le compteur de l'arène monte d'un appui.

Le verdict ne touche que les séries qui portaient le poids de travail — l'échauffement
40 / 60 / 80 du squat garde ses valeurs, seule la série lourde monte. Et rien n'est imposé :
un appui sur le compteur suffit à revenir sur la proposition, qui s'efface alors du bandeau.

Rien de tout cela n'attend le premier coup pour se dire. Entre le choix de l'adversaire
et la première série, le **briefing** annonce le combat : les exercices dans l'ordre, la
charge que l'arène proposera pour chacun — les deux bouts de la rampe quand il y en a
une (« 40 à 72,5 kg ») —, les montées du jour, et la durée. On sait quoi charger sur la
barre avant d'y être. L'écran ne fait que lire le même `advise` que l'arène : ce qui est
annoncé est ce qui sera servi, et l'ouvrir n'engage aucune séance. La durée vient des
séances déjà chronométrées quand il y en a, et du programme sinon — c'est le `min env.`
du bandeau.

### Synchronisation

Valider une série met l'état local à jour immédiatement, puis dépose une opération
dans une file persistée en `localStorage`. La file part vers `POST /api/ops` ; chaque
opération porte un identifiant, et le serveur ignore celles qu'il a déjà appliquées.
Si le VPN tombe en pleine séance, la saisie continue, un compteur `⇅ N` s'affiche, et
tout remonte au retour du réseau.

Chaque opération porte le joueur qui l'a émise et ne touche que son sous-arbre : deux séances
menées en parallèle ne se marchent jamais dessus. La bibliothèque de programmes, elle, est
partagée — deux personnes qui éditent le même programme au même instant s'écrasent l'une
l'autre, dernier arrivé gagnant. Sur un dojo familial, c'est le compromis raisonnable.
