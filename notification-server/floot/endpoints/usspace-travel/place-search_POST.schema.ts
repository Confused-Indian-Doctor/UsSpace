import {z} from 'zod';export const schema=z.object({query:z.string().min(1).max(240)}).strict();export type OutputType={candidates?:unknown[];attribution?:string;retrievedAt?:string;error?:string};
