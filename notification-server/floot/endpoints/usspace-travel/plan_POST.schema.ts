import {z} from 'zod';
export const schema=z.object({tripId:z.string().regex(/^[A-Za-z0-9_-]{1,140}$/),visibility:z.enum(['private','shared']),pairId:z.string().max(140),expectedRevision:z.number().int().min(1),selectedItemIds:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,140}$/)).min(1).max(20),windowStart:z.string().length(10),windowEnd:z.string().length(10),options:z.record(z.unknown()),mode:z.enum(['local','ai'])}).strict();
export type OutputType={draft?:unknown;mode?:string;fallbackReason?:string;error?:string};
