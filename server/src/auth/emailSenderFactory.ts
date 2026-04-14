import { ConsoleEmailSender, EmailSender } from "./emailSender";
import { ResendEmailSender } from "./emailProviders/resendSender";

export function createEmailSenderFromEnv(): EmailSender {
  const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM in production.");
      }
      console.warn("EMAIL_PROVIDER=resend missing config; using console sender fallback.");
      return new ConsoleEmailSender();
    }
    return new ResendEmailSender({ apiKey, from });
  }
  return new ConsoleEmailSender();
}
