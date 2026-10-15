import {z} from 'zod';
export const schema=z.object({sourceUrl:z.string().url().max(2048)}).strict();
export type OutputType={available?:boolean;sourceUrl?:string;candidates?:unknown[];reason?:string;error?:string};
