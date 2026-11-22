// -----------------------------------------------------------------------------
// HTTP client of the ThingSpeak REST API (https://api.thingspeak.com).
//
//   GET  /channels/<id>/feeds.json?results=N[&api_key=READ]   channel + last entries
//   GET  /channels/<id>/fields/<n>/last.json[?api_key=READ]   last value of one field
//   POST /update   api_key=WRITE&field1=…                     one entry
//
// Answers recorded on 22/11/2026 (test/fixtures/thingspeak/): a public channel
// answers without key; a private channel without key (or with a wrong one)
// answers `-1` in an HTTP 400; a channel that does not exist answers a JSON 404;
// /update answers the new entry id, or `0` (wrong write key, or less than 15 s
// since the last entry on the free plan).
//
// The keys travel in the query string, the only way ThingSpeak takes them:
// never log a URL.
// -----------------------------------------------------------------------------

export const API_URL = 'https://api.thingspeak.com';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  PRIVATE: 'private',
  NOT_FOUND: 'not_found',
  RATE_LIMITED: 'rate_limited',
  HTTP: 'http',
});

// Entries read per cycle: enough for a field written less often than the
// others to keep its last value (see src/thingspeak/model.js).
export const RESULTS = 100;

const TIMEOUT_MS = 10_000;

export class ThingSpeakError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** The default HTTP seam: fetch, with a timeout. The tests pass a fake one. */
export async function fetchRequest(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

export class ThingSpeakClient {
  /**
   * @param {object} [options]
   * @param {Function} [options.request] HTTP seam: (url, { method, headers, body }) => { status, body }
   * @param {string} [options.url] API root (tests)
   */
  constructor({ request = fetchRequest, url = API_URL } = {}) {
    this.request = request;
    this.url = url;
  }

  async send(path, options = {}) {
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        ...options,
        headers: { accept: 'application/json', ...options.headers },
      });
    } catch (err) {
      // The cause carries the useful part (ECONNREFUSED, ENOTFOUND, timeout),
      // never the URL and its key.
      const reason = err?.cause?.code ?? err?.name ?? 'error';
      throw new ThingSpeakError(ERROR_KINDS.UNREACHABLE, `no answer (${reason})`);
    }
    return response;
  }

  async getJson(path) {
    const { status, body } = await this.send(path);
    const text = String(body ?? '').trim();
    if (text === '-1') {
      throw new ThingSpeakError(ERROR_KINDS.PRIVATE, 'private channel: read key missing or wrong');
    }
    if (status === 404) {
      throw new ThingSpeakError(ERROR_KINDS.NOT_FOUND, 'channel not found');
    }
    if (status === 429) {
      throw new ThingSpeakError(ERROR_KINDS.RATE_LIMITED, 'too many requests (HTTP 429)');
    }
    if (status === 401 || status === 403) {
      throw new ThingSpeakError(ERROR_KINDS.PRIVATE, `access refused (HTTP ${status})`);
    }
    if (status < 200 || status >= 300) {
      throw new ThingSpeakError(ERROR_KINDS.HTTP, `HTTP ${status}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ThingSpeakError(ERROR_KINDS.HTTP, 'the answer is not JSON');
    }
  }

  /** The channel and its last entries. */
  async channel(id, readKey) {
    const key = readKey ? `&api_key=${encodeURIComponent(readKey)}` : '';
    const answer = await this.getJson(`/channels/${id}/feeds.json?results=${RESULTS}${key}`);
    if (!answer || typeof answer !== 'object' || !answer.channel) {
      throw new ThingSpeakError(ERROR_KINDS.HTTP, 'unexpected answer');
    }
    return answer;
  }

  /** The last entry holding a value for field `n` (`{ created_at, field<n> }`), or null. */
  async lastFieldValue(id, n, readKey) {
    const key = readKey ? `?api_key=${encodeURIComponent(readKey)}` : '';
    const answer = await this.getJson(`/channels/${id}/fields/${n}/last.json${key}`);
    return answer && typeof answer === 'object' ? answer : null;
  }

  /**
   * Write one entry.
   * @param {string} writeKey
   * @param {Record<string, string>} values field1…field8, status
   * @returns {Promise<number|null>} the entry id, null when ThingSpeak refused it
   */
  async update(writeKey, values) {
    const body = new URLSearchParams({ api_key: writeKey, ...values }).toString();
    const { status, body: answer } = await this.send('/update', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (status === 429) {
      throw new ThingSpeakError(ERROR_KINDS.RATE_LIMITED, 'too many requests (HTTP 429)');
    }
    const id = Number(String(answer ?? '').trim());
    if (status >= 500) {
      throw new ThingSpeakError(ERROR_KINDS.HTTP, `HTTP ${status}`);
    }
    return Number.isInteger(id) && id > 0 ? id : null;
  }
}
