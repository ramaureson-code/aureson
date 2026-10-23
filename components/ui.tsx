'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, AlertCircle, LoaderCircle } from 'lucide-react';
export async function api<T=any>(url:string,body?:unknown,method='POST'):Promise<T>{
 const response=await fetch(`/api/${url}`,body===undefined?{cache:'no-store'}:{method,headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error??'Something went wrong. Please try again.');return data;
}
export function useData<T=any>(path:string){const [data,setData]=useState<T|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [version,setVersion]=useState(0);useEffect(()=>{let active=true;setLoading(true);setError('');api<T>(path).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[path,version]);return {data,error,loading,reload:()=>setVersion(v=>v+1),setData};}
export function ErrorBox({message}:{message:string}){return message?<div className="notice error" role="alert"><AlertCircle size={18}/><span>{message}</span></div>:null;}
export function Loading(){return <div className="loading-grid" aria-label="Loading" role="status">{[1,2,3].map(i=><div className="skeleton" key={i}/>)}<span className="sr-only">Loading…</span></div>;}
export function Empty({title,description,href='/shop',cta='Explore the collection'}:{title:string;description:string;href?:string;cta?:string}){return <div className="empty"><span className="eyebrow">AURESON APPARELS</span><h2>{title}</h2><p>{description}</p><Link className="button dark" href={href}>{cta}<ArrowUpRight size={17}/></Link></div>;}
export function Submit({busy,children}:{busy:boolean;children:React.ReactNode}){return <button className="button red" disabled={busy} type="submit">{busy?<LoaderCircle size={18} className="spin"/>:children}</button>;}
export function PageTitle({eyebrow,title,description}:{eyebrow:string;title:string;description?:string}){return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>;}
