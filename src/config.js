// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds. A minute at
// least: ThingSpeak channels are written every 15 s at best (free plan).
export const POLL_INTERVALS = ['60', '120', '300', '600', '900'];

// A channel without a new entry for this long (minutes) counts as silent; '0' never.
export const SILENT_AFTER = ['0', '15', '30', '60', '180', '720', '1440'];

// Channels read at most, so a long list never hammers the public API.
export const MAX_CHANNELS = 20;

export const DEFAULT_CONFIG = {
  channels: '',
  read_api_keys: '',
  write_api_key: '',
  poll_interval: '120',
  silent_after: '60',
  language: 'fr',
};

/** ThingSpeak API keys: 16 upper case letters and digits. */
const API_KEY = /^[A-Z0-9]{16}$/;

/** An API key as pasted: blanks trimmed, `api_key=` prefix dropped, upper case. Null when not a key. */
export function parseApiKey(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const key = raw
    .trim()
    .replace(/^api_key=/i, '')
    .toUpperCase();
  return API_KEY.test(key) ? key : null;
}

/**
 * The channel ids typed by the user: comma, semicolon or space separated. A
 * channel URL (`thingspeak.com/channels/9`) gives its id too.
 */
export function parseChannelIds(raw) {
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string') {
    return [];
  }
  const ids = [];
  for (const part of text.split(/[\s,;]+/)) {
    const match = part.match(/^(?:.*\/channels\/)?(\d{1,9})(?:[/?#].*)?$/);
    const id = match ? Number(match[1]) : NaN;
    if (id > 0 && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids.slice(0, MAX_CHANNELS);
}

/**
 * The read keys: `channel:KEY` pairs, comma or space separated, and at most one
 * bare key, used for every channel without its own.
 * @returns {{ byChannel: Map<number, string>, fallback: string|null, invalid: boolean }}
 */
export function parseReadKeys(raw) {
  const byChannel = new Map();
  let fallback = null;
  let invalid = false;
  if (typeof raw !== 'string') {
    return { byChannel, fallback, invalid };
  }
  for (const part of raw.split(/[\s,;]+/).filter(Boolean)) {
    const pair = part.match(/^(\d{1,9})[:=](.+)$/);
    const key = parseApiKey(pair ? pair[2] : part);
    if (!key) {
      invalid = true;
    } else if (pair) {
      byChannel.set(Number(pair[1]), key);
    } else {
      fallback = key;
    }
  }
  return { byChannel, fallback, invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const readKeys = parseReadKeys(source.read_api_keys);
  const typedWrite = typeof source.write_api_key === 'string' ? source.write_api_key.trim() : '';
  const channelIds = parseChannelIds(source.channels);
  return {
    channelIds,
    readKeys,
    readKeyOf: (id) => readKeys.byChannel.get(id) ?? readKeys.fallback,
    writeKey: parseApiKey(typedWrite),
    writeKeyInvalid: Boolean(typedWrite) && !parseApiKey(typedWrite),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    silentAfterMs: Number(pick('silent_after', SILENT_AFTER)) * 60_000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** What changes the reads: another channel list or other keys. */
export const readSignature = (config) =>
  JSON.stringify([
    config.channelIds,
    [...config.readKeys.byChannel].sort(),
    config.readKeys.fallback,
  ]);
