// TODO: M3-308 - Implement Gmail SMTP sender via Nodemailer.

export interface LeadEmailPayload {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  quantity?: string;
  comments?: string;
  sourcePage: string;
}

export async function sendLeadEmail(_payload: LeadEmailPayload): Promise<void> {
  // TODO M3-308
  throw new Error('sendLeadEmail not yet implemented - see TASKS.md M3-308');
}
