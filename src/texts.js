// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, feature names,
// scene event variables and scene action errors. Four languages, the four of
// the Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

export const LANGUAGE_FALLBACK = 'en';

/** The text of `table` in `language`, English when missing. */
export const pick = (table, language) => table[language] ?? table[LANGUAGE_FALLBACK];

/** "label: text", with the French space before the colon. */
export const labelled = (label, text, language) =>
  `${label}${language === 'fr' ? ' : ' : ': '}${text}`;

/** A multi-language object built by `render(language)`. */
export const each = (render) =>
  Object.fromEntries(['en', 'fr', 'de', 'es'].map((language) => [language, render(language)]));

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noChannels: {
    en: 'Enter the ids of your ThingSpeak channels in the configuration.',
    fr: 'Saisissez les numéros de vos canaux ThingSpeak dans la configuration.',
    de: 'Gib die IDs deiner ThingSpeak-Kanäle in der Konfiguration ein.',
    es: 'Introduzca los números de sus canales ThingSpeak en la configuración.',
  },
  invalidKey: {
    en: 'A read API key is not understood: 16 letters and digits, or channel:KEY.',
    fr: 'Une clé d’API de lecture est incomprise : 16 lettres et chiffres, ou canal:CLÉ.',
    de: 'Ein Lese-API-Schlüssel ist ungültig: 16 Buchstaben und Ziffern oder Kanal:SCHLÜSSEL.',
    es: 'Una clave API de lectura no es válida: 16 letras y cifras, o canal:CLAVE.',
  },
};

// Why a channel cannot be read: one entry per ERROR_KINDS value.
export const ERROR_TEXT = {
  unreachable: {
    en: 'ThingSpeak does not answer (network or service down)',
    fr: 'ThingSpeak ne répond pas (réseau ou service en panne)',
    de: 'ThingSpeak antwortet nicht (Netzwerk oder Dienst gestört)',
    es: 'ThingSpeak no responde (red o servicio caído)',
  },
  private: {
    en: 'private channel: read API key missing or wrong',
    fr: 'canal privé : clé d’API de lecture absente ou fausse',
    de: 'privater Kanal: Lese-API-Schlüssel fehlt oder ist falsch',
    es: 'canal privado: clave API de lectura ausente o incorrecta',
  },
  not_found: {
    en: 'no channel with this id',
    fr: 'aucun canal ne porte ce numéro',
    de: 'kein Kanal mit dieser ID',
    es: 'ningún canal con este número',
  },
  rate_limited: {
    en: 'ThingSpeak refuses too many requests, try a longer interval',
    fr: 'ThingSpeak refuse trop de requêtes, essayez un intervalle plus long',
    de: 'ThingSpeak lehnt zu viele Anfragen ab, versuch ein längeres Intervall',
    es: 'ThingSpeak rechaza demasiadas peticiones, pruebe un intervalo más largo',
  },
  http: {
    en: 'unexpected answer from ThingSpeak',
    fr: 'réponse inattendue de ThingSpeak',
    de: 'unerwartete Antwort von ThingSpeak',
    es: 'respuesta inesperada de ThingSpeak',
  },
};

export const CHANNEL_LABEL = {
  en: (id) => `Channel ${id}`,
  fr: (id) => `Canal ${id}`,
  de: (id) => `Kanal ${id}`,
  es: (id) => `Canal ${id}`,
};

export const FEATURE_TEXT = {
  lastEntry: {
    en: 'Last entry',
    fr: 'Dernière entrée',
    de: 'Letzter Eintrag',
    es: 'Última entrada',
  },
};

export const CHANNEL_STATUS_TEXT = {
  silent: { en: 'Silent', fr: 'Muet', de: 'Stumm', es: 'Silencioso' },
  resumed: {
    en: 'Updating again',
    fr: 'De nouveau à jour',
    de: 'Wieder aktuell',
    es: 'Activo de nuevo',
  },
};

