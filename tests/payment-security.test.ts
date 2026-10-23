import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHmac } from 'node:crypto';
import { validSignature } from '../lib/payment-security.ts';
test('accepts the exact signed order and payment payload',()=>{
 const secret=randomBytes(32).toString('hex');const body='order_reference|payment_reference';
 const signature=createHmac('sha256',secret).update(body).digest('hex');
 assert.equal(validSignature(body,signature,secret),true);
 assert.equal(validSignature('changed_order|payment_reference',signature,secret),false);
});
test('rejects malformed signatures without throwing',()=>{
 const secret=randomBytes(32).toString('hex');
 for(const value of ['', 'bad-signature', '0'.repeat(63), 'g'.repeat(64),'0'.repeat(65)])assert.equal(validSignature('payload',value,secret),false);
});
test('verifies raw webhook bytes rather than equivalent reserialized JSON',()=>{
 const secret=randomBytes(32).toString('hex');const raw='{ "event": "payment.captured" }';
 const signature=createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(validSignature(raw,signature,secret),true);
 assert.equal(validSignature(JSON.stringify(JSON.parse(raw)),signature,secret),false);
});
