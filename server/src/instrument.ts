const dsn = process.env.SENTRY_DSN;

if (dsn) {
  try {
    // Optional at runtime so local development still works before dependency install.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/node") as {
      init: (options: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      beforeSend(event: { request?: unknown; extra?: Record<string, unknown> }) {
        if (event.extra) {
          delete event.extra.base64Image;
          delete event.extra.latestFrame;
        }
        return event;
      },
    });
  } catch (error) {
    console.warn(`[SENTRY] disabled: ${String(error)}`);
  }
}
