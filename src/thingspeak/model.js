// -----------------------------------------------------------------------------
// The answer of /channels/<id>/feeds.json, normalized.
//
// ThingSpeak answers every value as a string ("3.4", "63.68"), `null` for a
// field not written by an entry (a device may write field1 every minute and
// field3 once a day), and only the fields that have a name in the channel
// settings. Latitude, longitude and elevation are ignored.
// -----------------------------------------------------------------------------

export const FIELD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

/** A ThingSpeak value as a number, null when empty or not a number. */
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim().replace(',', '.');
  if (text === '' || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const toTime = (value) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

/**
 * @param {number} id the channel id asked for
 * @param {object} answer the answer of feeds.json
 * @returns {{ id: number, name: string, fields: Array<{ n: number, name: string,
 *   value: number|null, time: number|null }>, lastEntryAt: number|null,
 *   lastEntryId: number|null }} times in ms
 */
export function parseChannel(id, answer) {
  const channel = answer?.channel ?? {};
  const feeds = Array.isArray(answer?.feeds) ? answer.feeds : [];
  const fields = [];
  for (const n of FIELD_NUMBERS) {
    const label = channel[`field${n}`];
    if (typeof label !== 'string' || label.trim() === '') {
      continue;
    }
    // The newest entry holding a number for this field.
    let value = null;
    let time = null;
    for (let i = feeds.length - 1; i >= 0; i -= 1) {
      const number = toNumber(feeds[i]?.[`field${n}`]);
      if (number !== null) {
        value = number;
        time = toTime(feeds[i].created_at);
        break;
      }
    }
    fields.push({ n, name: label.trim(), value, time });
  }
  const last = feeds.at(-1);
  const lastEntryId = Number(channel.last_entry_id);
  return {
    id,
    name: typeof channel.name === 'string' ? channel.name.trim() : '',
    fields,
    lastEntryAt: last ? toTime(last.created_at) : null,
    lastEntryId: Number.isInteger(lastEntryId) && lastEntryId > 0 ? lastEntryId : null,
  };
}

/** Whether a channel got no entry for longer than `silentAfterMs` (0: never silent). */
export function isSilent(channel, now, silentAfterMs) {
  if (!channel || channel.lastEntryAt === null || silentAfterMs <= 0) {
    return false;
  }
  return now - channel.lastEntryAt > silentAfterMs;
}
