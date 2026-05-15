import { NextFunction, Request, Response } from "express";
import { requireAdmin } from "../authMiddleware";

const mockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

describe("requireAdmin", () => {
  it("rejects unauthenticated requests", () => {
    const req = {} as Request;
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required." });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin users", () => {
    const req = {
      authUser: { id: "u1", email: "user@example.com", role: "user" },
    } as Request;
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Admin access required." });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authenticated admins", () => {
    const req = {
      authUser: { id: "u1", email: "admin@example.com", role: "admin" },
    } as Request;
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
