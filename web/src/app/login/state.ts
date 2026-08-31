// Split out of actions.ts: a "use server" file can only export async
// functions, so the useActionState types/initial values live here instead.

export type RequestCodeState = { error: string | null; sent: boolean; email: string };
export type VerifyCodeState = { error: string | null };

export const initialRequestCodeState: RequestCodeState = { error: null, sent: false, email: "" };
export const initialVerifyCodeState: VerifyCodeState = { error: null };
