import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
} from '@opentelemetry/semantic-conventions';
import { resolveConfig, resolvePropagationTargets } from './config';

function start(): void {
  // The sidecar may inject the script tag more than once (e.g. for documents that include
  // partial HTML fragments). Guard against initializing the SDK twice in a single page.
  if (typeof window === 'undefined' || window.__ODIGOS_AGENT_STARTED__) {
    return;
  }
  window.__ODIGOS_AGENT_STARTED__ = true;

  const config = resolveConfig();

  if (config.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: 'webjs',
    ...(config.resourceAttributes || {}),
  });

  const exporter = new OTLPTraceExporter({
    // Same-origin path served by the odigos-browser-proxy sidecar; it forwards to the node collector.
    url: config.tracesPath,
  });

  const provider = new WebTracerProvider({
    resource,
    sampler: new TraceIdRatioBasedSampler(config.samplingRatio),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new W3CTraceContextPropagator(),
  });

  const propagateTraceHeaderCorsUrls = resolvePropagationTargets(
    config.propagateTraceHeaderCorsUrls,
  );

  registerInstrumentations({
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-fetch': {
          propagateTraceHeaderCorsUrls,
        },
        '@opentelemetry/instrumentation-xml-http-request': {
          propagateTraceHeaderCorsUrls,
        },
      }),
    ],
  });

  if (config.debug) {
    diag.debug(`odigos browser agent started for service "${config.serviceName}"`);
  }
}

start();
