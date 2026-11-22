// -----------------------------------------------------------------------------
// ThingSpeak channels -> Gladys devices, proposed in the Discovery tab: one
// device per configured channel, one feature per named field, plus the date of
// the last entry. The user adds the devices to follow.
//
// Identity: the channel id, and the field number (1 to 8): both permanent in
// ThingSpeak. Renaming a field keeps its feature.
//
// Units: ThingSpeak has none. The user chooses one by ending the field name
// with it, the way most channels already do: "Temperature (°C)",
// "Pressure [hPa]", "Humidity %". A unit Gladys knows gives the matching
// category/type couple (test/gladys-rules.test.js holds them to the core
// table); any other name gives a generic sensor without unit, nothing invented.
//
// Published with should_poll: false: the integration reads ThingSpeak on its
// own timer (src/hub.js), a minute or more apart.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { FEATURE_TEXT, pick } from './texts.js';

export const DEVICE_TYPE = 'channel';
export const MODEL = 'ThingSpeak';

/** Feature keys: permanent once published. */
export const fieldKey = (n) => `field_${n}`;
export const LAST_ENTRY_KEY = 'last_entry';

/** External ids of the device of a channel. */
export const deviceIds = (gladys, channelId) => gladys.externalIds(DEVICE_TYPE, String(channelId));

/** The channel id of a device external id, null when not ours. */
export function parseDeviceId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^[1-9]\d{0,8}$/.test(id) ? Number(id) : null;
}

const BIG = 1e9;

const kind = (category, type, unit, min, max, digits) => ({
  definition: { category, type, ...(unit ? { unit } : {}), min, max },
  digits,
});

const temperature = (unit, min, max) =>
  kind(CATEGORY.TEMPERATURE_SENSOR, TYPE.SENSOR.DECIMAL, unit, min, max, 2);
const pressure = (unit, max, digits) =>
  kind(CATEGORY.PRESSURE_SENSOR, TYPE.SENSOR.DECIMAL, unit, 0, max, digits);
const generic = (unit, min, max, digits) =>
  kind(CATEGORY.UNKNOWN, TYPE.UNKNOWN.UNKNOWN, unit, min, max, digits);

/**
 * The Gladys shape of each unit, keyed by the unit as written at the end of a
 * field name (lower case, spaces removed).
 */
const UNITS = {
  '°c': temperature(UNIT.CELSIUS, -100, 150),
  c: temperature(UNIT.CELSIUS, -100, 150),
  degc: temperature(UNIT.CELSIUS, -100, 150),
  celsius: temperature(UNIT.CELSIUS, -100, 150),
  '°f': temperature(UNIT.FAHRENHEIT, -150, 300),
  f: temperature(UNIT.FAHRENHEIT, -150, 300),
  degf: temperature(UNIT.FAHRENHEIT, -150, 300),
  fahrenheit: temperature(UNIT.FAHRENHEIT, -150, 300),
  '%': generic(UNIT.PERCENT, 0, 100, 2),
  '%rh': kind(CATEGORY.HUMIDITY_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.PERCENT, 0, 100, 1),
  hpa: pressure(UNIT.HECTO_PASCAL, 2000, 2),
  mbar: pressure(UNIT.MILLIBAR, 2000, 2),
  pa: pressure(UNIT.PASCAL, 200_000, 0),
  kpa: pressure(UNIT.KILO_PASCAL, 2000, 3),
  bar: pressure(UNIT.BAR, 100, 3),
  psi: pressure(UNIT.PSI, 1500, 2),
  lux: kind(CATEGORY.LIGHT_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.LUX, 0, 200_000, 1),
  lx: kind(CATEGORY.LIGHT_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.LUX, 0, 200_000, 1),
  v: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.VOLTAGE, UNIT.VOLT, -1000, 1000, 3),
  w: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.POWER, UNIT.WATT, -BIG, BIG, 2),
  kw: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.POWER, UNIT.KILOWATT, -BIG, BIG, 3),
  a: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.CURRENT, UNIT.AMPERE, -1000, 1000, 3),
  kwh: kind(CATEGORY.ENERGY_SENSOR, TYPE.ENERGY_SENSOR.ENERGY, UNIT.KILOWATT_HOUR, 0, BIG, 3),
  ppm: generic(UNIT.PPM, 0, 1_000_000, 1),
  'm/s': kind(CATEGORY.SPEED_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.METER_PER_SECOND, 0, 500, 2),
  'km/h': kind(CATEGORY.SPEED_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.KILOMETER_PER_HOUR, 0, 1000, 2),
  'mm/h': kind(
    CATEGORY.PRECIPITATION_SENSOR,
    TYPE.SENSOR.DECIMAL,
    UNIT.MILLIMETER_PER_HOUR,
    0,
    1000,
    2,
  ),
  db: generic(UNIT.DECIBEL, -200, 200, 1),
};

