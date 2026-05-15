import { Storage } from "@google-cloud/storage";
import { StorageAdapter } from "./storageAdapter";

export class GcsStorageAdapter implements StorageAdapter {
  providerName = "gcs";
  private storage: Storage;
  private bucketName: string;
  private signedUrlTtlSeconds: number;

  constructor(params: { projectId?: string; bucketName: string; signedUrlTtlSeconds?: number }) {
    this.storage = new Storage({
      projectId: params.projectId,
    });
    this.bucketName = params.bucketName;
    this.signedUrlTtlSeconds = params.signedUrlTtlSeconds ?? 900;
  }

  async saveEvidence(input: {
    base64Image: string;
    userId: string;
    sessionId: string;
    roomType?: string;
    hint?: string;
  }): Promise<{ storageKey: string; publicUrl: string }> {
    const room = (input.roomType ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeHint = (input.hint ?? "hazard").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "hazard";
    const storageKey = `evidence/${input.userId}/${input.sessionId}/${room}/${Date.now()}_${safeHint}.jpg`;
    const buffer = Buffer.from(input.base64Image, "base64");
    const file = this.storage.bucket(this.bucketName).file(storageKey);

    await file.save(buffer, {
      contentType: "image/jpeg",
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0, no-cache",
      },
    });

    const publicUrl = await this.resolveEvidenceUrl(storageKey);
    return { storageKey, publicUrl };
  }

  async resolveEvidenceUrl(storageKey: string): Promise<string> {
    if (storageKey.startsWith("http://") || storageKey.startsWith("https://")) {
      return storageKey;
    }

    const file = this.storage.bucket(this.bucketName).file(storageKey);
    try {
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + this.signedUrlTtlSeconds * 1000,
        version: "v4",
      });
      return url;
    } catch (error) {
      console.warn("[STORAGE] evidence signed_url_failed", { storageKey, error: String(error) });
      return storageKey;
    }
  }
}
