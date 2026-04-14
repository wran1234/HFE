import { Resend } from "resend";
import { EmailSender } from "../emailSender";

export class ResendEmailSender implements EmailSender {
  private resend: Resend;
  private from: string;

  constructor(params: { apiKey: string; from: string }) {
    this.resend = new Resend(params.apiKey);
    this.from = params.from;
  }

  async sendLoginCode(params: { email: string; code: string }): Promise<void> {
    await this.resend.emails.send({
      from: this.from,
      to: params.email,
      subject: "Your HFE verification code",
      text: `Your Home Fall & Safety Evaluator verification code is ${params.code}. It expires in 10 minutes.`,
      html: `<p>Your Home Fall & Safety Evaluator verification code is:</p><p style="font-size:22px;font-weight:700;letter-spacing:2px">${params.code}</p><p>This code expires in 10 minutes.</p>`,
    });
  }
}
