// -----------------------------------------------------------------------------
// A fake ThingSpeak behind the HTTP seam of the client, answering what
// api.thingspeak.com answered on 22/11/2026 (test/fixtures/thingspeak/): the
// public channels 9, 12397 and 276330 (fields never written lately), `-1` in
// an HTTP 400 for a private channel read without its key, a JSON 404 for an
// unknown channel, the entry id or `0` for /update.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const API = 'https://api.thingspeak.com';
export const PRIVATE_ID = 1000001;
export const READ_KEY = 'ABCDEFGH12345678';
export const WRITE_KEY = 'WRITEKEY12345678';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/thingspeak/${name}.json`, import.meta.url), 'utf8'));

export const FIXTURES = {
  9: fixture('channel-9-my-house'),
  12397: fixture('channel-12397-weather-station'),
  276330: fixture('channel-276330-empty-fields'),
};

// The last entry of channel 9, when the fixture was recorded (ms).
export const RECORDED_AT = Date.parse(FIXTURES[9].feeds.at(-1).created_at);

export class FakeThingSpeak {
  constructor() {
    this.channels = structuredClone(FIXTURES);
    // A private channel: a copy of channel 9 under another id.
    this.channels[PRIVATE_ID] = structuredClone(FIXTURES[9]);
    this.channels[PRIVATE_ID].channel.id = PRIVATE_ID;
    this.channels[PRIVATE_ID].channel.name = 'Private greenhouse';
    this.private = new Set([PRIVATE_ID]);
    // /fields/<n>/last.json of the fields absent from the recorded entries.
    this.lastValues = {
      '276330:3': { created_at: '2018-04-11T13:47:29Z', entry_id: 2714, field3: '13' },
    };
    /** null, 'down', 'http500', 'html', 'rate' */
    this.failure = null;
    this.requests = [];
    this.updates = [];
    this.nextEntryId = 42;
    this.refuseUpdates = false;
  }

  /** Add an entry to a channel at `time` (ms). */
  addEntry(id, values, time) {
    const answer = this.channels[id];
    const entryId = (answer.channel.last_entry_id ?? 0) + 1;
    answer.channel.last_entry_id = entryId;
    answer.feeds.push({
      created_at: new Date(time).toISOString().replace('.000', ''),
      entry_id: entryId,
      ...values,
    });
  }

  request = async (url, { method = 'GET', body } = {}) => {
    this.requests.push({ url, method });
    if (this.failure === 'down') {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ENOTFOUND' };
      throw err;
    }
    if (this.failure === 'http500') {
      return { status: 500, body: 'Internal Server Error' };
    }
    if (this.failure === 'rate') {
      return { status: 429, body: '' };
    }
    if (this.failure === 'html') {
      return { status: 200, body: '<!doctype html><html></html>' };
    }
    const { pathname, searchParams } = new URL(url);
    if (method === 'POST' && pathname === '/update') {
      const form = new URLSearchParams(body);
      if (form.get('api_key') !== WRITE_KEY || this.refuseUpdates) {
        return { status: 400, body: '0' };
      }
      const values = Object.fromEntries([...form].filter(([key]) => key !== 'api_key'));
      this.updates.push(values);
      this.nextEntryId += 1;
      return { status: 200, body: String(this.nextEntryId) };
    }
    const match = pathname.match(/^\/channels\/(\d+)\/(feeds\.json|fields\/(\d)\/last\.json)$/);
    const answer = match && this.channels[match[1]];
    if (!answer) {
      return { status: 404, body: '{"status":"404","error":"Not Found"}' };
    }
    const id = Number(match[1]);
    if (this.private.has(id) && searchParams.get('api_key') !== READ_KEY) {
      return { status: 400, body: '-1' };
    }
    if (match[3]) {
      const n = match[3];
      const recorded = this.lastValues[`${id}:${n}`];
      const last = [...answer.feeds].reverse().find((feed) => feed[`field${n}`] != null);
      return { status: 200, body: JSON.stringify(last ?? recorded ?? '-1') };
    }
    const results = Number(searchParams.get('results') ?? 100);
    return {
      status: 200,
      body: JSON.stringify({ channel: answer.channel, feeds: answer.feeds.slice(-results) }),
    };
  };
}
