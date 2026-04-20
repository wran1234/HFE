export interface ContractorLeadParams {
  name: string;
  email: string;       // contact email for the contractor
  accountEmail: string; // auth user's email — auto-reply goes here
  phone?: string;
  zip: string;
  scopeSummary: string;
}

export interface EmailSender {
  sendLoginCode(params: { email: string; code: string }): Promise<void>;
  sendContractorLeadNotification(params: ContractorLeadParams): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async sendLoginCode(params: { email: string; code: string }): Promise<void> {
    // Dev-friendly fallback until a provider is configured.
    console.log(`[EMAIL_LOGIN_CODE] email=${params.email} code=${params.code}`);
  }

  async sendContractorLeadNotification(params: ContractorLeadParams): Promise<void> {
    console.log(`[EMAIL_CONTRACTOR_LEAD] name=${params.name} email=${params.email} zip=${params.zip} phone=${params.phone ?? "n/a"}`);
    console.log(`[EMAIL_CONTRACTOR_LEAD] scope=${params.scopeSummary.slice(0, 120)}...`);
  }
}
