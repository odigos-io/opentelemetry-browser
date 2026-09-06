// Runtime configuration contract between the browser gateway (k8s odigos-browser-proxy or
// vm-agent BrowserProxyController) and this agent.
//
// The gateway serves /__odigos/config.js which assigns `window.__ODIGOS__` BEFORE agent.js runs,
// so the agent can read per-workload values (service name, collector path, export token, …)
// without being rebuilt. Everything here is optional with sensible defaults so a misconfigured
// or partial injection never throws inside the user's page.
//
// See docs/ARCHITECTURE.md, docs/DATA_FLOW.md, and docs/SECURITY.md.
export interface OdigosBrowserConfig {
  // OTEL_SERVICE_NAME equivalent. Defaults to the page's hostname when not provided.
  serviceName?: string;

  // Same-origin path exposed by the gateway that receives OTLP/HTTP traces and forwards them
  // to the node-local / managed collector. Same-origin avoids public collector CORS setup.
  tracesPath?: string;

  // Same-origin path for OTLP/HTTP logs/events (browser-instrumentation emits log records).
  logsPath?: string;

  // Bearer token minted by the gateway into config.js. When set, the agent sends
  // `Authorization: Bearer <exportToken>` on OTLP exports so the unauthenticated write path
  // into the collector is closed (see docs/SECURITY.md).
  exportToken?: string;

  // Additional OpenTelemetry resource attributes (e.g. k8s.namespace.name, k8s.pod.name).
  resourceAttributes?: Record<string, string>;

  // URLs the fetch/xhr instrumentations may attach W3C trace context headers to. Entries wrapped
  // in slashes (e.g. "/api\\..*/") are treated as regular expressions; everything else as a string
  // (matched as a substring by the OpenTelemetry web instrumentations).
  propagateTraceHeaderCorsUrls?: string[];

  // Head sampling ratio in the range [0, 1]. Defaults to 1 (sample everything).
  samplingRatio?: number;

  // When true, the agent logs diagnostics to the browser console (useful while validating setup).
  debug?: boolean;
}

declare global {
  interface Window {
    __ODIGOS__?: OdigosBrowserConfig;
    __ODIGOS_AGENT_STARTED__?: boolean;
  }
}

const DEFAULT_TRACES_PATH = '/__odigos/v1/traces';
const DEFAULT_LOGS_PATH = '/__odigos/v1/logs';

export function resolveConfig(): Required<
  Pick<OdigosBrowserConfig, 'serviceName' | 'tracesPath' | 'logsPath' | 'samplingRatio'>
> &
  OdigosBrowserConfig {
  const raw: OdigosBrowserConfig = (typeof window !== 'undefined' && window.__ODIGOS__) || {};

  const serviceName =
    raw.serviceName && raw.serviceName.trim().length > 0
      ? raw.serviceName
      : typeof location !== 'undefined'
        ? location.hostname || 'browser-app'
        : 'browser-app';

  const tracesPath =
    raw.tracesPath && raw.tracesPath.trim().length > 0 ? raw.tracesPath : DEFAULT_TRACES_PATH;

  const logsPath =
    raw.logsPath && raw.logsPath.trim().length > 0 ? raw.logsPath : DEFAULT_LOGS_PATH;

  const samplingRatio =
    typeof raw.samplingRatio === 'number' && raw.samplingRatio >= 0 && raw.samplingRatio <= 1
      ? raw.samplingRatio
      : 1;

  const exportToken =
    raw.exportToken && raw.exportToken.trim().length > 0 ? raw.exportToken.trim() : undefined;

  return {
    ...raw,
    serviceName,
    tracesPath,
    logsPath,
    samplingRatio,
    exportToken,
  };
}

// Headers attached to OTLP/HTTP exporters. Empty when the gateway did not mint a token
// (local harnesses may omit auth; production gateways always set exportToken).
export function resolveExportHeaders(exportToken: string | undefined): Record<string, string> {
  if (!exportToken) {
    return {};
  }
  return { Authorization: `Bearer ${exportToken}` };
}

// Convert the user-supplied propagation targets into the (string | RegExp)[] shape the
// OpenTelemetry web instrumentations expect. Defaults to same-origin only when not provided.
export function resolvePropagationTargets(values: string[] | undefined): Array<string | RegExp> {
  if (!values || values.length === 0) {
    // Same-origin requests only, by default. Avoids leaking trace headers cross-origin.
    if (typeof location !== 'undefined' && location.origin) {
      return [location.origin];
    }
    return [];
  }

  return values.map((value) => {
    if (value.length > 1 && value.startsWith('/') && value.endsWith('/')) {
      return new RegExp(value.slice(1, -1));
    }
    return value;
  });
}

// URLs used by this agent to export OTLP — must be ignored by network/resource instrumentations
// to avoid feedback loops (instrumenting our own telemetry export).
export function resolveIgnoreUrls(tracesPath: string, logsPath: string): Array<string | RegExp> {
  const paths = [tracesPath, logsPath].filter(Boolean);
  const patterns: Array<string | RegExp> = paths.map(
    (p) => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  // Also match common OTLP path suffixes in case the sidecar uses a different prefix.
  patterns.push(/\/v1\/traces(?:\?|$)/, /\/v1\/logs(?:\?|$)/);
  return patterns;
}
