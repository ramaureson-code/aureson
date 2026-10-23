import type { MetadataRoute } from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/admin','/account','/checkout','/cart','/api/','/tracking','/payment-status']},sitemap:'https://aureson-apparels-website.netlify.app/sitemap.xml'};}
