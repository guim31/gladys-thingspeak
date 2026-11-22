// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake ThingSpeak answering the
// recorded answers: devices, states, errors, silent channels, the timer of the
// container, the scene action, the connection test and the widget.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY, TRIGGERS } from '../src/hub.js';
import {
  BASE_CONFIG,
  FakeThingSpeak,
  PRIVATE_ID,
  READ_KEY,
  RECORDED_AT,
  WRITE_KEY,
  createDevices,
  createWorld,
  deviceId,
  fieldFeatureId,
  lastEntryId,
  lastStates,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('one device per channel, one feature per named field, plus the last entry', async (t) => {
  const w = await world(t);
  const [house, station] = w.fake.discoveredDevices;
  assert.equal(house.name, 'my_house');
  assert.equal(house.external_id, deviceId(w.gladys, 9));
  assert.equal(house.should_poll, false);
  assert.deepEqual(
    house.features.map((f) => [f.name, f.category, f.type]),
    [
      ['Light', 'unknown', 'unknown'],
      ['Outside Temperature', 'unknown', 'unknown'],
      ['Last entry', 'text', 'text'],
    ],
  );
  assert.deepEqual(
    station.features.map((f) => [f.name, f.category, f.unit]),
    [
      ['Wind Direction (North = 0 degrees)', 'unknown', undefined],
      ['Wind Speed (mph)', 'unknown', undefined],
      ['% Humidity', 'humidity-sensor', 'percent'],
      ['Temperature (F)', 'temperature-sensor', 'fahrenheit'],
      ['Rain (Inches/minute)', 'unknown', undefined],
      ['Pressure ("Hg)', 'unknown', undefined],
      ['Power Level (V)', 'energy-sensor', 'volt'],
      ['Light Intensity', 'unknown', undefined],
      ['Last entry', 'text', undefined],
    ],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('nothing is published for a device not added; everything once added', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.states.length, 0);
  await createDevices(w);
  const states = lastStates(w);
  assert.equal(states[fieldFeatureId(w.gladys, 9, 2)], 39);
  assert.equal(states[fieldFeatureId(w.gladys, 12397, 6)], 30.05);
  // 10:56:16Z in Paris.
  assert.deepEqual(states[lastEntryId(w.gladys, 9)], { text: '2026-11-22 11:56' });
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
  assert.deepEqual(
    w.fake.transports.slice(-2).map((entry) => entry.transport),
    ['cloud', 'cloud'],
  );
});

test('only the changes are published, and an unchanged value again after 6 hours', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const before = w.fake.states.length;
  await w.hub.pollNow();
  assert.equal(w.fake.states.length, before);

  w.clock.advance(60_000);
  w.thingspeak.addEntry(9, { field1: '0', field2: '41' }, w.clock.now());
  await w.hub.pollNow();
  const sent = w.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.deepEqual(sent, [fieldFeatureId(w.gladys, 9, 2), lastEntryId(w.gladys, 9)]);

  w.clock.advance(6 * 3600_000);
  const at = w.fake.states.length;
  await w.hub.pollNow();
  assert.ok(w.fake.states.length - at >= 10, 'heartbeat of every value');
});

test('a field absent from the last entries: its older value once, with its date', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, channels: '276330' } });
  await createDevices(w);
  const states = lastStates(w);
  assert.equal(states[fieldFeatureId(w.gladys, 276330, 3)], 13);
  const old = w.fake.states.find(
    (s) => s.device_feature_external_id === fieldFeatureId(w.gladys, 276330, 3),
  );
  assert.equal(old.created_at, '2018-04-11T13:47:29.000Z');
  // Never repeated as a heartbeat; the never-written fields (404 -1) asked once too.
  w.clock.advance(7 * 3600_000);
  await w.hub.pollNow();
  assert.equal(
    w.fake.states.filter(
      (s) => s.device_feature_external_id === fieldFeatureId(w.gladys, 276330, 3),
    ).length,
    1,
  );
  assert.equal(states[fieldFeatureId(w.gladys, 276330, 4)], undefined);
  const asked = () => w.thingspeak.requests.filter((r) => r.url.includes('/fields/')).length;
  const first = asked();
  assert.equal(first, 4);
  await w.hub.pollNow();
  assert.equal(asked(), first);
});

