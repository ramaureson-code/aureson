import { createHmac,timingSafeEqual } from 'node:crypto';
/** Compare HMAC signatures without leaking partial matches or throwing on malformed lengths. */
export function validSignature(payload:string,signature:string,secret:string){
 const expected=createHmac('sha256',secret).update(payload).digest('hex');
 return /^[a-f0-9]{64}$/i.test(signature)&&timingSafeEqual(Buffer.from(expected),Buffer.from(signature.toLowerCase()));
}
