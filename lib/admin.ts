import 'server-only';
import { z } from 'zod';
import { eq, desc, sql,and } from 'drizzle-orm';
import { db } from '@/db';
import * as s from '@/db/schema';
import { resources } from './resources';
import { actor, PublicError,storeSettings } from './server';
const tables:Record<string,any>={...s,customers:s.profiles};
const onlyUpdate=['orders','bulkEnquiries','contactEnquiries'];
export async function adminResource(request:Request,resource:string,id?:string){
 const config=resources[resource];if(!config)throw new PublicError('Unknown section.',404);
 const {user}=await actor(config.permission);const table=tables[resource];
 if(request.method==='GET'){
  const params=new URL(request.url).searchParams;const primary=resource==='settings'?table.key:table.id;const page=Math.max(0,Math.min(100000,Number(params.get('page')??0)||0));const q=params.get('q')?.slice(0,200);const status=params.get('status');const date=params.get('date');
  const clauses=[];if(id)clauses.push(eq(primary,id));else{if(q)clauses.push(sql`row_to_json(${table})::text ILIKE ${'%'+q+'%'}`);if(status&&table.status)clauses.push(eq(table.status,status));if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&table.createdAt)clauses.push(sql`${table.createdAt} >= ${date}::date AND ${table.createdAt} < ${date}::date + interval '1 day'`);}
  const pageSize=params.has('page')?200:500;const rows:any[]=await db.select().from(table).where(and(...clauses)).orderBy(...(table.createdAt?[desc(table.createdAt),primary]:[primary])).limit(id?1:pageSize).offset(id?0:page*pageSize);
  if(resource==='customers'&&id){const [profile]=rows.filter((r:any)=>r.id===id);if(!profile)throw new PublicError('Customer not found.',404);return {...profile,orders:await db.select().from(s.orders).where(eq(s.orders.owner,`user:${id}`)),enquiries:await db.select().from(s.bulkEnquiries).where(eq(s.bulkEnquiries.email,profile.email))};}
  if(resource==='orders'&&id){const [order]=rows.filter((r:any)=>r.id===id);if(!order)throw new PublicError('Order not found.',404);return {...order,items:await db.select().from(s.orderItems).where(eq(s.orderItems.orderId,id)),history:await db.select().from(s.orderHistory).where(eq(s.orderHistory.orderId,id)),shippingDetails:await db.select().from(s.shippingDetails).where(eq(s.shippingDetails.orderId,id))};}
  return rows;
 }
 if(config.readonly)throw new PublicError('This section is read only.',403);
 if(request.method==='DELETE')throw new PublicError('Archive records instead of deleting history.');
 if(!['POST','PATCH'].includes(request.method))throw new PublicError('Method not allowed.',405);
 if(!id&&onlyUpdate.includes(resource))throw new PublicError('This record cannot be created manually.');
 const body=await request.json();const data:Record<string,any>={};
 for(const f of config.fields){
  if(!(f.key in body)){if(f.required&&!id)throw new PublicError(`${f.label} is required.`);continue;}
  let value=body[f.key];
  if(f.type==='number'){value=value===''||value===null?null:z.number().int().min(0).max(100000000).parse(Number(value));}
  else if(f.type==='checkbox')value=z.boolean().parse(value);
  else if(f.type==='json')value=z.record(z.unknown()).parse(value);
  else if(f.type==='select')value=z.enum(f.options as [string,...string[]]).parse(value);
  else value=z.string().max(f.type==='textarea'?20000:1000).parse(value).trim();
  if(f.type==='number'&&value===null&&!['price','gsm','weightGrams'].includes(f.key))throw new PublicError(`Enter ${f.label}; use 0 only when confirmed.`);
  if(f.required&&(value===null||value===''))throw new PublicError(`${f.label} is required.`);
  if((f.key.endsWith('Id')||f.key==='sku')&&value==='')value=null;
  if(['image','url'].includes(f.key)&&value&&!/^\/(img\/|api\/files\/)/.test(value))throw new PublicError('Choose an uploaded image or a supplied /img/ asset.');
  if(f.key==='ctaUrl'&&value&&!/^\/(?!\/)/.test(value))throw new PublicError('Banner destinations must be local paths.');
  if(f.key==='slug'&&!/^[a-z0-9-]+$/.test(value))throw new PublicError('Use lowercase letters, numbers and hyphens in URL slugs.');
  data[f.key]=value;
 }
 if(resource==='shippingRules'&&data.country!==undefined)z.literal('India').parse(data.country);
 if(resource==='pricingRules'&&data.minQuantity!==undefined)z.number().int().min(30).parse(data.minQuantity);
 if(resource==='products'&&data.specifications)z.record(z.string().max(1000)).parse(data.specifications);
 if(resource==='settings'&&data.value){
  const group=id??data.key;if(!['store','business','content','policies'].includes(group))throw new PublicError('Choose the store, business, content or policies settings group.');
  if(group==='store')z.object({currency:z.literal('INR'),checkoutEnabled:z.boolean(),taxBasisPoints:z.number().int().min(0).max(10000).nullable(),policiesApproved:z.boolean(),lowStockThreshold:z.number().int().min(0),minimumBulkQuantity:z.number().int().min(30),notificationsEnabled:z.literal(false)}).parse(data.value);
  if(group==='business'){z.record(z.string()).parse(data.value);if(data.value.email)z.string().email().parse(data.value.email);if(data.value.whatsapp)z.string().regex(/^\d{10,15}$/).parse(data.value.whatsapp);}
  if(group==='content')z.object({announcementEnabled:z.boolean(),announcement:z.string().max(500),heroTitle:z.string().max(160),heroDescription:z.string().max(1000),heroImage:z.string(),bulkTitle:z.string().max(160),bulkDescription:z.string().max(2000)}).passthrough().parse(data.value);
  if(group==='policies')z.record(z.string().max(30000)).parse(data.value);
  if(data.value.currency&&data.value.currency!=='INR')throw new PublicError('This store currently accepts INR only.');
  if(data.value.notificationsEnabled===true)throw new PublicError('Connect and test a notification delivery adapter before enabling notifications.');
  if(data.value.minimumBulkQuantity!==undefined)z.number().int().min(30).max(100000).parse(data.value.minimumBulkQuantity);
  if(data.value.lowStockThreshold!==undefined)z.number().int().min(0).max(100000).parse(data.value.lowStockThreshold);
  if(data.value.instagram&&!/^https:\/\//.test(String(data.value.instagram)))throw new PublicError('Social links must use HTTPS.');
  if(data.value.heroImage&&!/^\/(img\/|api\/files\/)/.test(String(data.value.heroImage)))throw new PublicError('Select an uploaded or supplied hero image.');
  if(data.value.taxBasisPoints!==undefined&&data.value.taxBasisPoints!==null)z.number().int().min(0).max(10000).parse(data.value.taxBasisPoints);
 }
 if(resource==='settings'&&/secret|password|token|credential|key_id|api_key/i.test(JSON.stringify(data.value)))throw new PublicError('Store credentials privately in deployment settings, never in content settings.');
 return db.transaction(async(tx:any)=>{
  const primary=resource==='settings'?table.key:table.id;
  const [existing]=id?await tx.select().from(table).where(eq(primary,id)).for('update'):[];
  if(id&&!existing)throw new PublicError('Record not found.',404);
  if(resource==='adminMembers'&&(id??data.id)===user.id)throw new PublicError('You cannot change your own staff permission.');
  if(resource==='variants'){
   const productId=data.productId??existing?.productId; const colourId=data.colourId??existing?.colourId;
   const [c]=await tx.select().from(s.colours).where(eq(s.colours.id,colourId));
   if(!c||c.productId!==productId)throw new PublicError('The colour must belong to this product.');
   if(existing&&(productId!==existing.productId||colourId!==existing.colourId||data.size&&data.size!==existing.size))throw new PublicError('Create a new variant to change its product, colour or size.');
   const next={...existing,...data};
   if(next.enabled&&(!c.enabled||!c.name||!next.price||!next.sku))throw new PublicError('Set a verified colour, SKU and price before enabling the variant.');
   if(data.stock!==undefined&&data.stock!==existing?.stock&&!data.adjustmentReason)throw new PublicError('Explain the stock adjustment.');
  }
  if(resource==='products'&&data.status==='active'){
   if(!id)throw new PublicError('Save a draft first, configure its colours and variants, then publish.');
   const cs=await tx.select().from(s.colours).where(eq(s.colours.productId,id??''));
   const vs=await tx.select().from(s.variants).where(eq(s.variants.productId,id??''));
   if(!(data.image??existing?.image)||!(data.fabric??existing?.fabric)||!(data.gsm??existing?.gsm)||!(data.description??existing?.description)||!cs.some((c:any)=>c.enabled&&c.name&&c.hex)||!vs.some((v:any)=>v.enabled&&v.price&&v.sku&&v.size))throw new PublicError('Save the draft, configure verified fabric, GSM, description, colours, images, sizes, prices and variants, then publish.');
  }
  if(resource==='colours'&&existing&&data.productId&&data.productId!==existing.productId)throw new PublicError('Create a new colour option instead of moving one to another product.');
  if(resource==='colours'&&(data.enabled??existing?.enabled)&&(!(data.name??existing?.name)||!/^#[0-9a-f]{6}$/i.test(data.hex??existing?.hex??'')))throw new PublicError('Set a verified colour name and a six-digit swatch colour.');
  if(resource==='orders'){
   if(data.status&&(!['paid','partially_refunded'].includes(existing.paymentStatus)||existing.status==='payment_review'))throw new PublicError('Only verified paid orders can enter fulfilment.');
   const flow=['confirmed','processing','packed','shipped','delivered'];
   if(data.status&&flow.indexOf(data.status)<flow.indexOf(existing.status))throw new PublicError('Order fulfilment cannot move backwards.');
   if(data.status==='shipped'&&!(data.trackingNumber))throw new PublicError('Enter the shipment tracking number.');
   if(data.trackingUrl&&!/^https:\/\//.test(data.trackingUrl))throw new PublicError('Tracking URLs must use HTTPS.');
   if(data.courier!==undefined||data.trackingNumber!==undefined){if(!['paid','partially_refunded'].includes(existing.paymentStatus))throw new PublicError('Only paid orders may be shipped.');await tx.insert(s.shippingDetails).values({orderId:id,courier:data.courier??'',trackingNumber:data.trackingNumber??'',trackingUrl:data.trackingUrl??''}).onConflictDoUpdate({target:s.shippingDetails.orderId,set:{courier:data.courier??'',trackingNumber:data.trackingNumber??'',trackingUrl:data.trackingUrl??''}});}
   delete data.courier;delete data.trackingNumber;delete data.trackingUrl;
   if(data.status&&data.status!==existing.status){await tx.insert(s.orderHistory).values({orderId:id,status:data.status,actor:user.id});await tx.insert(s.notifications).values({event:'order_status',recipient:existing.customer.email,payload:{reference:existing.reference,status:data.status}});}
  }
  if(resource==='quotations'){
   if(existing&&data.enquiryId&&data.enquiryId!==existing.enquiryId)throw new PublicError('An existing quotation cannot be reassigned.');
   if(data.status==='sent'&&(!(data.amount??existing?.amount)||!(data.description??existing?.description)))throw new PublicError('Set the approved amount and terms before marking a quotation sent.');
   if(existing?.status==='accepted')throw new PublicError('Accepted quotations cannot be edited.');
   if(data.amount!==undefined&&data.amount<=0)throw new PublicError('Quotation amount must be positive.');
  }
  const reason=data.adjustmentReason;delete data.adjustmentReason;
  const [saved]=id?await tx.update(table).set(data).where(eq(primary,id)).returning():await tx.insert(table).values(data).returning();
  if(resource==='variants'&&saved.stock!==(existing?.stock??0))await tx.insert(s.inventoryMovements).values({variantId:saved.id,quantity:saved.stock-(existing?.stock??0),reason:reason??'Initial inventory',actor:user.id});
  await tx.insert(s.auditLogs).values({actor:user.id,action:id?'update':'create',resource,recordId:String(saved.id??saved.key),details:{fields:Object.keys(data)}});
  return saved;
 });
}
export async function overview(){
 await actor('orders');
 const config=await storeSettings();const orderLines=await db.select().from(s.orderItems);const threshold=Number(config.store?.lowStockThreshold??5);
 const [orders,products,variants,bulk,contacts]=await Promise.all([db.select().from(s.orders),db.select().from(s.products),db.select().from(s.variants),db.select().from(s.bulkEnquiries),db.select().from(s.contactEnquiries)]);
 const paidIds=new Set(orders.filter(o=>['paid','partially_refunded'].includes(o.paymentStatus)).map(o=>o.id));const performance:Record<string,{name:string;quantity:number;garmentSales:number}>={};for(const line of orderLines){if(!paidIds.has(line.orderId))continue;const key=line.name;performance[key]??={name:line.name,quantity:0,garmentSales:0};performance[key].quantity+=line.quantity;performance[key].garmentSales+=line.lineTotal;}
 return {performance:Object.values(performance),totalOrders:orders.length,pendingPayments:orders.filter(o=>o.paymentStatus==='pending').length,paidOrders:orders.filter(o=>o.paymentStatus==='paid').length,paidSales:orders.filter(o=>['paid','partially_refunded'].includes(o.paymentStatus)).reduce((n,o)=>n+o.total-o.refundedAmount,0),products:products.length,activeProducts:products.filter(p=>p.status==='active').length,lowStock:variants.filter(v=>v.enabled&&v.stock<threshold).length,bulkEnquiries:bulk.length,recentOrders:orders.slice(-8).reverse(),recentEnquiries:contacts.slice(-5).reverse(),readiness:{payments:!!process.env.RAZORPAY_KEY_ID&&!!process.env.RAZORPAY_KEY_SECRET,webhook:!!process.env.RAZORPAY_WEBHOOK_SECRET,checkout:!!config.store?.checkoutEnabled,policies:!!config.store?.policiesApproved,tax:config.store?.taxBasisPoints!==null&&config.store?.taxBasisPoints!==undefined,notifications:false}};
}