test('a private channel: clean error without key, read with its key', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, channels: `9, ${PRIVATE_ID}` } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(
    w.fake.connectionStatus.message.fr,
    `Canal ${PRIVATE_ID} : canal privé : clé d’API de lecture absente ou fausse`,
  );
  assert.equal(w.fake.discoveredDevices.length, 1);
  const urls = w.thingspeak.requests.map((r) => r.url).join(' ');
  assert.doesNotMatch(urls, /api_key/);

  await w.fake.configUpdated({
    ...BASE_CONFIG,
    channels: `9, ${PRIVATE_ID}`,
    read_api_keys: `${PRIVATE_ID}:${READ_KEY.toLowerCase()}`,
  });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.discoveredDevices.length, 2);
  // The key is only sent for its channel.
  const keyed = w.thingspeak.requests.filter((r) => r.url.includes('api_key'));
  assert.ok(keyed.length > 0 && keyed.every((r) => r.url.includes(`/channels/${PRIVATE_ID}/`)));
});

test('unknown channel, unreadable key, network down, rate limit: statuses and badges', async (t) => {
  const missing = await world(t, { config: { ...BASE_CONFIG, channels: '1' } });
  assert.match(missing.fake.connectionStatus.message.en, /Channel 1: no channel with this id/);

  const badKey = await world(t, { config: { ...BASE_CONFIG, read_api_keys: 'nope' } });
  assert.match(badKey.fake.connectionStatus.message.en, /read API key is not understood/);

  const none = await world(t, { config: { language: 'en' } });
  assert.match(none.fake.connectionStatus.message.en, /Enter the ids/);

  const w = await world(t);
  await createDevices(w);
  w.thingspeak.failure = 'down';
  await w.hub.pollNow();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.de, /ThingSpeak antwortet nicht/);
  assert.deepEqual(
    w.fake.transports.slice(-2).map((entry) => entry.transport),
    ['unreachable', 'unreachable'],
  );
  // The devices stay discovered with their last read.
  assert.equal(w.fake.discoveredDevices.length, 2);

  w.thingspeak.failure = 'rate';
  await w.hub.pollNow();
  assert.match(w.fake.connectionStatus.message.en, /too many requests/);

  w.thingspeak.failure = null;
  await w.hub.pollNow();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(
    w.fake.transports.slice(-2).map((entry) => entry.transport),
    ['cloud', 'cloud'],
  );
});

test('a silent channel fires the trigger, stops sending its values, and comes back', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, channels: '9', silent_after: '15' } });
  await createDevices(w);
  assert.equal(w.fake.sceneEvents.length, 0);

  w.clock.advance(20 * 60_000);
  const before = w.fake.states.length;
  await w.hub.pollNow();
  assert.equal(w.fake.sceneEvents.length, 1);
  const [event] = w.fake.sceneEvents;
  assert.equal(event.key ?? event.trigger, TRIGGERS.CHANNEL_STATUS);
  const data = event.data ?? event;
  assert.equal(data.status, 'silent');
  assert.equal(data.device, deviceId(w.gladys, 9));
  assert.equal(data.channel_name, 'my_house');
  assert.equal(data.minutes, 21);
  assert.equal(data.status_label, 'Silent');

  // No heartbeat of the field values of a silent channel.
  w.clock.advance(7 * 3600_000);
  await w.hub.pollNow();
  const sent = w.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.ok(!sent.includes(fieldFeatureId(w.gladys, 9, 2)));

  w.thingspeak.addEntry(9, { field1: '1', field2: '38' }, w.clock.now());
  await w.hub.pollNow();
  assert.equal(w.fake.sceneEvents.length, 2);
  assert.equal((w.fake.sceneEvents[1].data ?? w.fake.sceneEvents[1]).status, 'resumed');
  assert.equal(lastStates(w)[fieldFeatureId(w.gladys, 9, 2)], 38);
});

