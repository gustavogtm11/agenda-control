import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, getRedirectResult } from 'firebase/auth';

export function AgendamentoPublico() {
const { companyId } = useParams();
const [user, setUser] = useState<any>(null);
const [empresa, setEmpresa] = useState<any>(null);
const [status, setStatus] = useState<'carregando' | 'logado' | 'deslogado'>('carregando');

useEffect(() => {
const initAuth = async () => {
    try {
    // Tenta capturar o resultado se voltamos do Google
    await getRedirectResult(auth);
    } catch (e) {
    console.error("Erro no redirecionamento:", e);
    }

    // Escuta o Firebase
    onAuthStateChanged(auth, (currentUser) => {
    if (currentUser) {
        setUser(currentUser);
        setStatus('logado');
    } else {
        setStatus('deslogado');
    }
    });
};
initAuth();
}, []);

// Busca empresa apenas quando estivermos 'logado'
useEffect(() => {
if (status === 'logado' && companyId) {
    getDoc(doc(db, 'empresas', companyId)).then(snap => {
    if (snap.exists() && snap.data().linkPublicoAtivo) {
        setEmpresa(snap.data());
    } else {
        setEmpresa(null);
    }
    });
}
}, [status, companyId]);

const realizarLogin = async () => {
await signInWithRedirect(auth, new GoogleAuthProvider());
};

// UI DEFINITIVA
if (status === 'carregando') return <div>Verificando sua conta...</div>;

if (status === 'deslogado') {
return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
    <h2>Bem-vindo!</h2>
    <button onClick={realizarLogin} style={{ padding: '15px', background: '#4285f4', color: 'white', border: 'none', borderRadius: '8px' }}>
        Entrar com Google para Agendar
    </button>
    </div>
);
}

if (!empresa) return <div>Portal indisponível ou link inválido.</div>;

return (
<div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px' }}>
    <h2>Agendar na {empresa.nomeFantasia}</h2>
    <p>Logado como: <strong>{user?.email}</strong></p>
</div>
);
}