// Vitest setup: the rule modules read the entities from the content (MOB_KINDS, NPC_LOOKS), which the game installs
// at boot; the tests get the same from the files on disk.
import { installContentFromDisk } from './disk';

installContentFromDisk();
