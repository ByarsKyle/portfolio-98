// ─────────────────────────────────────────────────────────────
// apps/index — the Programs folder.
// ─────────────────────────────────────────────────────────────
import { browser } from './browser.js';
import { minesweeper, snake } from './games.js';
import { notepad, paint, media, dos } from './tools.js';
import { computer, recycle, dialup, controlpanel, find, help } from './shell.js';

export const APPS = {
  browser,
  notepad,
  paint,
  media,
  dos,
  minesweeper,
  snake,
  computer,
  recycle,
  dialup,
  controlpanel,
  find,
  help,
};
