import {z} from 'zod';
export const schema = z.object({coupleId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), eventId: z.string().regex(/^[A-Za-z0-9_-]{1,140}$/)}).strict();
export type OutputType = {consumed?: boolean; error?: string; retryable?: boolean; outcome?: string};
