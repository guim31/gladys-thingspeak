// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): keys permanent once published.
//
// `publish_entry` writes one entry to a channel, what Home Assistant's
// `thingspeak` integration does, driven by a scene. The core substitutes the
// scene variables in the fields before relaying them (a device value read by
// a previous action, an event variable).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  publish_entry: (hub, { fields = {} }) => hub.publishEntry(fields),
};
