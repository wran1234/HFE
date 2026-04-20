import { Resend } from "resend";
import { ContractorLeadParams, EmailSender } from "../emailSender";

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

  private escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async sendContractorLeadNotification(params: ContractorLeadParams): Promise<void> {
    const notifyTo = process.env.LEAD_NOTIFY_EMAIL || this.from;
    const safeName = this.escapeHtml(params.name);
    const safeEmail = this.escapeHtml(params.email);
    const safePhone = this.escapeHtml(params.phone ?? "not provided");
    const safeScope = this.escapeHtml(params.scopeSummary);
    const safeZip = this.escapeHtml(params.zip);
    await this.resend.emails.send({
      from: this.from,
      to: notifyTo,
      subject: `New contractor lead — ${params.zip}`,
      text: `New contractor matching request:\n\nName: ${params.name}\nEmail: ${params.email}\nPhone: ${params.phone ?? "not provided"}\nZip: ${params.zip}\n\nScope summary:\n${params.scopeSummary}`,
      html: `<h2>New Contractor Lead</h2><table><tr><td><b>Name</b></td><td>${safeName}</td></tr><tr><td><b>Email</b></td><td>${safeEmail}</td></tr><tr><td><b>Phone</b></td><td>${safePhone}</td></tr><tr><td><b>Zip</b></td><td>${safeZip}</td></tr></table><h3>Scope Summary</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px">${safeScope}</pre>`,
    });
    // Auto-reply to account holder (not the contact email) — best-effort
    try {
      await this.resend.emails.send({
        from: this.from,
        to: params.accountEmail,
        subject: "We received your contractor request — HFE",
        text: `Hi ${params.name},\n\nWe received your request for contractor matching. We'll follow up within 1-2 business days with vetted contractors in the ${params.zip} area who specialize in aging-in-place modifications.\n\nYour scope of work:\n${params.scopeSummary}\n\n— The HFE Team`,
        html: `<p>Hi ${safeName},</p><p>We received your request for contractor matching. We'll follow up within 1–2 business days with vetted contractors in the <b>${safeZip}</b> area who specialize in aging-in-place modifications.</p><h3>Your Scope of Work</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px">${safeScope}</pre><p>— The HFE Team</p>`,
      });
    } catch (err) {
      console.error("[EMAIL] contractor lead auto-reply failed:", String(err));
    }
  }
}
