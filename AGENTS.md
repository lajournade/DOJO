# Instructions pour les agents

## Contexte du dépôt

DOJO est une application React + TypeScript servie par Vite, avec une API HTTP Node sans
dépendance. Ce n'est pas une application Next.js.

- `src/` contient l'interface, les écrans, les composants et l'état client.
- `shared/` contient les opérations appliquées à l'identique par le client et le serveur.
- `server/` contient la persistance JSON et l'API.
- `src/conops/` contient les scénarios métier de bout en bout sous jsdom.
- `scripts/` contient l'état initial, les opérations rejouables et les outils d'import.
- `fixtures/` contient les états figés utilisés par les tests de migration.

Lire `README.md` avant toute modification qui touche le comportement métier, les données,
le déploiement ou l'habillage.

## Commandes de développement

Le dépôt utilise npm et `package-lock.json`. Ne change pas de gestionnaire de paquets sans
mettre à jour le lockfile correspondant.

Pour travailler avec le rechargement à chaud, lancer dans deux terminaux depuis la racine :

```bash
npm start       # API sur http://localhost:5180
npm run dev     # interface Vite sur http://localhost:5174
```

Ne pas lancer `npm run build` pendant une itération d'agent : le flux de développement
utilise Vite/HMR. Le build est réservé à une demande explicite de validation du déploiement.
Dans ce cas, utiliser `npm run serve` selon le README et signaler que le build a été exécuté.

## Vérification obligatoire

Après une modification, exécuter les contrôles pertinents, en privilégiant les tests ciblés
pendant l'itération :

```bash
npm run lint
npm test
```

`npm test` lance Vitest avec couverture et exige au moins 80 % pour les lignes, fonctions,
branches et instructions. Si le changement concerne l'interface, les scénarios concernés
dans `src/conops/` doivent être exécutés ou ajoutés. Si le changement concerne l'API, la
persistance, la migration ou les opérations, vérifier aussi les tests de `server/`, `shared/`
et `src/store/` concernés.

Ne jamais déclarer une tâche terminée sans indiquer les commandes de vérification exécutées
et leurs résultats. Ne pas masquer un test échoué en réduisant un seuil ou en excluant du code
de la couverture sans justification explicite.

## Règles de conception

- Préférer TypeScript (`.ts`/`.tsx`) pour tout nouveau code.
- Garder les styles propres au composant près du composant ; respecter les conventions CSS
  déjà présentes dans `src/styles/` et les composants.
- Préserver l'ergonomie au pouce sur iPhone 12 Pro : contrôles larges, retour visuel immédiat,
  pas de dépendance à un hover ou à une souris.
- Préserver l'identité pixel-art : `Press Start 2P` uniquement pour les chaînes courtes et
  sans accent ; utiliser `label-text` pour le reste. Les tailles doivent rester des multiples
  de 8 px (`text-p1` à `text-p5`).
- Les images binaires ne sont pas nécessaires pour les combattants : les sprites sont décrits
  en texte dans `src/fx/sprites.ts`.

## Invariants métier et données

- Une validation de série met à jour l'état local immédiatement et crée une opération persistée
  dans la file `localStorage` ; ne pas introduire de chemin qui perd une opération hors ligne.
- Une opération est idempotente et est isolée par joueur. Ne pas partager ou écraser l'état
  d'une séance d'un autre joueur.
- Le serveur est la source de vérité dans `data/sport.json`. Ne pas modifier `data/` dans les
  tests ; les tests doivent utiliser un fichier temporaire et les fixtures prévues.
- Les changements de schéma doivent préserver la migration et les sauvegardes existantes.
- Une modification de programme ne doit pas modifier silencieusement l'historique déjà joué.
- Les propositions de progression, transposition ou décharge restent explicites et réversibles ;
  ne pas transformer une suggestion en écriture automatique dans le journal.
- Ne pas ajouter de dépendance de production sans expliquer son besoin et mettre à jour
  `package-lock.json`.

## Revue de code

Lors d'une revue ou avant de conclure une implémentation, vérifier en priorité :

1. perte ou duplication d'opérations lors d'une coupure réseau ;
2. confusion entre joueurs ou entre séance en cours et historique ;
3. régression du comportement de reprise, abandon, remplacement, superset ou séance libre ;
4. régression mobile, accessibilité des contrôles et lisibilité des accents ;
5. tests absents pour tout nouveau cas métier.

Les règles de formatage et les commandes de test restent dans les scripts et la CI ; ce fichier
décrit les décisions et les garde-fous spécifiques au projet.
