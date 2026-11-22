// -----------------------------------------------------------------------------
// The ThingSpeak hub: reads the configured channels on a timer of the
// container (1 to 15 minutes, 2 by default), one request per channel and per
// cycle, and turns them into devices, states, scene events and the connection
// status. It also writes entries for the scene action.
//
// Gladys never polls these devices (should_poll: false): the cadence is above
// the minute, outside the poll frequencies of the core, and the scene events
// must fire for every channel, added to Gladys or not.
//
// States: only the devices added are published, only what changed (rounded).
// An unchanged value is sent again after 6 hours, before the core marks it
// outdated, but only while the channel still gets entries: the last value of
// a silent channel is never presented as a fresh one.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { ThingSpeakClient, ERROR_KINDS } from './thingspeak/client.js';
import { isSilent, parseChannel } from './thingspeak/model.js';
import { readSignature } from './config.js';
import {
  LAST_ENTRY_KEY,
  buildDevice,
  channelName,
  deviceIds,
  fieldKey,
  formatEntryDate,
  gladysValue,
  parseDeviceId,
} from './devices.js';
import { ActionFailure } from './failure.js';
import { createIssueLog } from './logs.js';
import {
  ACTION_TEXT,
  CHANNEL_LABEL,
  CHANNEL_STATUS_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  INIT_FAILED,
  REPORT_TEXT,
  each,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'thingspeak-hub' });

export const WIDGET_KEY = 'channels';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  CHANNEL_STATUS: 'channel_status_changed',
});

export const CHANNEL_STATUS = Object.freeze({ SILENT: 'silent', RESUMED: 'resumed' });

export const HUB_TIMINGS = {
  // An unchanged value is sent again after this long.
  heartbeatMs: 6 * 3600_000,
  // ThingSpeak free plan: one entry every 15 s per channel.
  updateSpacingMs: 15_000,
};

// Scene action fields sent to ThingSpeak as typed.
export const WRITE_FIELDS = [
  'field1',
  'field2',
  'field3',
  'field4',
  'field5',
  'field6',
  'field7',
  'field8',
  'status',
];

const MAX_PER_REQUEST = 100;

// Entries of one write key waiting at most (15 s apart, 60 s of action timeout).
export const MAX_WAITING = 3;

const defaultSleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class ThingSpeakHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/thingspeak/client.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep] waits between two entries
   */
  constructor({ gladys, request, timers = true, timings, now, sleep }) {
    this.gladys = gladys;
    this.client = new ThingSpeakClient({ request });
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.sleep = sleep ?? defaultSleep;
    this.config = null;
    this.signature = null;
    /** By channel id: { data (parseChannel, last good read), error ({ kind } or null) }. */
    this.channels = new Map();
    /** Values of the fields absent from the last entries, read once: `${id}:${n}` -> { value, time }. */
    this.older = new Map();
    /** Whether each channel was silent at the last read, by id. */
    this.silent = new Map();
    this.readAt = 0;
    this.polling = null;
    this.published = new Map();
    this.publishedAt = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.pollTimer = null;
    this.stopped = false;
    /** Per write key: the time of the last entry, and the queue of the entries. */
    this.writes = new Map();
    this.issues = createIssueLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.publishedAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    // A read in progress belongs to the previous configuration: let it end.
    await this.polling?.catch(() => {});
    const previous = this.config;
    this.config = config;
    if (this.signature !== readSignature(config)) {
      this.signature = readSignature(config);
      this.channels.clear();
      this.older.clear();
      this.silent.clear();
      this.readAt = 0;
    }
    // Another delay is another rule: the next read only records, like a first
    // read, instead of firing every channel it moves across the delay.
    if (previous && previous.silentAfterMs !== config.silentAfterMs) {
      this.silent.clear();
    }
    if (previous?.language !== config.language) {
      this.discovered = null;
    }
    await this.pollNow({ publish: true });
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.polling?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.config?.channelIds.length) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.issues.ok('poll', 'Polling works again');
      } catch (err) {
        this.issues.fail('poll', 'error', 'Poll failed', err);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Identities --------------------------------------------------------------

  /** The channel ids of the devices the user added. */
  createdIds() {
    const ids = new Set();
    for (const device of this.gladys.devices ?? []) {
      const id = parseDeviceId(this.gladys, device.external_id);
      if (id !== null) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** The channels read at least once, in the order of the configuration. */
  readChannels() {
    return (this.config?.channelIds ?? []).map((id) => this.channels.get(id)?.data).filter(Boolean);
  }

  isChannelSilent(channel) {
    return isSilent(channel, this.now(), this.config.silentAfterMs);
  }

  /** The name of a channel device in Gladys (the user may rename it), else ThingSpeak's. */
  nameOf(channel) {
    const externalId = deviceIds(this.gladys, channel.id).device;
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    return device?.name || channelName(channel);
  }

  // --- Devices -------------------------------------------------------------------

  async publishDevices({ force = false } = {}) {
    // Nothing read yet (a first read failed): keep the list Gladys has.
    const channels = this.readChannels();
    if (channels.length === 0 && this.readAt === 0) {
      return;
    }
    const devices = channels.map((channel) =>
      buildDevice(this.gladys, channel, this.config.language),
    );
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.issues.ok('discovery', 'Discovered devices accepted again');
    } catch (err) {
      this.issues.fail('discovery', 'warn', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read ThingSpeak, publish the list again. */
  async rediscover() {
    await this.pollNow();
    await this.publishDevices({ force: true });
  }

  /** Gladys asks for a refresh (onPoll): read again unless a read is recent. */
  async pollDevice() {
    if (this.now() - this.readAt >= (this.config?.pollIntervalMs ?? 0) / 2) {
      await this.pollNow();
    }
  }

  /** The user added (or updated) a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const id = parseDeviceId(this.gladys, device?.external_id);
    const channel = id === null ? null : this.channels.get(id)?.data;
    if (!channel) {
      return;
    }
    this.transports.delete(device.external_id);
    await this.sendStates([channel], { force: true });
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** The user deleted a device: forget what was sent for it. */
  onDeviceDeleted(device) {
    const id = device?.external_id;
    if (typeof id !== 'string') {
      return;
    }
    this.transports.delete(id);
    for (const map of [this.published, this.publishedAt]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${id}:`)) {
          map.delete(key);
        }
      }
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading ThingSpeak ----------------------------------------------------------

  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  poll() {
    this.polling ??= this.read().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** @returns {Promise<boolean>} whether the widget should be refreshed */
  async read() {
    const config = this.config;
    if (!config?.channelIds.length) {
      return false;
    }
    let changed = this.readAt === 0;
    for (const id of config.channelIds) {
      if (await this.readChannel(id, config)) {
        changed = true;
      }
    }
    if (this.config !== config) {
      return false; // reconfigured during the read
    }
    this.readAt = this.now();
    if (await this.compareSilent()) {
      changed = true;
    }
    await this.sendStates(this.readChannels());
    return changed;
  }

  /** Read one channel; returns whether its error state changed. */
  async readChannel(id, config) {
    const entry = this.channels.get(id) ?? { data: null, error: null };
    const before = entry.error?.kind ?? null;
    const firstRead = entry.data === null;
    const readKey = config.readKeyOf(id);
    try {
      const data = parseChannel(id, await this.client.channel(id, readKey));
      await this.fillOlderValues(data, readKey);
      entry.data = data;
      entry.error = null;
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      entry.error = { kind: err.kind, message: err.message };
    }
    if (this.config !== config) {
      return false;
    }
    this.channels.set(id, entry);
    const after = entry.error?.kind ?? null;
    if (after !== before) {
      if (after) {
        logger.warn(`Channel ${id}: ${entry.error.message}`);
      } else {
        logger.info(`Channel ${id} answers again`);
      }
      return true;
    }
    if (after) {
      logger.debug(`Channel ${id}: ${entry.error.message}`);
    } else if (firstRead) {
      logger.info(`Channel ${id} read: ${entry.data.fields.length} fields`);
    }
    return false;
  }

  /**
   * A field written less often than the others may have no value in the last
   * entries: its last value is asked once (per configuration), then kept until
   * a newer one appears in the entries.
   */
  async fillOlderValues(channel, readKey) {
    for (const field of channel.fields) {
      const key = `${channel.id}:${field.n}`;
      const older = this.older.get(key);
      if (field.value !== null) {
        if (older) {
          this.older.delete(key);
        }
        continue;
      }
      if (older === undefined) {
        try {
          const answer = await this.client.lastFieldValue(channel.id, field.n, readKey);
          const parsed = parseChannel(channel.id, {
            channel: { [`field${field.n}`]: field.name },
            feeds: answer ? [answer] : [],
          }).fields[0];
          this.older.set(key, { value: parsed.value, time: parsed.time });
        } catch (err) {
          if (!err.kind) {
            throw err;
          }
          continue; // asked again at the next read
        }
      }
      const known = this.older.get(key);
      field.value = known.value;
      field.time = known.time;
      field.older = true;
    }
  }

  /** Fire the channels that went silent or got entries again since the last read. */
  async compareSilent() {
    let changed = false;
    const present = new Set();
    for (const channel of this.readChannels()) {
      present.add(channel.id);
      // Unreadable (ThingSpeak or the network down): no verdict on its sensors.
      if (this.channels.get(channel.id)?.error) {
        continue;
      }
      const silent = this.isChannelSilent(channel);
      const before = this.silent.get(channel.id);
      this.silent.set(channel.id, silent);
      if (before === undefined || before === silent) {
        continue;
      }
      changed = true;
      const status = silent ? CHANNEL_STATUS.SILENT : CHANNEL_STATUS.RESUMED;
      logger.debug(`Channel ${channel.id} ${status}`);
      await this.fireEvent(TRIGGERS.CHANNEL_STATUS, {
        device: deviceIds(this.gladys, channel.id).device,
        status,
        channel_id: channel.id,
        channel_name: this.nameOf(channel),
        status_label: pick(CHANNEL_STATUS_TEXT[status], this.config.language),
        minutes: Math.round((this.now() - channel.lastEntryAt) / 60_000),
      });
    }
    for (const id of [...this.silent.keys()]) {
      if (!present.has(id)) {
        this.silent.delete(id);
      }
    }
    return changed;
  }

  async fireEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.issues.ok('scene', 'Scene events accepted again');
    } catch (err) {
      this.issues.fail('scene', 'warn', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  /** The states of a channel: its field values (not when silent), the last entry date. */
  statesOf(channel) {
    const ids = deviceIds(this.gladys, channel.id);
    const states = [];
    const now = this.now();
    const { silentAfterMs } = this.config;
    if (!this.isChannelSilent(channel)) {
      for (const field of channel.fields) {
        const value = gladysValue(field);
        if (value === null) {
          continue;
        }
        const externalId = ids.feature(fieldKey(field.n));
        if (field.older) {
          // A value older than the last entries (years, sometimes): sent once
          // with its own date, never as a fresh one, never repeated.
          if (field.time !== null) {
            states.push({
              externalId,
              value: { state: value, created_at: new Date(field.time).toISOString() },
              once: true,
            });
          }
        } else if (silentAfterMs <= 0 || field.time === null || now - field.time <= silentAfterMs) {
          states.push({ externalId, value });
        }
      }
    }
    if (channel.lastEntryAt !== null) {
      states.push({
        externalId: ids.feature(LAST_ENTRY_KEY),
        value: { text: formatEntryDate(channel.lastEntryAt) },
      });
    }
    return states;
  }

  async sendStates(channels, { force = false } = {}) {
    const created = this.createdIds();
    const now = this.now();
    const due = [];
    for (const channel of channels) {
      if (!created.has(channel.id)) {
        continue;
      }
      for (const { externalId, value, once } of this.statesOf(channel)) {
        const key = JSON.stringify(value);
        const at = this.publishedAt.get(externalId);
        const same = this.published.get(externalId) === key;
        if (same && once) {
          continue;
        }
        if (!force && same && at !== undefined && now - at < this.timings.heartbeatMs) {
          continue;
        }
        due.push({ externalId, value, key });
      }
    }
    for (let at = 0; at < due.length; at += MAX_PER_REQUEST) {
      const batch = due.slice(at, at + MAX_PER_REQUEST);
      try {
        await this.gladys.publishStates(
          batch.map(({ externalId, value }) =>
            typeof value === 'object'
              ? { device_feature_external_id: externalId, ...value }
              : { device_feature_external_id: externalId, state: value },
          ),
        );
        for (const { externalId, key } of batch) {
          this.published.set(externalId, key);
          this.publishedAt.set(externalId, now);
        }
        this.issues.ok('states', 'States accepted again');
      } catch (err) {
        this.issues.fail('states', 'warn', `States refused: ${err.message}`);
      }
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: cloud, or unreachable. */
  async publishTransports() {
    const created = this.createdIds();
    const entries = [];
    for (const [id, entry] of this.channels) {
      if (!entry.data || !created.has(id)) {
        continue;
      }
      const externalId = deviceIds(this.gladys, id).device;
      const transport = entry.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.CLOUD;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.issues.ok('transports', 'Transports accepted again');
      } catch (err) {
        this.issues.fail('transports', 'warn', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The first failing channel, or null. */
  firstError() {
    for (const id of this.config?.channelIds ?? []) {
      const error = this.channels.get(id)?.error;
      if (error) {
        return { id, kind: error.kind };
      }
    }
    return null;
  }

  /** The status under the integration name. */
  connectionStatus() {
    const config = this.config;
    if (!config?.channelIds.length) {
      return { connected: false, message: CONNECTION_TEXT.noChannels };
    }
    if (config.readKeys.invalid) {
      return { connected: false, message: CONNECTION_TEXT.invalidKey };
    }
    const error = this.firstError();
    if (error) {
      return {
        connected: false,
        message: each((language) =>
          labelled(CHANNEL_LABEL[language](error.id), ERROR_TEXT[error.kind][language], language),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.issues.ok('connection', 'Connection status accepted again');
    } catch (err) {
      this.issues.fail('connection', 'warn', `Connection status refused: ${err.message}`);
    }
  }

  // --- Actions -------------------------------------------------------------------------

  /** "Test the connection": read every channel now, one report. */
  async testConnection() {
    if (!this.config) {
      throw new ActionFailure(INIT_FAILED);
    }
    await this.pollNow({ publish: true });
    const status = this.connectionStatus();
    const ids = this.config.channelIds;
    const read = ids.filter((id) => this.channels.get(id)?.data && !this.channels.get(id).error);
    if (!ids.length || this.config.readKeys.invalid || read.length === 0) {
      throw new ActionFailure(status.message);
    }
    const failed = ids.length - read.length;
    const fields = read.reduce((sum, id) => sum + this.channels.get(id).data.fields.length, 0);
    const write = this.config.writeKey
      ? 'writeKey'
      : this.config.writeKeyInvalid
        ? 'badWriteKey'
        : 'noWriteKey';
    logger.info(`Connection test: ${read.length}/${ids.length} channels read, ${write}`);
    return each((language) => {
      const text = REPORT_TEXT[language];
      const parts = [
        text.channels(read.length),
        text.fields(fields),
        ...(failed ? [text.failed(failed)] : []),
        text[write],
      ];
      const report = labelled('ThingSpeak', parts.join(', '), language);
      return failed ? `${report}. ${status.message[language]}` : report;
    });
  }

  /**
   * Scene action: write one entry. Entries of the same write key are queued
   * and spaced by 15 s, the limit of the free plan: a scene firing twice in a
   * row waits instead of being refused.
   */
  async publishEntry(fields = {}) {
    const typedKey = typeof fields.write_key === 'string' ? fields.write_key.trim() : '';
    let writeKey;
    if (typedKey) {
      writeKey = /^[A-Za-z0-9]{16}$/.test(typedKey) ? typedKey.toUpperCase() : null;
      if (!writeKey) {
        throw new ActionFailure(ACTION_TEXT.badWriteKey);
      }
    } else if (this.config?.writeKey) {
      writeKey = this.config.writeKey;
    } else {
      throw new ActionFailure(
        this.config?.writeKeyInvalid ? ACTION_TEXT.badWriteKey : ACTION_TEXT.noWriteKey,
      );
    }
    const values = {};
    for (const key of WRITE_FIELDS) {
      const raw = fields[key];
      const text =
        typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
      if (text === '') {
        continue;
      }
      if (text.length > 255) {
        throw new ActionFailure(ACTION_TEXT.tooLong);
      }
      // "21,5" typed in a French scene is the number 21.5 for ThingSpeak charts.
      values[key] = key !== 'status' && /^[+-]?\d+,\d+$/.test(text) ? text.replace(',', '.') : text;
    }
    if (Object.keys(values).length === 0) {
      throw new ActionFailure(ACTION_TEXT.noValue);
    }

    const slot = this.writes.get(writeKey) ?? { last: 0, queue: Promise.resolve(), waiting: 0 };
    this.writes.set(writeKey, slot);
    // Past three entries waiting, the last one would outlive the action
    // timeout (60 s): refused rather than written after a red timeout.
    if (slot.waiting >= MAX_WAITING) {
      throw new ActionFailure(ACTION_TEXT.queueFull);
    }
    slot.waiting += 1;
    const run = slot.queue.then(async () => {
      const wait = slot.last + this.timings.updateSpacingMs - this.now();
      if (wait > 0) {
        await this.sleep(wait);
      }
      try {
        return await this.client.update(writeKey, values);
      } finally {
        slot.last = this.now();
      }
    });
    slot.queue = run.catch(() => {});
    run.then(
      () => (slot.waiting -= 1),
      () => (slot.waiting -= 1),
    );
    let entryId;
    try {
      entryId = await run;
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      throw new ActionFailure(ERROR_TEXT[err.kind]);
    }
    if (entryId === null) {
      logger.info('Entry refused by ThingSpeak');
      throw new ActionFailure(ACTION_TEXT.refused);
    }
    logger.info(`Entry ${entryId} written to ThingSpeak`);
    return { entry_id: entryId };
  }

  // --- Views (widget) -------------------------------------------------------------------

  /** What the widget shows of a channel. */
  view(id) {
    const entry = this.channels.get(id);
    if (entry?.error && !entry.data) {
      return {
        id,
        name: `ThingSpeak ${id}`,
        error: entry.error.kind,
        silent: false,
        ageMs: null,
        fields: [],
      };
    }
    if (!entry?.data) {
      return null;
    }
    const channel = entry.data;
    const ids = deviceIds(this.gladys, id);
    return {
      id,
      name: this.nameOf(channel),
      error: entry.error?.kind ?? null,
      silent: this.isChannelSilent(channel),
      ageMs: channel.lastEntryAt === null ? null : this.now() - channel.lastEntryAt,
      fields: channel.fields.map((field) => ({
        field,
        externalId: ids.feature(fieldKey(field.n)),
      })),
    };
  }
}

export { ERROR_KINDS };
