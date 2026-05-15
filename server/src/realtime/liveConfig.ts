export const GEMINI_LIVE_API_VERSION = "v1alpha";
export const DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";

export function getGeminiLiveModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GEMINI_LIVE_MODEL || DEFAULT_GEMINI_LIVE_MODEL).trim() || DEFAULT_GEMINI_LIVE_MODEL;
}
