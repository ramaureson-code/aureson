import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { storeSettings } from '@/lib/server';
import { brand } from '@/lib/brand';
import './globals.css';
export const dynamic='force-dynamic';
const siteName='Aureson Apparels';
const siteDescription='Quality knitted apparel and custom clothing from Tiruppur, Tamil Nadu. Explore Polo T-shirts, printing, embroidery and bulk apparel for your brand.';
export const metadata:Metadata={metadataBase:new URL('https://aureson-apparels-website.netlify.app'),title:{default:`${siteName} — Your vision. Our craftsmanship.`,template:`%s | ${siteName}`},description:siteDescription,alternates:{canonical:'/'},openGraph:{siteName,title:siteName,description:siteDescription,type:'website'},robots:{index:true,follow:true}};
export default async function RootLayout({children}:{children:React.ReactNode}){
 let business:Record<string,unknown>={...brand};try{business={...business,...(await storeSettings()).business};}catch{/* Verified source copy remains available while the database is unavailable. */}
 const organization={"@context":"https://schema.org","@type":"Organization",name:business.name,url:'https://aureson-apparels-website.netlify.app',email:business.email,telephone:business.phone,foundingDate:'2022',address:{"@type":"PostalAddress",addressLocality:'Tiruppur',addressRegion:'Tamil Nadu',addressCountry:'IN'},sameAs:[business.instagram]};
 return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><Shell>{children}</Shell><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(organization).replace(/</g,'\\u003c')}}/></body></html>;
}