test('the container reads on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, {
    config: { ...BASE_CONFIG, channels: '9', poll_interval: '60' },
    timers: true,
  });
  await createDevices(w);
  const before = w.thingspeak.requests.length;
  w.thingspeak.addEntry(9, { field1: '5', field2: '42' }, w.clock.now());
  t.mock.timers.tick(60_000);
  await w.hub.polling;
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(w.thingspeak.requests.length > before);
  assert.equal(lastStates(w)[fieldFeatureId(w.gladys, 9, 2)], 42);
  t.mock.timers.reset();
});

test('a normal read cycle writes nothing at info level', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const lines = [];
  const original = process.stdout.write;
  const level = process.env.LOG_LEVEL;
  t.after(() => {
    process.stdout.write = original;
    process.env.LOG_LEVEL = level;
  });
  process.stdout.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return original.call(process.stdout, '', ...rest);
  };
  w.clock.advance(60_000);
  w.thingspeak.addEntry(9, { field1: '0', field2: '44' }, w.clock.now());
  await w.hub.pollNow();
  await w.hub.pollNow();
  process.stdout.write = original;
  assert.deepEqual(
    lines.filter((line) => /info/i.test(line)),
    [],
  );
});

test('scene action: writes an entry, spaced by 15 s, decimal comma converted', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, write_api_key: WRITE_KEY } });
  const ack = await w.fake.sceneAction('publish_entry', {
    field1: '21,5',
    field3: 7,
    status: 'ok, fine',
  });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  assert.deepEqual(ack.data, { outputs: { entry_id: 43 } });
  assert.deepEqual(w.thingspeak.updates, [{ field1: '21.5', field3: '7', status: 'ok, fine' }]);
  assert.ok(!JSON.stringify(w.thingspeak.requests).includes(WRITE_KEY), 'key in the body only');

  const second = await w.fake.sceneAction('publish_entry', {
    write_key: WRITE_KEY.toLowerCase(),
    field2: '3',
  });
  assert.equal(second.success, true);
  assert.deepEqual(w.clock.sleeps, [15_000]);
});

test('scene action failures are errors, in four languages', async (t) => {
  const none = await world(t);
  const noKey = await none.fake.sceneAction('publish_entry', { field1: '1' });
  assert.equal(noKey.success, false);
  assert.match(noKey.error.fr, /Aucune clé d’API d’écriture/);

  const w = await world(t, { config: { ...BASE_CONFIG, write_api_key: WRITE_KEY } });
  const empty = await w.fake.sceneAction('publish_entry', { field1: '  ' });
  assert.equal(empty.success, false);
  assert.match(empty.error.en, /Nothing to send/);

  const bad = await w.fake.sceneAction('publish_entry', { write_key: 'short', field1: '1' });
  assert.match(bad.error.es, /no válida/);

  const long = await w.fake.sceneAction('publish_entry', { field1: 'x'.repeat(256) });
  assert.match(long.error.de, /höchstens 255/);

  const wrong = await w.fake.sceneAction('publish_entry', {
    write_key: 'AAAABBBBCCCCDDDD',
    field1: '1',
  });
  assert.equal(wrong.success, false);
  assert.match(wrong.error.fr, /ThingSpeak a refusé l’entrée/);

  w.thingspeak.failure = 'down';
  const down = await w.fake.sceneAction('publish_entry', { field1: '1' });
  assert.match(down.error.en, /does not answer/);
});

test('test the connection: a report, or an error when nothing can be read', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, write_api_key: WRITE_KEY } });
  const ok = await w.fake.action('test_connection', {});
  assert.equal(ok.success, true);
  assert.equal(
    ok.data?.message?.fr ?? ok.data?.fr ?? ok.message?.fr,
    'ThingSpeak : 2 canaux lus, 10 champs, clé d’écriture enregistrée (vérifiée au premier envoi)',
  );

  const partly = await world(t, { config: { ...BASE_CONFIG, channels: '9, 1' } });
  const report = await partly.fake.action('test_connection', {});
  assert.equal(report.success, true);

  const down = await world(t);
  down.thingspeak.failure = 'down';
  const failed = await down.fake.action('test_connection', {});
  assert.equal(failed.success, false);
  assert.match(failed.error.fr, /ThingSpeak ne répond pas/);
});

