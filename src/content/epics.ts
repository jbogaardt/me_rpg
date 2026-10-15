// The DM's epics as content (epics.json): sagas that send the party to meet people the DM makes, as data, in the form
// `parseEpic` checks (systems/dmEpics.ts). They name no land and no content id: a step is a hop away from where the epic
// starts, and a person has a name and a look word. A new epic is a new entry here, or one an AI wrote and the page
// parsed with the same checks (`DmBot.epic`). Epics with people need a live world (the people are entries of its log).

import { parseEpics, type EpicTemplate } from '../systems/dmEpics';
import raw from './epics.json';

const parsed = parseEpics(raw);
if (typeof parsed === 'string') throw new Error(`epics.json: ${parsed}`);

/** The epics the content ships with. */
export const STOCK_EPICS: EpicTemplate[] = parsed;
