// Contractor lead validation logic tests.
// For full HTTP integration tests, add supertest:
//   npm install -D supertest @types/supertest
// Then write: request(app).post('/api/leads/contractor').send({...}).expect(200)

// Validation rules mirrored from index.ts POST /api/leads/contractor
function validateLeadInput(body: {
  name?: unknown;
  email?: unknown;
  zip?: unknown;
  phone?: unknown;
  scopeSummary?: unknown;
}): string | null {
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const zip = String(body.zip ?? "").trim();
  if (!name) return "name, a valid email, and a 5-digit zip are required.";
  if (!email.includes("@")) return "name, a valid email, and a 5-digit zip are required.";
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return "name, a valid email, and a 5-digit zip are required.";
  return null;
}

describe("contractor lead validation", () => {
  it("accepts valid input", () => {
    expect(validateLeadInput({ name: "Jane Smith", email: "jane@example.com", zip: "10001", scopeSummary: "grab bars" })).toBeNull();
  });

  it("accepts 9-digit zip", () => {
    expect(validateLeadInput({ name: "Jane", email: "jane@example.com", zip: "10001-1234" })).toBeNull();
  });

  it("rejects missing name", () => {
    expect(validateLeadInput({ name: "", email: "jane@example.com", zip: "10001" })).not.toBeNull();
  });

  it("rejects invalid email (no @)", () => {
    expect(validateLeadInput({ name: "Jane", email: "notanemail", zip: "10001" })).not.toBeNull();
  });

  it("rejects non-numeric zip", () => {
    expect(validateLeadInput({ name: "Jane", email: "jane@example.com", zip: "ABCDE" })).not.toBeNull();
  });

  it("rejects 4-digit zip", () => {
    expect(validateLeadInput({ name: "Jane", email: "jane@example.com", zip: "1000" })).not.toBeNull();
  });

  it("rejects undefined fields", () => {
    expect(validateLeadInput({})).not.toBeNull();
  });
});
