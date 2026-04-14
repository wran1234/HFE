export interface EmailSender {
  sendLoginCode(params: { email: string; code: string }): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async sendLoginCode(params: { email: string; code: string }): Promise<void> {
    // Dev-friendly fallback until a provider is configured.
    console.log(`[EMAIL_LOGIN_CODE] email=${params.email} code=${params.code}`);
  }
}
