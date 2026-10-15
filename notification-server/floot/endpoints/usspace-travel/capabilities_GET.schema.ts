import {z} from 'zod';
export const schema=z.object({});
export type OutputType={protocol:number;projectId:string;ready:boolean;aiConfigured:boolean;metadataConfigured:boolean;placesConfigured:boolean;routingConfigured:boolean;weatherConfigured:boolean};
