import crypto from "crypto";
import { db } from "../data/repository";
import { EmailSender } from "./emailSender";

const CODE_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 14;
const AUTH_SECRET = process.env.AUTH_SESSION_SECRET || "dev-only-secret";
const VERIFY_MAX_ATTEMPTS = Number(process.env.AUTH_VERIFY_MAX_ATTEMPTS || 5);

const hashToken = (value: string): string =>
  crypto.createHash("sha256").update(`${value}:${AUTH_SECRET}`).digest("hex");

export class AuthService {
  constructor(private emailSender: EmailSender) {}

  getEmailSender(): EmailSender {
    return this.emailSender;
  }

  async register(email: string, name?: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const existing = await db.findUserByEmail(normalized);
    if (!existing) {
      await db.createUser(normalized, name);
    }
    await this.requestLogin(normalized);
  }

  async requestLogin(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    await this.emailSender.sendLoginCode({ email: normalized, code });
    await db.createLoginToken(normalized, hashToken(code), expiresAt);
    console.info(`[AUTH] login code issued for ${normalized}`);
  }

  async verifyLogin(email: string, code: string): Promise<{ token: string; expiresAt: string; user: { id: string; email: string; name?: string } }> {
    const normalized = email.trim().toLowerCase();
    const consumed = await db.verifyAndConsumeLoginToken({
      email: normalized,
      tokenHash: hashToken(code.trim()),
      maxAttempts: VERIFY_MAX_ATTEMPTS,
    });
    if (consumed.status !== "verified") {
      console.warn(`[AUTH] verification failed for ${normalized}, reason=${consumed.status}`);
      throw new Error("Invalid or expired code.");
    }

    const user = await db.findUserByEmail(consumed.email);
    if (!user) throw new Error("User not found after verification.");

    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const session = await db.createAuthSession(user.id, expiresAt);
    console.info(`[AUTH] verification successful for ${normalized}`);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
