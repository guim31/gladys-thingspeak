// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `channels`.
//
// The use case: a glance tells whether the sensors behind the channels still
// write to ThingSpeak, something the device tiles of Gladys never say.
//
//   - No device chosen: one row per channel, with the time since its last
//     entry, orange when silent, red when it cannot be read.
//   - A device chosen: its first six fields as live tiles (bound to the device
//     features, they follow the states without a refresh), then the row of the
//     last entry, which the `hide_status` setting hides.
//
// Budget (8 components, 2 texts): six tiles and one status list at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { parseDeviceId } from './devices.js';
import { formatAge, labelled, pick } from './texts.js';

export const MAX_TILES = 6;
export const MAX_ROWS = 8;

export const TEXT = {
  noChannel: {
    en: 'No ThingSpeak channel yet: enter channel ids in the configuration.',
    fr: 'Aucun canal ThingSpeak pour l’instant : saisissez des numéros de canaux dans la configuration.',
    de: 'Noch kein ThingSpeak-Kanal: Gib Kanal-IDs in der Konfiguration ein.',
    es: 'Aún no hay ningún canal ThingSpeak: introduzca números de canal en la configuración.',
  },
  gone: {
    en: 'This channel is no longer in the configuration, or was never read.',
    fr: 'Ce canal n’est plus dans la configuration, ou n’a jamais été lu.',
    de: 'Dieser Kanal ist nicht mehr in der Konfiguration oder wurde nie gelesen.',
    es: 'Este canal ya no está en la configuración o nunca se ha leído.',
  },
  lastEntry: {
    en: 'Last entry',
    fr: 'Dernière entrée',
    de: 'Letzter Eintrag',
    es: 'Última entrada',
  },
  ago: { en: 'ago', fr: 'il y a', de: 'vor', es: 'hace' },
  silent: { en: 'silent', fr: 'muet', de: 'stumm', es: 'silencioso' },
  noEntry: { en: 'No entry yet', fr: 'Aucune entrée', de: 'Noch kein Eintrag', es: 'Sin entradas' },
  unreadable: { en: 'Unreadable', fr: 'Illisible', de: 'Nicht lesbar', es: 'Ilegible' },
};

const text = (key, language) => pick(TEXT[key], language);

/** "5 min ago" in the word order of each language. */
function ago(ms, language) {
  const age = formatAge(ms, language);
  return language === 'en' ? `${age} ${text('ago', language)}` : `${text('ago', language)} ${age}`;
}

/** The status row of a channel view. */
function row(view, language) {
  const label = view.name.slice(0, 40);
  if (view.error) {
    return { label, value: text('unreadable', language), color: WIDGET_COLORS.DANGER };
  }
  if (view.ageMs === null) {
    return { label, value: text('noEntry', language), color: WIDGET_COLORS.NEUTRAL };
  }
  if (view.silent) {
    return {
      label,
      value: labelled(text('silent', language), formatAge(view.ageMs, language), language),
      color: WIDGET_COLORS.WARNING,
    };
  }
  return { label, value: ago(view.ageMs, language), color: WIDGET_COLORS.SUCCESS };
}

function overview(hub, language) {
  const items = hub.config.channelIds
    .map((id) => hub.view(id))
    .filter(Boolean)
    .slice(0, MAX_ROWS)
    .map((view) => row(view, language));
  if (items.length === 0) {
    return [{ type: 'text', text: text('noChannel', language) }];
  }
  return [{ type: 'status', items }];
}

function deviceContent(view, settings, language) {
  const components = view.fields
    .filter(({ field }) => field.value !== null)
    .slice(0, MAX_TILES)
    .map(({ field, externalId }) => ({
      type: 'value',
      label: field.name.slice(0, 24),
      device_feature: externalId,
    }));
  if (!settings.hide_status || components.length === 0) {
    components.push({
      type: 'status',
      items: [{ ...row(view, language), label: text('lastEntry', language) }],
    });
  }
  return components;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(hub, { settings = {}, language = 'en' } = {}) {
      if (!hub.config?.channelIds.length) {
        return {
          ttl_seconds: 60,
          components: [{ type: 'text', text: text('noChannel', language) }],
        };
      }
      if (settings.device) {
        const id = parseDeviceId(hub.gladys, settings.device);
        const view = id === null ? null : hub.view(id);
        if (!view || !hub.config.channelIds.includes(id)) {
          return { ttl_seconds: 60, components: [{ type: 'text', text: text('gone', language) }] };
        }
        return { ttl_seconds: 60, components: deviceContent(view, settings, language) };
      }
      return { ttl_seconds: 60, components: overview(hub, language) };
    },
  },
};
