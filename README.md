# DOJO

Suivi de musculation en remplacement de l'onglet **Suivit 2** de `Sport 2026.xlsx`.
Pensé pour le pouce sur iPhone 12 Pro, habillé en jeu de combat : la séance est un
adversaire dont la barre de vie descend à chaque série validée.

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
src/        application React
  screens/  Roster (choix de la séance), Arena (la séance), Results, History, Program
  store/    état, file d'envoi, synchronisation, sélecteurs
  fx/       audio, secousse d'écran, écran allumé
scripts/    import du classeur et état initial
```

### Synchronisation

Valider une série met l'état local à jour immédiatement, puis dépose une opération
dans une file persistée en `localStorage`. La file part vers `POST /api/ops` ; chaque
opération porte un identifiant, et le serveur ignore celles qu'il a déjà appliquées.
Si le VPN tombe en pleine séance, la saisie continue, un compteur `⇅ N` s'affiche, et
tout remonte au retour du réseau.
