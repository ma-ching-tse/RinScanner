// Usage telemetry — runs in the main plugin thread (has `fetch`, governed by
// manifest networkAccess, same capability the LLM naming already relies on).
//
// Design rules:
//   - Fire-and-forget. A failed / blocked / offline report must NEVER affect the
//     plugin's behaviour or surface an error to the user.
//   - Only numeric summaries + identity are sent — never design content, layer
//     contents, screenshots, or token values.

export interface TelemetryConfig {
  /** Server endpoint, e.g. https://your-host/telemetry. Blank = disabled. */
  url: string;
}

export interface TelemetryIdentity {
  /** Stable per-install id; lets us count installs even when currentUser is null. */
  installId: string;
  /** Figma user id (requires manifest permission "currentuser"). */
  userId: string | null;
  userName: string | null;
}

export interface TelemetryFile {
  fileKey: string | null;
  fileName: string | null;
}

export type TelemetryEvent =
  | {
      event: 'scan';
      scanned: number;
      scope: string;
      platformFilter: string;
      categories: { token: boolean; autolayout: boolean; naming: boolean };
      found: { token: number; autolayout: number; naming: number; total: number };
    }
  | { event: 'fix'; fixKind: string }
  | { event: 'naming_suggest'; requested: number; succeeded: number; failed: number };

export function isTelemetryConfigured(c: TelemetryConfig | null): c is TelemetryConfig {
  return !!c && !!c.url;
}

export interface Telemetry {
  track(ev: TelemetryEvent): void;
}

/**
 * Build a telemetry sender. Config + context are read lazily on each `track`
 * call so they can change at runtime (toggle, user/file switch) without
 * re-wiring.
 */
export function createTelemetry(
  getConfig: () => TelemetryConfig,
  getContext: () => { identity: TelemetryIdentity; file: TelemetryFile },
): Telemetry {
  return {
    track(ev: TelemetryEvent): void {
      const config = getConfig();
      if (!isTelemetryConfigured(config)) return;
      const { identity, file } = getContext();
      const payload = {
        ...ev,
        ts: Date.now(),
        installId: identity.installId,
        userId: identity.userId,
        userName: identity.userName,
        fileKey: file.fileKey,
        fileName: file.fileName,
      };
      try {
        fetch(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {
          /* offline / blocked domain / server down — stay silent */
        });
      } catch {
        // fetch threw synchronously (e.g. malformed URL) — ignore.
      }
    },
  };
}

/** No crypto in the Figma sandbox; a coarse random id is plenty to count installs. */
export function generateInstallId(): string {
  const chunk = () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  return `i_${chunk()}${chunk()}`;
}
