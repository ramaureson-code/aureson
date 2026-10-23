import 'server-only';
import { getUser } from '@netlify/identity';
import { cookies } from 'next/headers';
import { randomUUID, createHash } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import { db } from '@/db';
import * as s from '@/db/schema';
export class PublicError extends Error { constructor(message:string,public status=400){super(message);} }
export async function currentUser(){ return await getUser(); }
export async function actor(permission?:string){
 const user=await getUser(); if(!user)throw new PublicError('Please sign in to continue.',401);
 const [member]=await db.select().from(s.adminMembers).where(eq(s.adminMembers.id,user.id));
 const role=member?.role ?? (user.roles?.includes('admin')?'super_admin':user.roles?.find(r=>['super_admin','product_manager','order_manager','staff'].includes(r)));
 const allowed:Record<string,string[]>={super_admin:['super','products','orders','content'],product_manager:['products'],order_manager:['orders'],staff:['orders','content']};
 if(permission&&!allowed[role??'']?.includes(permission))throw new PublicError('You do not have permission to access this area.',403);
 return {user,role};
}
export async function owner(create=true){
 const user=await getUser(); if(user)return {key:`user:${user.id}`,user};
 const jar=await cookies();let key=jar.get('aureson_cart')?.value;
 if(!key&&create){key=randomUUID();jar.set('aureson_cart',key,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:60*60*24*30,path:'/'});}
 return {key:`guest:${key??'none'}`,user:null};
}
export async function requireCustomer(){ const user=await getUser();if(!user)throw new PublicError('Sign in to securely access your orders.',401);return user; }
export async function limit(request:Request,bucket:string,max=20){
 const ip=request.headers.get('x-nf-client-connection-ip')??'unknown';
 const key=createHash('sha256').update(`${bucket}:${ip}`).digest('hex');
 const [row]=await db.insert(s.rateLimits).values({key,hits:1,expiresAt:new Date(Date.now()+600000)}).onConflictDoUpdate({target:s.rateLimits.key,set:{hits:sql`CASE WHEN ${s.rateLimits.expiresAt} < now() THEN 1 ELSE ${s.rateLimits.hits}+1 END`,expiresAt:sql`CASE WHEN ${s.rateLimits.expiresAt} < now() THEN now()+interval '10 minutes' ELSE ${s.rateLimits.expiresAt} END`}}).returning();
 if(row.hits>max)throw new PublicError('Too many requests. Please try again in a few minutes.',429);
}
export async function storeSettings(){const rows=await db.select().from(s.settings);return Object.fromEntries(rows.map(r=>[r.key,r.value]));}
export async function audit(actorId:string,action:string,resource:string,recordId:string,details:unknown={}){await db.insert(s.auditLogs).values({actor:actorId,action,resource,recordId,details});}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new PublicError('Request origin is not allowed.',403);}
export async function publicCatalogue(){
 const products=await db.select().from(s.products).where(eq(s.products.status,'active'));
 const [colours,variants,categories,images]=await Promise.all([db.select().from(s.colours).where(eq(s.colours.enabled,true)),db.select().from(s.variants).where(eq(s.variants.enabled,true)),db.select().from(s.categories).where(eq(s.categories.active,true)),db.select().from(s.productImages)]);
 return {products:products.map(p=>({...p,colours:colours.filter(c=>c.productId===p.id),variants:variants.filter(v=>v.productId===p.id&&colours.some(c=>c.id===v.colourId)),images:images.filter(i=>i.productId===p.id)})),categories};
}
export async function cartData(key:string){
 const [cart]=await db.select().from(s.carts).where(eq(s.carts.owner,key));if(!cart)return [];
 return db.select({id:s.cartItems.id,variantId:s.variants.id,quantity:s.cartItems.quantity,name:s.products.name,slug:s.products.slug,image:s.products.image,colour:s.colours.name,colourImage:s.colours.image,size:s.variants.size,price:s.variants.price,stock:s.variants.stock,enabled:s.variants.enabled,colourEnabled:s.colours.enabled,productStatus:s.products.status,weightGrams:s.variants.weightGrams}).from(s.cartItems).innerJoin(s.variants,eq(s.cartItems.variantId,s.variants.id)).innerJoin(s.products,eq(s.variants.productId,s.products.id)).innerJoin(s.colours,eq(s.variants.colourId,s.colours.id)).where(eq(s.cartItems.cartId,cart.id));
}
