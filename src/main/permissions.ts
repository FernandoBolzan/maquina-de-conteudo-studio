// Renderer permission policy: deny everything except clipboard writes (terminal copy buttons, Ctrl/Cmd+C) and
// microphone capture for the Studio teleprompter. Camera, audio+video and unknown media stay denied.
export interface PermissionDetails {
  requestingUrl?: string;
  // Request handler: Electron lists the requested media kinds (e.g. ['audio']).
  mediaTypes?: readonly string[];
  // Check handler: a single media kind ('audio' | 'video' | 'unknown').
  mediaType?: string;
}

const GRANTED_PERMISSIONS: Record<string, true> = { 'clipboard-sanitized-write': true };

export function isPermissionGranted(permission: string, details: PermissionDetails, appUrl: string): boolean {
  if (permission === 'media') return isAudioOnlyFromApp(details, appUrl);
  return GRANTED_PERMISSIONS[permission] === true;
}

function isAudioOnlyFromApp(details: PermissionDetails, appUrl: string): boolean {
  if (!details.requestingUrl || !isAppUrl(details.requestingUrl, appUrl)) return false;
  if (details.mediaTypes !== undefined) return details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio';
  return details.mediaType === 'audio';
}

// The app is either the packaged renderer file or the dev server origin. file: URLs have opaque origins, so they must match exactly.
function isAppUrl(url: string, appUrl: string): boolean {
  if (url === appUrl) return true;
  try {
    const requested = new URL(url);
    const app = new URL(appUrl);
    return requested.protocol !== 'file:' && requested.origin === app.origin;
  } catch {
    return false;
  }
}
