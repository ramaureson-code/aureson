import { NextRequest,NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z,ZodError } from 'zod';
import { and,eq,desc,sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { db } from '@/db';
import * as s from '@/db/schema';
import { actor,owner,requireCustomer,limit,sameOrigin,storeSettings,publicCatalogue,cartData,PublicError,currentUser } from '@/lib/server';
import { adminResource,overview } from '@/lib/admin';
import { checkout,verifyPayment,webhook,releaseReservation,gateway } from '@/lib/payments';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function handler(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 try{
  const {path}=await params;const route=path.join('/');const method=request.method;
  if(route==='payments/webhook'&&method==='POST')return json(await webhook(request));
  if(!['GET','HEAD'].includes(method)){sameOrigin(request);if(Number(request.headers.get('content-length')??0)>6*1024*1024)throw new PublicError('Request is too large.',413);}
  if(route==='catalogue'&&method==='GET')return json(await publicCatalogue());
  if(route==='content'&&method==='GET'){const all=await storeSettings();const banners=await db.select().from(s.banners).where(eq(s.banners.active,true));return json({business:all.business??{},content:all.content??{},policies:all.policies??{},checkoutEnabled:!!all.store?.checkoutEnabled,banners});}
  if(route==='auth/preflight'&&method==='POST'){await limit(request,'login',10);return json({allowed:true});}
  if(route==='profile'&&method==='POST'){const u=await requireCustomer();await db.insert(s.profiles).values({id:u.id,email:u.email??'',name:u.name??''}).onConflictDoUpdate({target:s.profiles.id,set:{email:u.email??'',name:u.name??''}});return json({success:true});}
  if(route==='cart'&&method==='GET'){const o=await owner();await mergeCart(o.key);return json(await cartData(o.key));}
  if(route==='cart'&&method==='POST'){
   await limit(request,'cart',100);const o=await owner();const body=z.object({variantId:z.string().uuid(),quantity:z.number().int().min(0).max(99),replace:z.boolean().optional()}).parse(await request.json());
   const result=await db.transaction(async(tx:any)=>{
    await tx.insert(s.carts).values({owner:o.key}).onConflictDoNothing();const [cart]=await tx.select().from(s.carts).where(eq(s.carts.owner,o.key)).for('update');
    const [v]=await tx.select().from(s.variants).where(eq(s.variants.id,body.variantId));if(!v)throw new PublicError('Product variant not found.',404);
    const [p]=await tx.select().from(s.products).where(eq(s.products.id,v.productId));const [c]=await tx.select().from(s.colours).where(eq(s.colours.id,v.colourId));
    const [item]=await tx.select().from(s.cartItems).where(and(eq(s.cartItems.cartId,cart.id),eq(s.cartItems.variantId,v.id)));
    const qty=body.replace?body.quantity:(item?.quantity??0)+body.quantity;
    if(qty===0){await tx.delete(s.cartItems).where(and(eq(s.cartItems.cartId,cart.id),eq(s.cartItems.variantId,v.id)));return;}
    if(!v.enabled||!c.enabled||p.status!=='active'||!v.price||qty>v.stock||qty>99)throw new PublicError('This quantity or variant is unavailable.');
    await tx.insert(s.cartItems).values({cartId:cart.id,variantId:v.id,quantity:qty}).onConflictDoUpdate({target:[s.cartItems.cartId,s.cartItems.variantId],set:{quantity:qty}});
   });return json(await cartData(o.key));
  }
  if(route==='checkout'&&method==='POST'){await limit(request,'checkout',10);return json(await checkout(request));}
  if(route==='payments/verify'&&method==='POST'){await limit(request,'verify',30);return json(await verifyPayment(request));}
  if(route==='account'&&method==='GET'){
   const u=await requireCustomer();const orders=await db.select().from(s.orders).where(eq(s.orders.owner,`user:${u.id}`)).orderBy(desc(s.orders.createdAt));
   const safe=await Promise.all(orders.map(async({internalNotes,checkoutKey,owner,...order})=>({...order,items:await db.select().from(s.orderItems).where(eq(s.orderItems.orderId,order.id)),history:(await db.select().from(s.orderHistory).where(eq(s.orderHistory.orderId,order.id))).map(h=>({status:h.status,createdAt:h.createdAt})),shipment:await db.select().from(s.shippingDetails).where(eq(s.shippingDetails.orderId,order.id))})));
   const enquiries=await db.select().from(s.bulkEnquiries).where(sql`lower(${s.bulkEnquiries.email}) = ${(u.email??'').toLowerCase()}`);const quotes=[];
   if(u.confirmedAt)for(const e of enquiries){const qs=await db.select().from(s.quotations).where(eq(s.quotations.enquiryId,e.id));for(const q of qs.filter(q=>['sent','accepted'].includes(q.status)))quotes.push({...q,enquiryReference:e.reference});}
   return json({orders:safe,quotations:quotes});
  }
  if(route==='orders/retry'&&method==='POST'){
   const u=await requireCustomer();const config=await storeSettings();if(!config.store?.checkoutEnabled||!config.store?.policiesApproved||!process.env.RAZORPAY_WEBHOOK_SECRET)throw new PublicError('Payment collection requires completed store configuration.',503);const {id}=z.object({id:z.string().uuid()}).parse(await request.json());const [o]=await db.select().from(s.orders).where(and(eq(s.orders.id,id),eq(s.orders.owner,`user:${u.id}`)));
   if(!o||['paid','partially_refunded','refunded'].includes(o.paymentStatus)||o.status==='cancelled')throw new PublicError('This order cannot be paid again.');
   let gatewayId=o.gatewayOrderId;
   if(!gatewayId)gatewayId=await db.transaction(async(tx:any)=>{const [locked]=await tx.select().from(s.orders).where(eq(s.orders.id,id)).for('update');if(locked.gatewayOrderId)return locked.gatewayOrderId;const remote=await gateway().orders.create({amount:locked.total,currency:'INR',receipt:locked.reference});await tx.update(s.orders).set({gatewayOrderId:remote.id}).where(eq(s.orders.id,id));return remote.id;});
   return json({keyId:process.env.RAZORPAY_KEY_ID,orderId:gatewayId,amount:o.total,currency:'INR',reference:o.reference,customer:o.customer});
  }
  if(route==='contact'&&method==='POST'){
   await limit(request,'contact',5);const data=z.object({name:z.string().min(2).max(100),email:z.string().email().max(254).transform(v=>v.toLowerCase()),phone:z.string().max(20).default(''),message:z.string().min(10).max(5000),website:z.string().max(0).optional()}).parse(await request.json());delete data.website;
   const [row]=await db.insert(s.contactEnquiries).values(data).returning();await db.insert(s.notifications).values({event:'contact_received',recipient:'sales@aureson.in',payload:{enquiryId:row.id}});return json({success:true});
  }
  if(route==='bulk/options'&&method==='GET'){const rules=await db.select().from(s.pricingRules).where(eq(s.pricingRules.active,true));const config=await storeSettings();return json({rules,minimum:Math.max(30,Number(config.store?.minimumBulkQuantity??30))});}
  if(route==='bulk'&&method==='POST'){
   await limit(request,'bulk',5);const o=await owner();const data=z.object({name:z.string().min(2).max(100),email:z.string().email().transform(v=>v.toLowerCase()),phone:z.string().regex(/^[+\d ()-]{10,18}$/),quantity:z.number().int().min(30).max(100000),specifications:z.object({productType:z.string().max(100),fabric:z.string().max(100),gsm:z.number().min(140).max(400).nullable(),colour:z.string().max(100),sleeve:z.string().max(50),sizes:z.string().max(1000),method:z.string().max(100),location:z.string().min(2).max(500),instructions:z.string().max(5000),artworkId:z.string().uuid().optional(),ruleIds:z.array(z.string().uuid()).max(20).optional()})}).parse(await request.json());
   const config=await storeSettings();const minimum=Math.max(30,Number(config.store?.minimumBulkQuantity??30));if(data.quantity<minimum)throw new PublicError(`Custom orders start at ${minimum} pieces.`);
   const split=data.specifications.sizes.trim();if(split&&/^[^:,]+:\s*\d+(\s*,\s*[^:,]+:\s*\d+)*$/.test(split)){const total=split.split(',').reduce((n,part)=>n+Number(part.split(':')[1]),0);if(total!==data.quantity)throw new PublicError('Size quantities must add up to the total quantity.');}
   if(data.specifications.artworkId){const [upload]=await db.select().from(s.uploads).where(and(eq(s.uploads.id,data.specifications.artworkId),eq(s.uploads.owner,o.key)));if(!upload)throw new PublicError('Artwork upload is invalid.');}
   const [e]=await db.insert(s.bulkEnquiries).values({...data,owner:o.key,reference:`BULK-${randomUUID().slice(0,8).toUpperCase()}`}).returning();
   if(data.specifications.artworkId)await db.update(s.uploads).set({enquiryId:e.id}).where(eq(s.uploads.id,data.specifications.artworkId));
   await db.insert(s.notifications).values({event:'bulk_received',recipient:data.email,payload:{reference:e.reference}});return json({reference:e.reference});
  }
  if(route==='bulk/estimate'&&method==='POST'){
   await limit(request,'estimate',30);const b=z.object({quantity:z.number().int().min(30).max(100000),ruleIds:z.array(z.string().uuid()).max(20)}).parse(await request.json());
   const config=await storeSettings();if(b.quantity<Math.max(30,Number(config.store?.minimumBulkQuantity??30)))throw new PublicError('The quantity is below the configured minimum.');
   const rules=(await db.select().from(s.pricingRules).where(eq(s.pricingRules.active,true))).filter(r=>b.ruleIds.includes(r.id));
   if(rules.length!==new Set(b.ruleIds).size||rules.some(r=>b.quantity<r.minQuantity)||rules.filter(r=>r.type==='base_per_piece').length!==1)throw new PublicError('A confirmed base garment rule and valid options are required for an estimate. Request a final quote.');
   return json({estimate:rules.reduce((n,r)=>n+r.amount*(r.type==='fixed'?1:b.quantity),0),note:'Garments and selected customization only. Final quotation confirms taxes, shipping and approved specifications.'});
  }
  if(route==='quotations/accept'&&method==='POST'){
   const u=await requireCustomer();const {id}=z.object({id:z.string().uuid()}).parse(await request.json());
   return json(await db.transaction(async(tx:any)=>{const [q]=await tx.select().from(s.quotations).where(eq(s.quotations.id,id)).for('update');if(!q)throw new PublicError('Quotation not found.',404);const [e]=await tx.select().from(s.bulkEnquiries).where(eq(s.bulkEnquiries.id,q.enquiryId));if(!u.confirmedAt||e.email.toLowerCase()!==u.email?.toLowerCase())throw new PublicError('Verify the email address used for this enquiry.',403);if(q.orderId)return {orderId:q.orderId};if(q.status!=='sent')throw new PublicError('This quotation is not available for acceptance.');const [order]=await tx.insert(s.orders).values({reference:`AUR-${randomUUID().slice(0,8).toUpperCase()}`,owner:`user:${u.id}`,customer:{name:e.name,email:e.email,phone:e.phone,address:String(e.specifications.location??'')},subtotal:q.amount,shipping:q.shipping,tax:q.tax,total:q.amount+q.shipping+q.tax,stockReserved:false}).returning();await tx.insert(s.orderItems).values({orderId:order.id,name:q.description,colour:String(e.specifications.colour??''),size:String(e.specifications.sizes??''),quantity:e.quantity,price:Math.round(q.amount/e.quantity),lineTotal:q.amount});await tx.update(s.quotations).set({status:'accepted',orderId:order.id}).where(eq(s.quotations.id,id));await tx.update(s.bulkEnquiries).set({status:'accepted'}).where(eq(s.bulkEnquiries.id,e.id));await tx.insert(s.orderHistory).values({orderId:order.id,status:'pending_payment',actor:u.id});return {orderId:order.id};}));
  }
  if(path[0]==='admin-artwork'&&path[1]&&method==='GET'){await actor('orders');const [upload]=await db.select().from(s.uploads).where(eq(s.uploads.id,path[1]));if(!upload)throw new PublicError('Artwork not found.',404);return json({url:`/api/files/${upload.key}`});}
  if(path[0]==='files'&&path[1]&&method==='GET'){
   const [file]=await db.select().from(s.uploads).where(eq(s.uploads.key,path[1]));if(!file)throw new PublicError('File not found.',404);
   if(file.private){const o=await owner(false);let permitted=file.owner===o.key;if(!permitted){try{await actor('orders');permitted=true;}catch{}}if(!permitted)throw new PublicError('You cannot access this file.',403);}
   const bytes=await getStore(file.private?'private-artwork':'public-images').get(file.key,{type:'arrayBuffer'});if(!bytes)throw new PublicError('File not found.',404);
   return new Response(bytes,{headers:{'Content-Type':file.contentType,'Content-Disposition':`${file.private?'attachment':'inline'}; filename="${file.key}"`,'X-Content-Type-Options':'nosniff','Cache-Control':file.private?'private, no-store':'public, max-age=3600'}});
  }
  if(route==='uploads'&&method==='POST'){
   await limit(request,'uploads',10);const form=await request.formData();const file=form.get('file');if(!(file instanceof File)||file.size===0||file.size>5*1024*1024)throw new PublicError('Upload a PNG, JPEG, WebP or PDF file of up to 5 MB.');
   const isPrivate=form.get('private')!=='false';const o=await owner();if(!isPrivate){const a=await actor();if(!a.role||a.role==='disabled')throw new PublicError('Staff access required.',403);}
   let bytes:Buffer=Buffer.from(await file.arrayBuffer());const type=await fileTypeFromBuffer(bytes);if(!type||!['image/jpeg','image/png','image/webp',...(isPrivate?['application/pdf']:[])].includes(type.mime))throw new PublicError('Unsupported file contents. SVG and executable files are not accepted.');
   let mime=type.mime,ext=type.ext;
   if(mime.startsWith('image/')){bytes=await sharp(bytes,{limitInputPixels:25000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();mime='image/webp';ext='webp';}
   const key=`${randomUUID()}.${ext}`;await getStore(isPrivate?'private-artwork':'public-images').set(key,new Uint8Array(bytes).buffer);
   const [saved]=await db.insert(s.uploads).values({key,owner:o.key,private:isPrivate,contentType:mime,name:file.name.slice(0,200),size:bytes.length}).returning();return json({id:saved.id,url:`/api/files/${key}`});
  }
  if(route==='admin/me'&&method==='GET'){const a=await actor();if(!a.role||a.role==='disabled')throw new PublicError('Administrative access is required.',403);return json({role:a.role,email:a.user.email});}
  if(route==='admin/overview'&&method==='GET')return json(await overview());
  if(path[0]==='admin'&&path[1]==='release-reservation'&&method==='POST'){const a=await actor('orders');const b=z.object({id:z.string().uuid()}).parse(await request.json());return json(await releaseReservation(b.id,a.user.id));}
  if(path[0]==='admin'&&path[1])return json(await adminResource(request,path[1],path[2]));
  throw new PublicError('Page not found.',404);
 }catch(error){if(error instanceof SyntaxError)return json({error:'The request could not be read. Check your form and try again.'},400);if(error instanceof PublicError)return json({error:error.message},error.status);if(error instanceof ZodError)return json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('. ')},400);return json({error:'We could not complete this request. Please try again or contact sales@aureson.in.'},503);}
}
async function mergeCart(userKey:string){
 if(!userKey.startsWith('user:'))return;const token=(await cookies()).get('aureson_cart')?.value;if(!token)return;
 await db.transaction(async(tx:any)=>{const [guest]=await tx.select().from(s.carts).where(eq(s.carts.owner,`guest:${token}`)).for('update');if(!guest)return;await tx.insert(s.carts).values({owner:userKey}).onConflictDoNothing();const [target]=await tx.select().from(s.carts).where(eq(s.carts.owner,userKey)).for('update');const items=await tx.select().from(s.cartItems).where(eq(s.cartItems.cartId,guest.id));for(const i of items){const [v]=await tx.select().from(s.variants).where(eq(s.variants.id,i.variantId));const [old]=await tx.select().from(s.cartItems).where(and(eq(s.cartItems.cartId,target.id),eq(s.cartItems.variantId,i.variantId)));const qty=Math.min(99,v.stock,(old?.quantity??0)+i.quantity);if(qty>0)await tx.insert(s.cartItems).values({cartId:target.id,variantId:i.variantId,quantity:qty}).onConflictDoUpdate({target:[s.cartItems.cartId,s.cartItems.variantId],set:{quantity:qty}});}await tx.delete(s.cartItems).where(eq(s.cartItems.cartId,guest.id));await tx.delete(s.carts).where(eq(s.carts.id,guest.id));});
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};
