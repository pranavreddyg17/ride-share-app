declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    KY_BOOTSTRAP_ADMIN_EMAIL?: string;
    MAPBOX_ACCESS_TOKEN?: string;
    MAPBOX_PUBLIC_TOKEN?: string;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_MESSAGING_SERVICE_SID?: string;
    KY_JOBS_TOKEN?: string;
    KY_PUBLIC_ORIGIN?: string;
  }
}
