declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI_PROVIDER?: "openai" | "deepseek";
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_API_STYLE?: string;
    OPENAI_OCR_MODEL?: string;
    OPENAI_CLASSIFICATION_MODEL?: string;
    OPENAI_VISION_MODEL?: string;
    OPENAI_REASONING_EFFORT?: "low" | "medium";
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_BASE_URL?: string;
    DEEPSEEK_VISION_MODEL?: string;
    DEEPSEEK_CLASSIFICATION_MODEL?: string;
  }
}
