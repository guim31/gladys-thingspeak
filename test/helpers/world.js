// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake ThingSpeak and a manual
// clock, with the integration wired on top through registerHandlers. No timer
// runs unless `timers` is set: the tests read ThingSpeak with
// `world.hub.pollNow()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { LAST_ENTRY_KEY, deviceIds, fieldKey } from '../../src/devices.js';
import {
  FakeThingSpeak,
  FIXTURES,
  PRIVATE_ID,
  READ_KEY,
  RECORDED_AT,
  WRITE_KEY,
} from './fakeThingSpeak.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';
// Dates of the last entry, in a fixed zone.
process.env.TZ = 'Europe/Paris';

/** A manual clock, shared by the hub and the tests: a minute after the recorded entry. */
export function createClock(start = RECORDED_AT + 60_000) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
    // The sleep seam of the hub: time passes at once.
    sleep: async (ms) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
    sleeps: [],
  };
  return clock;
}

export const BASE_CONFIG = {
  channels: '9, 12397',
  silent_after: '0',
  language: 'en',
};

export async function createWorld({
  clock = createClock(),
  thingspeak = new FakeThingSpeak(),
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    request: thingspeak.request,
    timers,
    timings,
    now: clock.now,
    sleep: clock.sleep,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, thingspeak, app, hub: app.hub, clock };
}

export const deviceId = (gladys, channelId) => deviceIds(gladys, channelId).device;
export const fieldFeatureId = (gladys, channelId, n) =>
  deviceIds(gladys, channelId).feature(fieldKey(n));
export const lastEntryId = (gladys, channelId) =>
  deviceIds(gladys, channelId).feature(LAST_ENTRY_KEY);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

/** The states published so far, as { external id: last value }. */
export function lastStates(world) {
  const states = {};
  for (const state of world.fake.states) {
    states[state.device_feature_external_id] =
      state.text === undefined ? state.state : { text: state.text };
  }
  return states;
}

export { FakeThingSpeak, FIXTURES, PRIVATE_ID, READ_KEY, RECORDED_AT, WRITE_KEY };
