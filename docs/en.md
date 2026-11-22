# ThingSpeak

This integration brings your [ThingSpeak](https://thingspeak.mathworks.com) channels into Gladys: every channel becomes a device, every named field a sensor, with the date of the last entry. Your scenes can also write entries to a channel, like the Home Assistant ThingSpeak integration.

Tested against the real ThingSpeak API (public channels 9, 12397 and 276330, a private channel read without its key, network cut). Writing entries was tested against a local fake server only: writing is not tested against ThingSpeak itself, feedback welcome on [GitHub](https://github.com/guim31/gladys-thingspeak/issues).

## What you need

- Gladys 5.1 or later, with Internet access.
- The id of each channel to follow (**Channel ID** on the channel page). A public channel needs nothing else.
- For a private channel, its **Read API Key** (channel page, **API Keys** tab).
- To write from scenes, the **Write API Key** of the channel.

## Getting started

### 1. Name your fields with their unit

ThingSpeak has no unit. Gladys reads it at the end of the field name, in brackets or after a space: `Temperature (°C)`, `Pressure [hPa]`, `Humidity %`, `Power (W)`. Units understood: °C, °F, %, hPa, mbar, Pa, kPa, bar, psi, lux, V, W, kW, A, kWh, ppm, m/s, km/h, mm/h, dB. A % field whose name says humidity becomes a humidity sensor, a ppm field whose name says CO2 a CO2 sensor. Any other field becomes a generic sensor, without unit.

### 2. Configure the integration

- **Channel ids**: the ids separated by commas, e.g. `9, 12397` (20 at most). A channel URL works too.
- **Read API keys (private channels)**: empty for public channels. One key used for every channel, or `channel:KEY` pairs separated by commas, e.g. `1234567:ABCD1234EFGH5678`.
- **Write API key (optional)**: the key the scene action uses when it has none of its own.
- **Refresh interval**: from 1 to 15 minutes, 2 by default. One request per channel and per refresh.
- **Channel silent after**: a channel without a new entry for this long counts as silent (see Scenes). **Never** turns it off.
- **Language of the messages**: language of the feature names, of the scene variables and of the errors.

**Test the connection** reads every channel at once and tells how many channels and fields were read, or why a channel cannot be read.

### 3. Add the devices

Open the **Discover** tab of the integration and add the channels you want. A field created later appears after **Update** in the same tab.

## The devices

- One device per channel, named like the channel. One feature per named field, plus **Last entry** (date and time of the last entry, in the time zone of Gladys).
- A field keeps the newest value found in the last 100 entries. A field written less often gets its last value, asked once and sent once with its own date, never as a fresh one. A field whose last value is older than the silence delay is not sent.
- Only changes are sent to Gladys, and an unchanged value again every 6 hours while the channel still gets entries. The values of a silent channel are no longer sent: Gladys shows them as outdated instead of fresh.
- Latitude, longitude and elevation of the channel are ignored.

## Dashboard

The **ThingSpeak channels** widget:

- without a device chosen, one row per channel with the time since its last entry, orange when silent, red when it cannot be read;
- with a device chosen, its first six fields as live tiles, then the row of the last entry. **Hide the last entry row** removes that row.

## Scenes

### Triggers

**ThingSpeak channel silent or back**: a channel got no entry for the configured delay (a sensor stopped writing), or gets entries again. Filters: the device, the change (silent, updating again). Variables: the channel, its id, the state and the minutes since the last entry.

### Actions

**Publish to ThingSpeak**: writes one entry, with values in **Field 1** to **Field 8** and the **Status**. Empty fields are not sent. A value can come from a previous action, e.g. a temperature read from another device. The write key identifies the channel: leave the key field empty to use the configured one. A decimal comma (`21,5`) is sent as a point. The action returns the entry id.

The free plan accepts one entry every 15 seconds per channel: the integration waits when two entries follow too closely, instead of having the second one refused.

### Scene ideas

- Every 10 minutes, publish the temperature of a Gladys sensor to a public channel to chart it on ThingSpeak.
- Get a message when the channel of your weather station has been silent for an hour.

## Troubleshooting

- **private channel: read API key missing or wrong**: add the Read API Key of this channel.
- **no channel with this id**: check the Channel ID.
- **ThingSpeak refuses too many requests**: choose a longer refresh interval.
- **ThingSpeak refused the entry**: wrong write key, or entries too frequent for your plan.
- Logs: `LOG_LEVEL=debug` shows every read. The API keys never appear in them.

## Limits

- ThingSpeak free plan: one entry every 15 seconds per channel, 3 million messages a year. Reads are not limited in number, but stay reasonable: one minute is the shortest interval offered.
- 8 fields per channel, 20 channels at most.
- A field holding text gives no value.
- Not affiliated with MathWorks. ThingSpeak is a trademark of The MathWorks, Inc.
