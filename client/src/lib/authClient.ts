export interface AuthUser {
  id: string;
  email: string;
  role: "user" | "admin";
}

export async function register(email: string, name?: string): Promise<void> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Registration failed");
  }
}

export async function requestLogin(email: string): Promise<void> {
  const response = await fetch("/api/auth/request-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Login request failed");
  }
}

export async function verifyLogin(email: string, code: string): Promise<AuthUser> {
  const response = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Verification failed");
  return body.user as AuthUser;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return null;
  const body = await response.json();
  return (body.user ?? null) as AuthUser | null;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "x-hfe-csrf": "same-origin" },
  });
}
