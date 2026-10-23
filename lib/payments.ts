import 'server-only';
import Razorpay from 'razorpay';
import { randomUUID } from 'node:crypto';
import { validSignature } from './payment-security';
import { z } from 'zod';
import { and,eq } from 'drizzle-orm';
import { db } from '@/db';
import * as s from '@/db/schema';
import { PublicError, requireCustomer, storeSettings } from './server';
export function gateway(){if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new PublicError('Online payments are not available yet. Please contact us for assistance.',503);return new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});}

const addressSchema=z.object({name:z.string().min(2).max(100),email:z.string().email(),phone:z.string().regex(/^[+\d ()-]{10,18}$/),address:z.string().min(8).max(500),city:z.string().min(2).max(100),state:z.string().min(2).max(100),pin:z.string().regex(/^[1-9]\d{5}$/),country:z.literal('India')});
export async function checkout(request:Request){
 const user=await requireCustomer();const body=await request.json();const customer=addressSchema.parse(body.customer);customer.email=user.email??customer.email;
 const key=z.string().uuid().parse(body.key);const razorpay=gateway();const settings=await storeSettings();const store=settings.store??{};
 if(!process.env.RAZORPAY_WEBHOOK_SECRET||!store.checkoutEnabled||store.taxBasisPoints===null||store.taxBasisPoints===undefined||!store.policiesApproved)throw new PublicError('Checkout opens after pricing, tax, shipping and store policies are confirmed. Request a quote in the meantime.',503);
 const result=await db.transaction(async(tx:any)=>{
  // Serialize customer checkouts so retries cannot reserve the same cart twice.
  const [cart]=await tx.select().from(s.carts).where(eq(s.carts.owner,`user:${user.id}`)).for('update');
  const [existing]=await tx.select().from(s.orders).where(eq(s.orders.checkoutKey,key));
  if(existing){if(existing.owner!==`user:${user.id}`)throw new PublicError('Invalid checkout request.',403);if(existing.status==='cancelled'||existing.paymentStatus==='refunded')throw new PublicError('Start a new checkout for a cancelled or refunded order.');return existing;}
  if(!cart)throw new PublicError('Your cart is empty.');
  const items=await tx.select().from(s.cartItems).where(eq(s.cartItems.cartId,cart.id));if(!items.length)throw new PublicError('Your cart is empty.');
  let subtotal=0,weight=0;const validated:any[]=[];
  for(const item of items.sort((a:any,b:any)=>a.variantId.localeCompare(b.variantId))){
   const [v]=await tx.select().from(s.variants).where(eq(s.variants.id,item.variantId)).for('update');
   const [p]=await tx.select().from(s.products).where(eq(s.products.id,v.productId)).for('share');const [c]=await tx.select().from(s.colours).where(eq(s.colours.id,v.colourId)).for('share');
   if(!v.enabled||!c.enabled||p.status!=='active'||!v.price||v.stock<item.quantity)throw new PublicError('An item is unavailable or has insufficient stock. Please review your cart.');
   subtotal+=v.price*item.quantity;weight+=(v.weightGrams??0)*item.quantity;validated.push({v,p,c,quantity:item.quantity});
  }
  const rules=await tx.select().from(s.shippingRules).where(eq(s.shippingRules.active,true));
  const shippingRule=rules.find((r:any)=>r.country===customer.country&&r.state.toLowerCase()===customer.state.toLowerCase())??rules.find((r:any)=>r.country===customer.country&&r.state==='*');
  if(!shippingRule)throw new PublicError('Shipping to this location requires a quotation.');
  if(shippingRule.type==='per_kg'&&validated.some(i=>!i.v.weightGrams))throw new PublicError('Garment shipping weights require configuration.');
  const shipping=shippingRule.amount*(shippingRule.type==='per_kg'?Math.ceil(weight/1000):1);
  const basis=z.number().int().min(0).max(10000).parse(Number(store.taxBasisPoints));const tax=Math.round(subtotal*basis/10000);const total=subtotal+shipping+tax;
  if(total<=0||total>100000000)throw new PublicError('Please contact us to place this order.');
  const [order]=await tx.insert(s.orders).values({reference:`AUR-${randomUUID().slice(0,8).toUpperCase()}`,owner:`user:${user.id}`,customer,subtotal,shipping,tax,total,checkoutKey:key}).returning();
  for(const i of validated){await tx.insert(s.orderItems).values({orderId:order.id,variantId:i.v.id,name:i.p.name,colour:i.c.name,size:i.v.size,quantity:i.quantity,price:i.v.price,lineTotal:i.quantity*i.v.price});await tx.update(s.variants).set({stock:i.v.stock-i.quantity}).where(eq(s.variants.id,i.v.id));await tx.insert(s.inventoryMovements).values({variantId:i.v.id,quantity:-i.quantity,reason:`Reserved for ${order.reference}`,actor:user.id});}
  await tx.insert(s.orderHistory).values({orderId:order.id,status:'pending_payment',actor:user.id});
  await tx.delete(s.cartItems).where(eq(s.cartItems.cartId,cart.id));return order;
 });
 if(['paid','partially_refunded'].includes(result.paymentStatus))return {paid:true,reference:result.reference};
 let gatewayOrderId=result.gatewayOrderId;
 if(!gatewayOrderId){
  // A lock covers external order creation as well, preventing retry races.
  gatewayOrderId=await db.transaction(async(tx:any)=>{const [o]=await tx.select().from(s.orders).where(eq(s.orders.id,result.id)).for('update');if(o.gatewayOrderId)return o.gatewayOrderId;const remote=await razorpay.orders.create({amount:o.total,currency:'INR',receipt:o.reference});await tx.update(s.orders).set({gatewayOrderId:remote.id}).where(eq(s.orders.id,o.id));return remote.id;});
 }
 return {keyId:process.env.RAZORPAY_KEY_ID,orderId:gatewayOrderId,amount:result.total,subtotal:result.subtotal,shipping:result.shipping,tax:result.tax,currency:'INR',reference:result.reference,customer};
}
export async function capturePayment(paymentId:string,gatewayOrderId:string,eventId?:string){
 const payment=await gateway().payments.fetch(paymentId);
 if(payment.status!=='captured'||payment.order_id!==gatewayOrderId||payment.currency!=='INR')throw new PublicError('Payment is awaiting trusted capture confirmation. Please check your account shortly.',409);
 return db.transaction(async(tx:any)=>{
  const [order]=await tx.select().from(s.orders).where(eq(s.orders.gatewayOrderId,gatewayOrderId)).for('update');
  if(!order||Number(payment.amount)!==order.total)throw new PublicError('Payment details do not match the order.',400);
  if(eventId){const [event]=await tx.select().from(s.paymentEvents).where(eq(s.paymentEvents.id,eventId));if(event)return {reference:order.reference};}
  const [known]=await tx.select().from(s.payments).where(eq(s.payments.gatewayPaymentId,paymentId));
  if(!known){
   if(['paid','partially_refunded','refunded'].includes(order.paymentStatus))throw new PublicError('An additional payment needs merchant reconciliation.',409);
   let canFulfil=true;
   if(!order.stockReserved){const items=await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId,order.id));for(const i of items){if(!i.variantId)continue;const [v]=await tx.select().from(s.variants).where(eq(s.variants.id,i.variantId)).for('update');if(v.stock<i.quantity)canFulfil=false;}
    if(canFulfil)for(const i of items){if(!i.variantId)continue;const [v]=await tx.select().from(s.variants).where(eq(s.variants.id,i.variantId));await tx.update(s.variants).set({stock:v.stock-i.quantity}).where(eq(s.variants.id,i.variantId));await tx.insert(s.inventoryMovements).values({variantId:i.variantId,quantity:-i.quantity,reason:`Late captured payment ${order.reference}`,actor:'gateway'});}
   }
   await tx.insert(s.payments).values({orderId:order.id,gatewayPaymentId:paymentId,amount:order.total,status:'captured'});
   await tx.update(s.orders).set({paymentStatus:'paid',status:canFulfil?'confirmed':'payment_review',stockReserved:canFulfil}).where(eq(s.orders.id,order.id));
   await tx.insert(s.orderHistory).values({orderId:order.id,status:canFulfil?'confirmed':'payment_review',actor:'gateway',note:canFulfil?'Captured payment verified':'Payment captured after reservation release; merchant reconciliation required'});
   await tx.insert(s.notifications).values({event:'payment_confirmed',recipient:order.customer.email,payload:{reference:order.reference}});
  }
  if(eventId)await tx.insert(s.paymentEvents).values({id:eventId,type:'payment.captured'}).onConflictDoNothing();
  return {reference:order.reference};
 });
}
export async function verifyPayment(request:Request){
 const user=await requireCustomer();const b=z.object({razorpay_order_id:z.string(),razorpay_payment_id:z.string(),razorpay_signature:z.string()}).parse(await request.json());
 const [order]=await db.select().from(s.orders).where(and(eq(s.orders.gatewayOrderId,b.razorpay_order_id),eq(s.orders.owner,`user:${user.id}`)));if(!order)throw new PublicError('Order not found.',404);
 if(!process.env.RAZORPAY_KEY_SECRET||!validSignature(`${b.razorpay_order_id}|${b.razorpay_payment_id}`,b.razorpay_signature,process.env.RAZORPAY_KEY_SECRET))throw new PublicError('Payment signature verification failed. No payment status was changed.',400);
 return capturePayment(b.razorpay_payment_id,b.razorpay_order_id);
}
export async function webhook(request:Request){
 const raw=await request.text();const secret=process.env.RAZORPAY_WEBHOOK_SECRET;
 if(!secret||!validSignature(raw,request.headers.get('x-razorpay-signature')??'',secret))throw new PublicError('Invalid webhook signature.',401);
 const event=JSON.parse(raw);const payment=event.payload?.payment?.entity;
 if(event.event==='refund.processed'&&event.payload?.refund?.entity?.payment_id){await syncRefund(event.payload.refund.entity.payment_id);return {received:true};}
 if(event.event==='payment.failed'&&payment?.id&&payment?.order_id){await recordFailedPayment(payment.id,payment.order_id);return {received:true};}
 if(event.event==='payment.captured'&&payment?.id&&payment?.order_id)return capturePayment(payment.id,payment.order_id,request.headers.get('x-razorpay-event-id')??payment.id);
 // Failed/authorized events never mark orders paid. Captured payments remain authoritative.
 return {received:true};
}
export async function releaseReservation(id:string,actorId:string){
 return db.transaction(async(tx:any)=>{
  const [order]=await tx.select().from(s.orders).where(eq(s.orders.id,id)).for('update');if(!order||['paid','partially_refunded','refunded'].includes(order.paymentStatus)||!order.stockReserved)throw new PublicError('Only unpaid reserved orders can be cancelled.');
  if(Date.now()-new Date(order.createdAt).getTime()<30*60*1000)throw new PublicError('Wait at least 30 minutes before releasing a payment reservation.');
  if(order.gatewayOrderId){const remote=await gateway().orders.fetchPayments(order.gatewayOrderId);if(remote.items.some(p=>p.status==='captured'||p.status==='authorized'))throw new PublicError('A captured or authorized payment exists. Reconcile it with Razorpay before continuing.');}
  const items=await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId,id));
  for(const item of items){if(!item.variantId)continue;const [v]=await tx.select().from(s.variants).where(eq(s.variants.id,item.variantId)).for('update');await tx.update(s.variants).set({stock:v.stock+item.quantity}).where(eq(s.variants.id,item.variantId));await tx.insert(s.inventoryMovements).values({variantId:v.id,quantity:item.quantity,reason:`Cancelled unpaid reservation ${order.reference}`,actor:actorId});}
  await tx.update(s.orders).set({status:'cancelled',stockReserved:false}).where(eq(s.orders.id,id));await tx.insert(s.orderHistory).values({orderId:id,status:'cancelled',actor:actorId});await tx.insert(s.auditLogs).values({actor:actorId,action:'release_unpaid_reservation',resource:'orders',recordId:id});return {success:true};
 });
}

