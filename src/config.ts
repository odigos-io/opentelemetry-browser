// Runtime configuration contract between the odigos-browser-proxy sidecar and this agent.
//
// The sidecar injects an inline <script> that sets `window.__ODIGOS__` BEFORE loading agent.js,
// so the agent can read per-workload values (service name, collector path, resource attributes)
// without being rebuilt. Everything here is optional with sensible defaults so a misconfigured
// or partial injection never throws inside the user's page.
export interface OdigosBrowserConfig {
  // OTEL_SERVICE_NAME equivalent. Defaults to the page's hostname when not provided.
  serviceName?: string;

  // Same-origin path exposed by the odigos-browser-proxy sidecar that receives OTLP/HTTP traces
  // and forwards them to the node-local collector. Same-origin avoids any CORS configuration.
  tracesPath?: string;

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

export function resolveConfig(): Required<
  Pick<OdigosBrowserConfig, 'serviceName' | 'tracesPath' | 'samplingRatio'>
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

  const samplingRatio =
    typeof raw.samplingRatio === 'number' && raw.samplingRatio >= 0 && raw.samplingRatio <= 1
      ? raw.samplingRatio
      : 1;

  return {
    ...raw,
    serviceName,
    tracesPath,
    samplingRatio,
  };
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
