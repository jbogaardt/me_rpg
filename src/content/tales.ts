// The DM's tales as content (tales.json): sagas that send the party to meet people the DM makes, as data, in the form
// `parseTale` checks (systems/dmEpics.ts). They name no land and no content id: a step is a hop away from where the tale
// starts, and a person has a name and a look word. A new tale is a new entry here, or one an AI wrote and the page
// parsed with the same checks (`DmBot.tale`). Tales with people need a live world (the people are entries of its log).

import { parseTales, type EpicTemplate } from '../systems/dmEpics';
import raw from './tales.json';

const parsed = parseTales(raw);
if (typeof parsed === 'string') throw new Error(`tales.json: ${parsed}`);

/** The tales the content ships with. */
export const STOCK_TALES: EpicTemplate[] = parsed;
