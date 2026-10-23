import type { MetadataRoute } from 'next';
import { db } from '@/db';
import { products } from '@/db/schema';
import { eq } from 'drizzle-orm';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const root='https://aureson-apparels-website.netlify.app';const routes=['','/shop','/about','/contact','/customized-t-shirts','/privacy','/terms','/shipping','/returns'].map(p=>({url:root+p}));try{const all=await db.select().from(products).where(eq(products.status,'active'));return [...routes,...all.map(p=>({url:root+'/product/'+p.slug}))];}catch{return routes;}}
