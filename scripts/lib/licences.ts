import type { SourceAttribution } from './types.ts'

export const OGL_TORONTO: SourceAttribution = {
  name: 'City of Toronto Open Data',
  licence: 'Open Government Licence – Toronto',
  attribution:
    'Contains information licensed under the Open Government Licence – Toronto.',
  url: 'https://open.toronto.ca/open-data-license/',
}

export const CDLA_PERMISSIVE: SourceAttribution = {
  name: 'Overture Maps Places',
  licence: 'CDLA-Permissive-2.0',
  attribution:
    'Overture Maps Foundation Places data, licensed under the Community Data License Agreement – Permissive 2.0. Licence text reproduced in /data/LICENSES/CDLA-Permissive-2.0.txt.',
  url: 'https://cdla.dev/permissive-2-0/',
}

export const APACHE_2: SourceAttribution = {
  name: 'Foursquare OS Places',
  licence: 'Apache-2.0',
  attribution:
    'Foursquare Open Source Places. Preserve NOTICE.txt attribution (see /data/LICENSES/Foursquare-NOTICE.txt).',
  url: 'https://opensource.foursquare.com/os-places/',
}

export const CC0: SourceAttribution = {
  name: 'Wikidata',
  licence: 'CC0 1.0',
  attribution: 'Wikidata contributors (CC0).',
  url: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
}

/** ODbL — keep physically separate from redistributed derivative DB. */
export const ODBL_NOTE: SourceAttribution = {
  name: 'Overture Maps Buildings',
  licence: 'ODbL 1.0 (share-alike)',
  attribution:
    'Overture Buildings geometry kept in buildings_footprints.geojson only; not merged into buildings.json to avoid ODbL share-alike on the main derivative.',
  url: 'https://opendatacommons.org/licenses/odbl/',
}

export const CDLA_PERMISSIVE_TEXT = `Community Data License Agreement – Permissive – Version 2.0

This is a human-readable summary of (and not a substitute for) the license.

You are free to:
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material for any purpose, even commercially

Under the following terms:
- Attribution — You must give appropriate credit
- No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits

Full text: https://cdla.dev/permissive-2-0/
`

export const FOURSQUARE_NOTICE_PLACEHOLDER = `Foursquare OS Places — NOTICE

This product includes data from Foursquare Open Source Places (Apache License 2.0).
See https://opensource.foursquare.com/os-places/ and the Apache 2.0 license.
If a vendor NOTICE.txt is obtained at build time, it replaces this placeholder.
`
