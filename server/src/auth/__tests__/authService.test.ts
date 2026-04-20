import { AuthService } from "../authService";

jest.mock("../../data/repository", () => ({
  db: {
    verifyAndConsumeLoginToken: jest.fn(),
    findUserByEmail: jest.fn(),
    createAuthSession: jest.fn(),
    createLoginToken: jest.fn(),
    createUser: jest.fn(),
  },
}));

import { db } from "../../data/repository";

const mockedDb = db as jest.Mocked<typeof db>;

describe("AuthService", () => {
  const emailSender = {
    sendLoginCode: jest.fn().mockResolvedValue(undefined),
    sendContractorLeadNotification: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(emailSender);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyLogin", () => {
    it("returns token and user on verified flow", async () => {
      mockedDb.verifyAndConsumeLoginToken.mockResolvedValue({
        status: "verified",
        userId: "u1",
        email: "test@example.com",
      });
      mockedDb.findUserByEmail.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        createdAt: new Date().toISOString(),
      });
      mockedDb.createAuthSession.mockResolvedValue({
        token: "session_token",
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      });

      const result = await service.verifyLogin("test@example.com", "123456");
      expect(result.token).toBe("session_token");
      expect(result.user.email).toBe("test@example.com");
    });

    it("throws when code is invalid", async () => {
      mockedDb.verifyAndConsumeLoginToken.mockResolvedValue({ status: "invalid" });
      await expect(service.verifyLogin("test@example.com", "123456")).rejects.toThrow(
        "Invalid or expired code."
      );
    });

    it("throws when verified user cannot be found", async () => {
      mockedDb.verifyAndConsumeLoginToken.mockResolvedValue({
        status: "verified",
        userId: "u1",
        email: "test@example.com",
      });
      mockedDb.findUserByEmail.mockResolvedValue(null);
      await expect(service.verifyLogin("test@example.com", "123456")).rejects.toThrow(
        "User not found"
      );
    });

    it("normalizes email before verify token lookup", async () => {
      mockedDb.verifyAndConsumeLoginToken.mockResolvedValue({
        status: "invalid",
      });
      await expect(service.verifyLogin("  Test@EXAMPLE.COM  ", "123456")).rejects.toThrow();
      expect(mockedDb.verifyAndConsumeLoginToken).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@example.com" })
      );
    });

    it("normalizes code whitespace before hash comparison input", async () => {
      mockedDb.verifyAndConsumeLoginToken.mockResolvedValue({
        status: "invalid",
      });
      await expect(service.verifyLogin("test@example.com", " 123456 ")).rejects.toThrow();
      const call = mockedDb.verifyAndConsumeLoginToken.mock.calls[0][0];
      expect(call.tokenHash).toBeDefined();
      expect(typeof call.tokenHash).toBe("string");
      expect(call.tokenHash).not.toContain(" ");
    });
  });

  describe("requestLogin", () => {
    it("creates login token hash and persists token", async () => {
      await service.requestLogin("test@example.com");
      expect(mockedDb.createLoginToken).toHaveBeenCalledTimes(1);
      const args = mockedDb.createLoginToken.mock.calls[0];
      expect(args[0]).toBe("test@example.com");
      expect(typeof args[1]).toBe("string");
      expect(args[1]).not.toHaveLength(0);
      expect(args[2]).toBeInstanceOf(Date);
    });

    it("normalizes email before token creation", async () => {
      await service.requestLogin("  Test@EXAMPLE.COM  ");
      expect(mockedDb.createLoginToken).toHaveBeenCalledWith(
        "test@example.com",
        expect.any(String),
        expect.any(Date)
      );
    });
  });
});
