// ─────────────────────────────────────────────────────────────
// apps/index — the Programs folder.
// ─────────────────────────────────────────────────────────────
import { browser } from './browser.js';
import { minesweeper, snake } from './games.js';
import { notepad, paint, media, dos } from './tools.js';
import { computer, recycle, dialup, controlpanel, find, help } from './shell.js';
import { mail } from './mail.js';
import { vault } from './vault.js';

export const APPS = {
  browser,
  mail,
  vault,
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
