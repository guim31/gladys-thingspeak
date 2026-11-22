// -----------------------------------------------------------------------------
// Pure helpers: the configuration, the answers of ThingSpeak, the units read
// in the field names and the date of the last entry.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseChannelIds, parseReadKeys } from '../src/config.js';
import { formatEntryDate, shapeOf, unitOf } from '../src/devices.js';
import { isSilent, parseChannel, toNumber } from '../src/thingspeak/model.js';
import { FIXTURES } from './helpers/world.js';

test('channel ids: commas, spaces, URLs, duplicates, 20 at most', () => {
  assert.deepEqual(
    parseChannelIds('9, 12397;9 https://thingspeak.mathworks.com/channels/276330'),
    [9, 12397, 276330],
  );
  assert.deepEqual(parseChannelIds('abc, 0, -3'), []);
  assert.deepEqual(parseChannelIds(9), [9]);
  assert.equal(parseChannelIds(Array.from({ length: 30 }, (_, i) => i + 1).join(',')).length, 20);
});

test('read keys: one for all, channel:KEY pairs, lower case accepted, garbage flagged', () => {
  const keys = parseReadKeys('abcdefgh12345678, 42:ZZZZYYYYXXXXWWWW');
  assert.equal(keys.fallback, 'ABCDEFGH12345678');
  assert.equal(keys.byChannel.get(42), 'ZZZZYYYYXXXXWWWW');
  assert.equal(keys.invalid, false);
  assert.equal(parseReadKeys('short').invalid, true);
  const config = normalizeConfig({ channels: '9,42', read_api_keys: '42:ZZZZYYYYXXXXWWWW' });
  assert.equal(config.readKeyOf(9), null);
  assert.equal(config.readKeyOf(42), 'ZZZZYYYYXXXXWWWW');
});

test('defaults and unknown values fall back to the manifest defaults', () => {
  const config = normalizeConfig({ poll_interval: '5', silent_after: 'x', language: 'it' });
  assert.equal(config.pollIntervalMs, 120_000);
  assert.equal(config.silentAfterMs, 3600_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ write_api_key: 'nope' }).writeKeyInvalid, true);
});

test('values: strings, decimal comma, empty and text', () => {
  assert.equal(toNumber('63.68'), 63.68);
  assert.equal(toNumber('3.000000'), 3);
  assert.equal(toNumber('21,5'), 21.5);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber('12abc'), null);
});

test('a recorded channel: named fields, newest value of each, last entry', () => {
  const channel = parseChannel(276330, FIXTURES[276330]);
  assert.equal(channel.name, 'Soil Monitor');
  assert.equal(channel.fields.length, 8);
  assert.deepEqual(
    channel.fields.map((f) => f.value),
    [5, 8629, null, null, null, null, 63.68, 60],
  );
  assert.equal(channel.lastEntryAt, Date.parse('2024-12-09T22:48:23Z'));
  const empty = parseChannel(9, { channel: { name: 'x', field1: 'a' }, feeds: [] });
  assert.equal(empty.lastEntryAt, null);
  assert.equal(isSilent(empty, Date.now(), 60_000), false);
  assert.equal(isSilent(channel, channel.lastEntryAt + 61_000, 60_000), true);
  assert.equal(isSilent(channel, channel.lastEntryAt + 61_000, 0), false);
});

test('units read at the end of the field names', () => {
  assert.equal(unitOf('Temperature (°C)'), '°C');
  assert.equal(unitOf('Pressure [hPa]'), 'hPa');
  assert.equal(unitOf('Humidity %'), '%');
  assert.equal(unitOf('% Humidity'), '%');
  assert.equal(unitOf('Temp °C'), '°C');
  assert.equal(unitOf('Light A'), null);
  assert.equal(unitOf('Wind Direction (North = 0 degrees)'), null);
  assert.equal(shapeOf('Humidity (%)').definition.category, 'humidity-sensor');
  assert.equal(shapeOf('Battery (%)').definition.category, 'unknown');
  assert.equal(shapeOf('CO2 (ppm)').definition.category, 'co2-sensor');
  assert.equal(shapeOf('Speed (mph)').known, false);
});

test('the date of the last entry, in the time zone of Gladys', () => {
  const at = Date.parse('2026-11-22T23:30:00Z');
  assert.equal(formatEntryDate(at, 'Europe/Paris'), '2026-11-23 00:30');
  assert.equal(formatEntryDate(at, 'UTC'), '2026-11-22 23:30');
});
