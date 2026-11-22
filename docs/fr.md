# ThingSpeak

Cette intégration amène vos canaux [ThingSpeak](https://thingspeak.mathworks.com) dans Gladys : chaque canal devient un appareil, chaque champ nommé un capteur, avec la date de la dernière entrée. Vos scènes peuvent aussi écrire des entrées sur un canal, comme l'intégration ThingSpeak de Home Assistant.

Testée contre la vraie API ThingSpeak (canaux publics 9, 12397 et 276330, canal privé lu sans sa clé, coupure réseau). L'écriture d'entrées n'a été testée que contre un faux serveur local : retours bienvenus sur [GitHub](https://github.com/guim31/gladys-thingspeak/issues).

## Ce qu'il vous faut

- Gladys 5.1 ou plus récent, avec un accès à Internet.
- Le numéro de chaque canal à suivre (**Channel ID** sur la page du canal). Un canal public ne demande rien d'autre.
- Pour un canal privé, sa **Read API Key** (page du canal, onglet **API Keys**).
- Pour écrire depuis les scènes, la **Write API Key** du canal.

## Pour commencer

### 1. Nommez vos champs avec leur unité

ThingSpeak n'a pas d'unité. Gladys la lit à la fin du nom du champ, entre parenthèses ou crochets, ou après une espace : `Température (°C)`, `Pression [hPa]`, `Humidité %`, `Puissance (W)`. Unités comprises : °C, °F, %, hPa, mbar, Pa, kPa, bar, psi, lux, V, W, kW, A, kWh, ppm, m/s, km/h, mm/h, dB. Un champ en % dont le nom parle d'humidité devient un capteur d'humidité, un champ en ppm dont le nom parle de CO2 un capteur de CO2. Tout autre champ devient un capteur générique, sans unité.

### 2. Configurez l'intégration

- **Numéros des canaux** : les numéros séparés par des virgules, ex. `9, 12397` (20 au plus). L'adresse d'un canal fonctionne aussi.
- **Clés d'API de lecture (canaux privés)** : vide pour les canaux publics. Une clé pour tous les canaux, ou des paires `canal:CLÉ` séparées par des virgules, ex. `1234567:ABCD1234EFGH5678`.
- **Clé d'API d'écriture (facultative)** : la clé utilisée par l'action de scène quand elle n'a pas la sienne.
- **Intervalle de rafraîchissement** : de 1 à 15 minutes, 2 par défaut. Une requête par canal et par rafraîchissement.
- **Canal muet après** : un canal sans nouvelle entrée depuis ce délai est considéré comme muet (voir Scènes). **Jamais** désactive la règle.
- **Langue des messages** : langue des noms de fonctionnalités, des variables de scène et des erreurs.

**Tester la connexion** lit tous les canaux tout de suite et indique combien de canaux et de champs ont été lus, ou pourquoi un canal ne peut pas l'être.

### 3. Ajoutez les appareils

Ouvrez l'onglet **Découverte** de l'intégration et ajoutez les canaux voulus. Un champ créé plus tard apparaît après **Mettre à jour** dans le même onglet.

## Les appareils

- Un appareil par canal, nommé comme le canal. Une fonctionnalité par champ nommé, plus **Dernière entrée** (date et heure de la dernière entrée, dans le fuseau de Gladys).
- Un champ garde la valeur la plus récente trouvée dans les 100 dernières entrées. Un champ écrit plus rarement reçoit sa dernière valeur, demandée une fois et envoyée une fois avec sa propre date, jamais comme une valeur fraîche. Parmi les 100 dernières entrées, une valeur plus ancienne que le délai de silence n'est pas envoyée.
- Seuls les changements sont envoyés à Gladys, et une valeur inchangée de nouveau toutes les 6 heures tant que le canal reçoit des entrées. Les valeurs d'un canal muet ne sont plus envoyées : Gladys les montre comme anciennes plutôt que fraîches.
- La latitude, la longitude et l'altitude du canal sont ignorées.

## Tableau de bord

Le widget **Canaux ThingSpeak** :

- sans appareil choisi, une ligne par canal avec le temps écoulé depuis sa dernière entrée, en orange s'il est muet, en rouge s'il est illisible ;
- avec un appareil choisi, ses six premiers champs en tuiles en direct, puis la ligne de la dernière entrée. **Masquer la ligne de dernière entrée** retire cette ligne.

## Scènes

### Déclencheurs

**Canal ThingSpeak muet ou revenu** : un canal n'a reçu aucune entrée pendant le délai réglé (un capteur n'écrit plus), ou en reçoit de nouveau. Filtres : l'appareil, le changement (muet, de nouveau à jour). Variables : le canal, son numéro, l'état et les minutes depuis la dernière entrée.

### Actions

**Publier sur ThingSpeak** : écrit une entrée, avec des valeurs dans **Champ 1** à **Champ 8** et le **Statut**. Les champs vides ne sont pas envoyés. Une valeur peut venir d'une action précédente, par exemple une température lue sur un autre appareil. La clé d'écriture désigne le canal : laissez le champ de clé vide pour utiliser celle de la configuration. Une virgule décimale (`21,5`) est envoyée avec un point. L'action renvoie le numéro de l'entrée.

L'offre gratuite accepte une entrée toutes les 15 secondes par canal : l'intégration attend quand deux entrées se suivent de trop près, au lieu de voir la seconde refusée. Une quatrième entrée en attente sur la même clé est refusée : elle dépasserait le délai de l'action.

### Idées de scènes

- Toutes les 10 minutes, publier la température d'un capteur de Gladys sur un canal public pour en faire un graphique sur ThingSpeak.
- Recevoir un message quand le canal de votre station météo est muet depuis une heure.

## Dépannage

- **canal privé : clé d’API de lecture absente ou fausse** : ajoutez la Read API Key de ce canal.
- **aucun canal ne porte ce numéro** : vérifiez le Channel ID.
- **ThingSpeak refuse trop de requêtes** : choisissez un intervalle de rafraîchissement plus long.
- **ThingSpeak a refusé l’entrée** : clé d'écriture fausse, ou entrées trop fréquentes pour votre offre.
- Logs : `LOG_LEVEL=debug` montre chaque lecture. Les clés d'API n'y apparaissent jamais.

## Limites

- Offre gratuite de ThingSpeak : une entrée toutes les 15 secondes par canal, 3 millions de messages par an. Les lectures ne sont pas limitées en nombre, mais restent raisonnables : une minute est l'intervalle le plus court proposé.
- 8 champs par canal, 20 canaux au plus.
- Un champ contenant du texte ne donne pas de valeur.
- Sans lien avec MathWorks. ThingSpeak est une marque de The MathWorks, Inc.
