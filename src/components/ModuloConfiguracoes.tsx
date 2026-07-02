// src/components/ModuloConfiguracoes.tsx
import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

interface Props { perfil: { companyId: string } | null; }

export function ModuloConfiguracoes({ perfil }: Props) {
const [linkAtivo, setLinkAtivo] = useState(false);
const [copiado, setCopiado] = useState(false);
const [carregando, setCarregando] = useState(true);

useEffect(() => {
if (!perfil?.companyId) return;
const buscarConfig = async () => {
    const snap = await getDoc(doc(db, 'empresas', perfil.companyId));
    if (snap.exists()) setLinkAtivo(snap.data().linkPublicoAtivo || false);
    setCarregando(false);
};
buscarConfig();
}, [perfil]);

async function alternarLink() {
if (!perfil?.companyId) return;
const novoStatus = !linkAtivo;
setLinkAtivo(novoStatus);
await updateDoc(doc(db, 'empresas', perfil.companyId), { linkPublicoAtivo: novoStatus });
}

const linkPublico = `${window.location.origin}/agendar/${perfil?.companyId}`;

const copiarLink = () => {
navigator.clipboard.writeText(linkPublico);
setCopiado(true);
setTimeout(() => setCopiado(false), 2000);
};

return (
<div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
    <h3 style={{ marginTop: 0 }}>⚙️ Configurações</h3>
    
    <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '8px', marginTop: '20px', background: '#f9f9f9' }}>
    <h4>Portal de Auto-Agendamento</h4>
    <p style={{ color: '#666' }}>
        Ative para gerar um link exclusivo onde seus clientes podem se agendar sozinhos.
    </p>
    
    {carregando ? <p>Carregando...</p> : (
        <div style={{ marginTop: '20px' }}>
        <button 
            onClick={alternarLink}
            style={{ padding: '10px 20px', backgroundColor: linkAtivo ? '#e74c3c' : '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '15px' }}
        >
            {linkAtivo ? 'Desativar Link Público' : 'Ativar Link Público'}
        </button>

        {linkAtivo && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input 
                type="text" 
                readOnly 
                value={linkPublico} 
                style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', maxWidth: '400px' }} 
            />
            <button 
                onClick={copiarLink}
                style={{ padding: '10px 15px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: copiado ? '#27ae60' : '#3498db', color: 'white', fontWeight: 'bold' }}
            >
                {copiado ? '✅ Copiado!' : '📋 Copiar Link'}
            </button>
            </div>
        )}
        </div>
    )}
    </div>
</div>
);
}