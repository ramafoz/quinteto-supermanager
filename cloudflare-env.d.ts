declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    TOKEN_ENCRYPTION_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
