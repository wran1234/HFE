import fs from "fs";
import path from "path";

export interface StorageAdapter {
  providerName: string;
  saveEvidence(input: {
    base64Image: string;
    userId: string;
    sessionId: string;
    roomType?: string;
    hint?: string;
  }): Promise<{ storageKey: string; publicUrl: string }>;
  resolveEvidenceUrl(storageKey: string): Promise<string>;
}

export class LocalStorageAdapter implements StorageAdapter {
  providerName = "local";
  private baseDir: string;

  constructor(baseDir = path.join(process.cwd(), "evidence")) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveEvidence(input: {
    base64Image: string;
    userId: string;
    sessionId: string;
    roomType?: string;
    hint?: string;
  }): Promise<{ storageKey: string; publicUrl: string }> {
    const safeHint = (input.hint ?? "hazard").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "hazard";
    const room = (input.roomType ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const relativeDir = path.join(input.userId, input.sessionId, room);
    const absoluteDir = path.join(this.baseDir, relativeDir);
    await fs.promises.mkdir(absoluteDir, { recursive: true });
    const fileName = `${Date.now()}_${safeHint}.jpg`;
    const outputPath = path.join(absoluteDir, fileName);
    await fs.promises.writeFile(outputPath, Buffer.from(input.base64Image, "base64"));
    const storageKey = path.join(relativeDir, fileName).replace(/\\/g, "/");
    return {
      storageKey,
      publicUrl: `/evidence/${storageKey}`,
    };
  }

  async resolveEvidenceUrl(storageKey: string): Promise<string> {
    if (storageKey.startsWith("http://") || storageKey.startsWith("https://") || storageKey.startsWith("/")) {
      return storageKey;
    }
    return `/evidence/${storageKey}`;
  }
}