test('the widget: overview, a channel, silent and unreadable rows; within the budget', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, silent_after: '60' } });
  await createDevices(w);
  const get = async (settings, language = 'en') => {
    const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    return ack.data.content.components;
  };
  const overview = await get({}, 'fr');
  assert.deepEqual(
    overview[0].items.map((row) => [row.label, row.value, row.color]),
    [
      ['my_house', 'il y a 1 min', 'success'],
      ['WeatherStation', 'muet : 26 j', 'warning'],
    ],
  );

  const station = await get({ device: deviceId(w.gladys, 12397) });
  assert.equal(station.filter((c) => c.type === 'value').length, 6);
  assert.equal(station.length, 7);
  const ids = new Set(
    w.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  for (const tile of station.filter((c) => c.type === 'value')) {
    assert.ok(ids.has(tile.device_feature));
  }
  const hidden = await get({ device: deviceId(w.gladys, 12397), hide_status: true });
  assert.equal(hidden.length, 6);

  w.thingspeak.failure = 'down';
  await w.hub.pollNow();
  const down = await get({});
  assert.deepEqual(down[0].items[0].value, 'Unreadable');

  const gone = await get({ device: deviceId(w.gladys, 555) });
  assert.equal(gone[0].type, 'text');
});

test('a renamed device keeps its Gladys name in the widget and the events', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, channels: '9' } });
  const [device] = w.fake.discoveredDevices;
  await w.fake.deviceCreated({ ...device, name: 'Maison' });
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.data.content.components[0].items[0].label, 'Maison');
});

test('a reconnection publishes everything again', async (t) => {
  const w = await world(t, { thingspeak: new FakeThingSpeak() });
  await createDevices(w);
  const before = w.fake.states.length;
  await w.gladys.disconnect?.();
  await w.gladys.connect();
  assert.ok(w.fake.states.length > before);
  assert.ok(RECORDED_AT > 0);
});

test('a field older than the silence delay is not sent, even when the channel writes', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, channels: '9', silent_after: '15' } });
  await createDevices(w);
  // field2 last written 7 hours ago, field1 every 10 minutes since.
  w.thingspeak.addEntry(9, { field1: '1', field2: '40' }, w.clock.now());
  for (let i = 1; i <= 42; i += 1) {
    w.thingspeak.addEntry(9, { field1: String(i + 1), field2: null }, w.clock.now() + i * 600_000);
  }
  w.clock.advance(42 * 600_000 + 1000);
  const before = w.fake.states.length;
  await w.hub.pollNow();
  const sent = w.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.ok(sent.includes(fieldFeatureId(w.gladys, 9, 1)), JSON.stringify(sent));
  assert.ok(!sent.includes(fieldFeatureId(w.gladys, 9, 2)));
});

test('ThingSpeak down longer than the delay: no silent event, the widget says unreadable', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, channels: '9', silent_after: '15' } });
  w.thingspeak.failure = 'down';
  w.clock.advance(60 * 60_000);
  await w.hub.pollNow();
  assert.equal(w.fake.sceneEvents.length, 0);

  const unread = await world(t, { config: { ...BASE_CONFIG, channels: `${PRIVATE_ID}` } });
  const ack = await unread.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.deepEqual(
    ack.data.content.components[0].items.map((row) => [row.label, row.value]),
    [[`ThingSpeak ${PRIVATE_ID}`, 'Unreadable']],
  );
});

test('a fourth entry waiting on the same key is refused, not written after a timeout', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, write_api_key: WRITE_KEY } });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  w.hub.sleep = () => gate;
  w.hub.writes.set(WRITE_KEY, { last: w.clock.now(), queue: Promise.resolve(), waiting: 0 });
  const pending = [1, 2, 3].map((n) => w.fake.sceneAction('publish_entry', { field1: String(n) }));
  await new Promise((resolve) => setImmediate(resolve));
  const fourth = await w.fake.sceneAction('publish_entry', { field1: '4' });
  assert.equal(fourth.success, false);
  assert.match(fourth.error.en, /Three entries are already waiting/);
  release();
  const acks = await Promise.all(pending);
  assert.ok(acks.every((ack) => ack.success));
  assert.equal(w.thingspeak.updates.length, 3);
});
