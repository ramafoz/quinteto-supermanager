'use client';
import {useState} from 'react';
import {authApi} from '@/components/acb-login';
export default function Recover(){const[error,setError]=useState('');const[busy,setBusy]=useState(false);return <main className="panel" style={{maxWidth:520,margin:'10vh auto',padding:32}}><h1>Acceso do administrador</h1><p style={{margin:'20px 0'}}>Recupera a túa sesión coa conta coa que creaches a liga. Os colegas entran directamente coa súa conta ACB.</p>{error&&<p className="error" role="alert">{error}</p>}<button className="button primary" disabled={busy} onClick={()=>{setBusy(true);void authApi('recover').then(()=>location.replace('/')).catch(e=>{setError(e.message);setBusy(false);});}}>Recuperar a miña sesión</button></main>;}
