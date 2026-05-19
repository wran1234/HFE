import { NextFunction, Request, Response } from "express";
import { db } from "../data/repository";
import { AuthenticatedRequestUser } from "../domain/types";

export const AUTH_COOKIE_NAME = "hfe_session";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedRequestUser;
    }
  }
}

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    next();
    return;
  }
  const user = await db.findUserBySessionToken(token);
  if (user) {
    req.authUser = { id: user.id, email: user.email, role: user.role };
  } else {
    _res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (req.authUser.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}
