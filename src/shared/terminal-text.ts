const ANSI_ESCAPE = String.fromCharCode(27);

/** Matches one ANSI CSI sequence (colours, cursor moves, erase). */
export const ANSI_SEQUENCE = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, 'g');

/** Plain text of a job log for copying: ANSI sequences removed, CR and CRLF normalised to LF. */
export function plainTerminalText(log: string): string {
  return log.replace(ANSI_SEQUENCE, '').replace(/\r\n?/g, '\n');
}
