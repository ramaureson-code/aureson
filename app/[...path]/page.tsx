import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Shop,Product,Cart,Account } from '@/components/commerce';
import { About,Contact,Bulk,Policy } from '@/components/information';
import { Auth } from '@/components/auth';
import Admin from '@/components/admin';
import { Loading } from '@/components/ui';
export async function generateMetadata({params}:{params:Promise<{path:string[]}>}):Promise<Metadata>{const {path}=await params;const labels:Record<string,string>={shop:'Shop',cart:'Shopping bag',checkout:'Checkout','customized-t-shirts':'Custom apparel & bulk orders',about:'Our story',contact:'Contact',tracking:'Track your order',login:'Sign in',register:'Create account',account:'Your account',privacy:'Privacy policy',terms:'Terms & conditions',shipping:'Shipping & delivery',returns:'Returns & exchanges','payment-status':'Payment status',admin:'Staff workspace',product:'Product details'};const privatePage=['cart','checkout','login','register','account','tracking','admin','payment-status'].includes(path[0]);return {title:labels[path[0]]??'Aureson Apparels',alternates:{canonical:'/'+path.join('/')},...(privatePage?{robots:{index:false,follow:false}}:{})};}
export default async function Page({params}:{params:Promise<{path:string[]}>}){const {path}=await params;const route=path.join('/');let page;
 if(route==='shop')page=<Shop/>;else if(path[0]==='product'&&path.length===2)page=<Product slug={path[1]}/>;else if(route==='cart')page=<Cart/>;else if(route==='checkout')page=<Cart checkoutMode/>;else if(route==='customized-t-shirts')page=<Bulk/>;else if(route==='about')page=<About/>;else if(route==='contact')page=<Contact/>;else if(route==='tracking')page=<Account tracking/>;else if(route==='account')page=<Account/>;else if(route==='payment-status')page=<Account paymentStatus/>;else if(route==='login')page=<Auth/>;else if(route==='register')page=<Auth register/>;else if(['privacy','terms','shipping','returns'].includes(route))page=<Policy type={route}/>;else if(route==='admin')page=<Admin/>;else if(route==='admin/login')page=<Auth admin/>;else notFound();
 return <Suspense fallback={<div className="page-container"><Loading/></div>}>{page}</Suspense>;
}