/** The units with a Gladys shape (as keyed: lower case, no space). */
export const KNOWN_UNITS = Object.freeze(Object.keys(UNITS));

// A field without a unit, or with a unit Gladys has no type for.
const UNKNOWN = generic(undefined, -BIG, BIG, 4);

/**
 * The unit written at the end of a field name: in brackets ("Wind (km/h)",
 * "Temp [°C]") or after the last space ("Temp °C", "Humidity %"), or a leading
 * "%" ("% Humidity"). Null when none.
 */
export function unitOf(name) {
  if (typeof name !== 'string') {
    return null;
  }
  const text = name.trim();
  const bracket = text.match(/[([]\s*([^()[\]]{1,12}?)\s*[)\]]$/);
  if (bracket) {
    return bracket[1];
  }
  // Without brackets, only an unambiguous symbol: "Light A" is not amperes.
  const tail = text.match(/\s(%|°[CF]|hPa|mbar|lux|ppm|kWh|kW|km\/h|m\/s|mm\/h|dB)$/);
  if (tail) {
    return tail[1];
  }
  return /^%\s/.test(text) ? '%' : null;
}

const unitKey = (unit) => (typeof unit === 'string' ? unit.replace(/\s+/g, '').toLowerCase() : '');

/** The Gladys shape of a field, from its name. */
export function shapeOf(name) {
  const unit = unitOf(name);
  let key = unitKey(unit);
  // "Humidity (%)", "% Humidity": a humidity sensor, a plain % otherwise.
  if (key === '%' && /humid|feucht|humed|\brh\b/i.test(name)) {
    key = '%rh';
  }
  const shape = UNITS[key];
  // ppm of CO2: the CO2 sensor of Gladys.
  if (key === 'ppm' && /co2|co₂/i.test(name)) {
    return {
      ...kind(CATEGORY.CO2_SENSOR, TYPE.SENSOR.DECIMAL, UNIT.PPM, 0, 100_000, 0),
      known: true,
    };
  }
  return shape ? { ...shape, known: true } : { ...UNKNOWN, known: false };
}

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** The value of a field as published in Gladys (rounded), null when none. */
export function gladysValue(field) {
  if (field.value === null || field.value === undefined) {
    return null;
  }
  return round(field.value, shapeOf(field.name).digits);
}

/** The device name of a channel: its ThingSpeak name, or its id. */
export const channelName = (channel) => (channel.name || `ThingSpeak ${channel.id}`).slice(0, 255);

/** The features of a channel, with names made distinct on the device. */
export function featuresOf(gladys, channel, language) {
  const ids = deviceIds(gladys, channel.id);
  const lastEntryName = pick(FEATURE_TEXT.lastEntry, language);
  const taken = new Set([lastEntryName]);
  const features = channel.fields.map((field) => {
    let name = field.name.slice(0, 80);
    if (taken.has(name)) {
      name = `${name} #${field.n}`;
    }
    taken.add(name);
    return {
      name,
      external_id: ids.feature(fieldKey(field.n)),
      ...shapeOf(field.name).definition,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    };
  });
  features.push({
    name: lastEntryName,
    external_id: ids.feature(LAST_ENTRY_KEY),
    category: CATEGORY.TEXT,
    type: TYPE.TEXT.TEXT,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  });
  return features;
}

/**
 * The discovery payload of the device of a channel.
 * @param {object} gladys SDK client
 * @param {object} channel src/thingspeak/model.js parseChannel
 * @param {string} language of the feature names produced here
 */
export function buildDevice(gladys, channel, language) {
  return {
    name: channelName(channel),
    external_id: deviceIds(gladys, channel.id).device,
    model: MODEL,
    should_poll: false,
    features: featuresOf(gladys, channel, language),
  };
}

/**
 * The date of the last entry as shown in Gladys: `YYYY-MM-DD HH:mm`, in the
 * time zone of Gladys (TZ, set by the supervisor).
 */
export function formatEntryDate(time, timeZone = process.env.TZ || undefined) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