async function syncRefund(paymentId:string){
 const remote=await gateway().payments.fetch(paymentId);const refunded=Number(remote.amount_refunded??0);
 if(!refunded||!remote.order_id)return;
 return db.transaction(async(tx:any)=>{const [order]=await tx.select().from(s.orders).where(eq(s.orders.gatewayOrderId,remote.order_id)).for('update');if(!order||refunded<=order.refundedAmount)return;if(Number(remote.amount)!==order.total||refunded>order.total)throw new PublicError('Refund does not match the order.');const full=refunded===order.total;await tx.update(s.orders).set({refundedAmount:refunded,paymentStatus:full?'refunded':'partially_refunded',...(full?{status:'refunded'}:{})}).where(eq(s.orders.id,order.id));await tx.insert(s.orderHistory).values({orderId:order.id,status:full?'refunded':'partially_refunded',actor:'gateway',note:'Refund amount verified with Razorpay. Stock is adjusted separately after returned goods are inspected.'});await tx.insert(s.auditLogs).values({actor:'gateway',action:'verified_refund',resource:'orders',recordId:order.id,details:{amount:refunded}});});
}
async function recordFailedPayment(paymentId:string,orderId:string){
 const remote=await gateway().payments.fetch(paymentId);if(remote.status!=='failed'||remote.order_id!==orderId)return;
 await db.transaction(async(tx:any)=>{const [order]=await tx.select().from(s.orders).where(eq(s.orders.gatewayOrderId,orderId)).for('update');if(!order)return;const saved=await tx.insert(s.payments).values({orderId:order.id,gatewayPaymentId:paymentId,amount:Number(remote.amount),status:'failed'}).onConflictDoNothing().returning();if(saved.length&&order.paymentStatus==='pending')await tx.insert(s.orderHistory).values({orderId:order.id,status:'pending_payment',actor:'gateway',note:'A failed payment attempt was verified. The order remains unpaid and may be retried.'});});
}
