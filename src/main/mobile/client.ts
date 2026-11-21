import { STYLES } from './client/styles.js';
import { MARKUP_HEAD, MARKUP_BODY } from './client/markup.js';
import { SCRIPT_CORE } from './client/core.js';
import { SCRIPT_AUTH } from './client/auth.js';
import { SCRIPT_LIVE } from './client/live.js';
import { SCRIPT_PROJECTS } from './client/projects.js';
import { SCRIPT_IMAGE_STEPS } from './client/image-steps.js';
import { SCRIPT_VIDEO_STEPS } from './client/video-steps.js';
import { SCRIPT_VIEWER } from './client/viewer.js';
import { SCRIPT_CREATE } from './client/create.js';
import { SCRIPT_START, HTML_END } from './client/tail.js';

const SCRIPT_PARTS = [SCRIPT_CORE, SCRIPT_AUTH, SCRIPT_LIVE, SCRIPT_PROJECTS, SCRIPT_IMAGE_STEPS, SCRIPT_VIDEO_STEPS, SCRIPT_VIEWER, SCRIPT_CREATE, SCRIPT_START];

export function getMobileHtml(): string {
  return MARKUP_HEAD + STYLES + MARKUP_BODY + SCRIPT_PARTS.join('') + HTML_END;
}