// The "Test the connection" report, one table per language.
export const REPORT_TEXT = {
  en: {
    channels: (n) => `${n} channel${n === 1 ? '' : 's'} read`,
    failed: (n) => `${n} failing`,
    fields: (n) => `${n} field${n === 1 ? '' : 's'}`,
    writeKey: 'write key saved (checked on the first entry sent)',
    noWriteKey: 'no write key',
    badWriteKey: 'write key not understood',
  },
  fr: {
    channels: (n) => `${n} ${n > 1 ? 'canaux lus' : 'canal lu'}`,
    failed: (n) => `${n} en échec`,
    fields: (n) => `${n} champ${n > 1 ? 's' : ''}`,
    writeKey: 'clé d’écriture enregistrée (vérifiée au premier envoi)',
    noWriteKey: 'pas de clé d’écriture',
    badWriteKey: 'clé d’écriture incomprise',
  },
  de: {
    channels: (n) => `${n} ${n === 1 ? 'Kanal' : 'Kanäle'} gelesen`,
    failed: (n) => `${n} fehlerhaft`,
    fields: (n) => `${n} ${n === 1 ? 'Feld' : 'Felder'}`,
    writeKey: 'Schreibschlüssel gespeichert (beim ersten Senden geprüft)',
    noWriteKey: 'kein Schreibschlüssel',
    badWriteKey: 'Schreibschlüssel ungültig',
  },
  es: {
    channels: (n) => `${n} canal${n === 1 ? '' : 'es'} leído${n === 1 ? '' : 's'}`,
    failed: (n) => `${n} con error`,
    fields: (n) => `${n} campo${n === 1 ? '' : 's'}`,
    writeKey: 'clave de escritura guardada (se comprueba en el primer envío)',
    noWriteKey: 'sin clave de escritura',
    badWriteKey: 'clave de escritura no válida',
  },
};

export const ACTION_TEXT = {
  noWriteKey: {
    en: 'No write API key: enter it in the action, or in the configuration.',
    fr: 'Aucune clé d’API d’écriture : saisissez-la dans l’action ou dans la configuration.',
    de: 'Kein Schreib-API-Schlüssel: Gib ihn in der Aktion oder in der Konfiguration ein.',
    es: 'Sin clave API de escritura: introdúzcala en la acción o en la configuración.',
  },
  badWriteKey: {
    en: 'Write API key not understood: 16 letters and digits (channel, API Keys tab).',
    fr: 'Clé d’API d’écriture incomprise : 16 lettres et chiffres (canal, onglet API Keys).',
    de: 'Schreib-API-Schlüssel ungültig: 16 Buchstaben und Ziffern (Kanal, Tab API Keys).',
    es: 'Clave API de escritura no válida: 16 letras y cifras (canal, pestaña API Keys).',
  },
  noValue: {
    en: 'Nothing to send: fill in at least one field or the status.',
    fr: 'Rien à envoyer : remplissez au moins un champ ou le statut.',
    de: 'Nichts zu senden: Füll mindestens ein Feld oder den Status aus.',
    es: 'Nada que enviar: rellene al menos un campo o el estado.',
  },
  tooLong: {
    en: 'A value is too long: 255 characters at most per field.',
    fr: 'Une valeur est trop longue : 255 caractères au plus par champ.',
    de: 'Ein Wert ist zu lang: höchstens 255 Zeichen pro Feld.',
    es: 'Un valor es demasiado largo: 255 caracteres como máximo por campo.',
  },
  queueFull: {
    en: 'Three entries are already waiting for this channel (one every 15 s): this one is dropped.',
    fr: 'Trois entrées attendent déjà pour ce canal (une toutes les 15 s) : celle-ci est abandonnée.',
    de: 'Für diesen Kanal warten schon drei Einträge (einer alle 15 s): Dieser wird verworfen.',
    es: 'Ya hay tres entradas en espera para este canal (una cada 15 s): esta se descarta.',
  },
  refused: {
    en: 'ThingSpeak refused the entry: wrong write API key, or channel written too often.',
    fr: 'ThingSpeak a refusé l’entrée : clé d’API d’écriture fausse, ou canal écrit trop souvent.',
    de: 'ThingSpeak hat den Eintrag abgelehnt: falscher Schreib-API-Schlüssel oder Kanal zu oft beschrieben.',
    es: 'ThingSpeak rechazó la entrada: clave API de escritura incorrecta o canal escrito demasiado a menudo.',
  },
};

/** A duration as shown in a widget row: "5 min", "3 h", "2 j". */
export function formatAge(ms, language) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} ${language === 'de' ? 'Std.' : 'h'}`;
  }
  const day = { en: 'd', fr: 'j', de: 'Tg.', es: 'd' }[language] ?? 'd';
  return `${Math.round(hours / 24)} ${day}`;
}
