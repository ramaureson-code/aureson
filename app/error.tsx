'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="empty"><span className="eyebrow">LET’S TRY THAT AGAIN</span><h1>Something interrupted the thread.</h1><p>We couldn’t load this page. Your payment status is always verified securely; an error page does not confirm a payment.</p><button className="button dark" onClick={reset}>Try again</button><p><Link href="/contact">Contact our team</Link></p></div>;}
