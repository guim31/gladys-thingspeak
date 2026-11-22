// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of ThingSpeak (test/fixtures/thingspeak/: channels 9, 12397 and
// 276330, the last one with fields never written lately), a private channel,
// and a channel whose field names end with every unit the integration knows,
// units it does not know, and two fields of the same name.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KNOWN_UNITS } from '../src/devices.js';
import { FakeThingSpeak, PRIVATE_ID, READ_KEY, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const UNITS_CHANNEL = 4242;
const ODD_CHANNEL = 4243;

function thingspeak() {
  const fake = new FakeThingSpeak();
  // Eight fields at most per channel: the known units over several channels.
  const names = [
    ...KNOWN_UNITS.map((unit) => `Unit (${unit})`),
    'Humidity (%)',
    '% Humidity',
    'CO2 (ppm)',
    'Temperature °C',
    'Pressure hPa',
  ];
  const ids = [];
  for (let at = 0; at < names.length; at += 8) {
    const id = UNITS_CHANNEL + 10 + at / 8;
    ids.push(id);
    const channel = { id, name: `Units ${at / 8}`, last_entry_id: 1 };
    const entry = { created_at: '2026-11-22T10:00:00Z', entry_id: 1 };
    names.slice(at, at + 8).forEach((name, index) => {
      channel[`field${index + 1}`] = name;
      entry[`field${index + 1}`] = '12.5';
    });
    fake.channels[id] = { channel, feeds: [entry] };
  }
  fake.channels[ODD_CHANNEL] = {
    channel: {
      id: ODD_CHANNEL,
      name: '',
      field1: 'Speed (mph)',
      field2: 'Speed (mph)',
      field3: 'Rain (Inches/minute)',
      field4: 'Light A',
      field5: 'Last entry',
      last_entry_id: 1,
    },
    feeds: [{ created_at: '2026-11-22T10:00:00Z', entry_id: 1, field1: 'abc', field2: '' }],
  };
  return { fake, ids };
}

async function discover(language) {
  const { fake, ids } = thingspeak();
  const world = await createWorld({
    thingspeak: fake,
    config: {
      channels: ['9', '12397', '276330', PRIVATE_ID, ODD_CHANNEL, ...ids].join(','),
      read_api_keys: `${PRIVATE_ID}:${READ_KEY}`,
      language,
    },
  });
  await world.app.stop();
  return { devices: world.fake.discoveredDevices, ids };
}

test('the fixtures cover real channels, a private one, every known unit and odd names', async () => {
  const { devices, ids } = await discover('en');
  assert.deepEqual(devices.map((device) => device.name).slice(0, 5), [
    'my_house',
    'WeatherStation',
    'Soil Monitor',
    'Private greenhouse',
    `ThingSpeak ${ODD_CHANNEL}`,
  ]);
  const units = devices.slice(5).flatMap((device) => device.features);
  assert.equal(units.length, KNOWN_UNITS.length + 5 + ids.length);
});

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every discovered device follows the Gladys rules (${language})`, async () => {
    const { devices } = await discover(language);
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          const allowed = table.units_by_category[feature.category];
          if (allowed) {
            assert.ok(
              allowed.includes(feature.unit),
              `${at}: ${feature.unit} in ${feature.category}`,
            );
          }
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
