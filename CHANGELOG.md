# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-22

### Added

- ThingSpeak channels in Gladys: one device per channel (public, or private
  with its read API key), one sensor per named field, and the date of the last
  entry. The unit is read at the end of the field name (`Temperature (°C)`).
- Reads on a timer of the container, from 1 to 15 minutes; only the changes are
  sent to Gladys, and nothing from a silent channel.
- Scene trigger "ThingSpeak channel silent or back".
- Scene action "Publish to ThingSpeak": one entry (eight fields and the
  status), spaced by 15 s per write key for the free plan.
- Dashboard widget "ThingSpeak channels": the age of the last entry of every
  channel, or the live fields of one channel.
- "Test the connection" action, messages and documentation in English, French,
  German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-thingspeak/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-thingspeak/releases/tag/v1.0.0
