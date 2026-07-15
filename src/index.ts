import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { ErrorsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/errors';
import { NavigationInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { ResourceTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/resource-timing';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
import { WebVitalsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/web-vitals';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
} from '@opentelemetry/semantic-conventions';
import { resolveConfig, resolveIgnoreUrls, resolvePropagationTargets } from './config';

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

  const ignoreUrls = resolveIgnoreUrls(config.tracesPath, config.logsPath);

  // --- Traces (span-based network + document load; temporary until upstream parity) ---
  const traceExporter = new OTLPTraceExporter({
    // Same-origin path served by the odigos-browser-proxy sidecar; it forwards to the node collector.
    url: config.tracesPath,
  });

  const tracerProvider = new WebTracerProvider({
    resource,
    sampler: new TraceIdRatioBasedSampler(config.samplingRatio),
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });

  tracerProvider.register({
    contextManager: new ZoneContextManager(),
    propagator: new W3CTraceContextPropagator(),
  });

  // --- Logs / events (@opentelemetry/browser-instrumentation primary stack) ---
  const logExporter = new OTLPLogExporter({
    url: config.logsPath,
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: logExporter })],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const propagateTraceHeaderCorsUrls = resolvePropagationTargets(
    config.propagateTraceHeaderCorsUrls,
  );

  registerInstrumentations({
    instrumentations: [
      // Primary: event-based browser instrumentations (emit OTel log records).
      new ErrorsInstrumentation(),
      new NavigationInstrumentation(),
      new NavigationTimingInstrumentation(),
      new ResourceTimingInstrumentation({ ignoreUrls }),
      new UserActionInstrumentation(),
      new WebVitalsInstrumentation(),

      // Transitional span instrumentations: fetch/XHR/document-load are not yet fully covered by
      // @opentelemetry/browser-instrumentation (fetch is still landing upstream). Keep these so
      // existing distributed-trace UX continues to work. Remove once upstream parity lands.
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls,
        ignoreUrls,
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls,
        ignoreUrls,
      }),
    ],
  });

  if (config.debug) {
    diag.debug(`odigos browser agent started for service "${config.serviceName}"`);
  }
}

start();
