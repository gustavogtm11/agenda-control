// src/components/ModuloConfiguracoes.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface ModuloConfiguracoesProps {
perfil: { companyId: string } | null;
}

type DiaSemana = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';

interface HorarioDia {
ativo: boolean;
inicio: string;
fim: string;
}

type HorariosFuncionamento = Record<DiaSemana, HorarioDia>;

const diasDaSemana: { key: DiaSemana; label: string }[] = [
{ key: 'segunda', label: 'Segunda-feira' },
{ key: 'terca', label: 'Terça-feira' },
{ key: 'quarta', label: 'Quarta-feira' },
{ key: 'quinta', label: 'Quinta-feira' },
{ key: 'sexta', label: 'Sexta-feira' },
{ key: 'sabado', label: 'Sábado' },
{ key: 'domingo', label: 'Domingo' },
];

const horariosPadrao: HorariosFuncionamento = {
domingo: { ativo: false, inicio: '08:00', fim: '12:00' },
segunda: { ativo: true, inicio: '08:00', fim: '17:00' },
terca: { ativo: true, inicio: '08:00', fim: '17:00' },
quarta: { ativo: true, inicio: '08:00', fim: '17:00' },
quinta: { ativo: true, inicio: '08:00', fim: '17:00' },
sexta: { ativo: true, inicio: '08:00', fim: '17:00' },
sabado: { ativo: true, inicio: '08:00', fim: '12:00' },
};

export function ModuloConfiguracoes({ perfil }: ModuloConfiguracoesProps) {
const [horarios, setHorarios] = useState<HorariosFuncionamento>(horariosPadrao);
const [salvando, setSalvando] = useState(false);

useEffect(() => {
if (!perfil?.companyId) return;

async function carregarConfiguracoes() {
    try {
    const empresaRef = doc(db, 'empresas', perfil!.companyId);
    const empresaSnap = await getDoc(empresaRef);

    if (empresaSnap.exists() && empresaSnap.data().horariosFuncionamento) {
        setHorarios(empresaSnap.data().horariosFuncionamento);
    }
    } catch (error) {
    console.error("Erro ao carregar configurações:", error);
    }
}

carregarConfiguracoes();
}, [perfil?.companyId]);

const handleChange = (dia: DiaSemana, campo: keyof HorarioDia, valor: any) => {
setHorarios(prev => ({
    ...prev,
    [dia]: {
    ...prev[dia],
    [campo]: valor
    }
}));
};

async function salvarConfiguracoes(e: React.FormEvent) {
e.preventDefault();
if (!perfil?.companyId) return;

setSalvando(true);
try {
    const empresaRef = doc(db, 'empresas', perfil.companyId);
    const empresaSnap = await getDoc(empresaRef);

    if (empresaSnap.exists()) {
    await updateDoc(empresaRef, { horariosFuncionamento: horarios });
    } else {
    // Caso o documento da empresa não exista por algum motivo, ele cria
    await setDoc(empresaRef, { horariosFuncionamento: horarios }, { merge: true });
    }

    alert("Configurações de horário salvas com sucesso!");
} catch (error) {
    console.error("Erro ao salvar:", error);
    alert("Erro ao salvar configurações.");
} finally {
    setSalvando(false);
}
}

const inputStyle = {
padding: '10px',
borderRadius: '6px',
border: '1px solid var(--borda)',
backgroundColor: 'var(--bg-input)',
color: 'var(--text-principal)',
fontSize: '16px',
outline: 'none'
};

return (
<div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', marginTop: '20px' }}>
    <h3 style={{ marginTop: 0 }}>⚙️ Configurações do Sistema</h3>
    
    <form onSubmit={salvarConfiguracoes}>
    <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 15px 0' }}>🕒 Horários de Atendimento</h4>
        <p style={{ fontSize: '13px', color: 'var(--text-secundario)', marginBottom: '20px' }}>
        Defina os dias e horários em que o estabelecimento está aberto. O horário de fim representa o término do último serviço.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {diasDaSemana.map(({ key, label }) => {
            const configDia = horarios[key];

            return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', paddingBottom: '15px', borderBottom: '1px dashed var(--borda)' }}>
                
                {/* Checkbox de Ativo/Inativo */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minWidth: '150px', fontWeight: configDia.ativo ? 'bold' : 'normal', color: configDia.ativo ? 'var(--text-principal)' : 'var(--text-secundario)' }}>
                <input 
                    type="checkbox" 
                    checked={configDia.ativo}
                    onChange={(e) => handleChange(key, 'ativo', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                {label}
                </label>

                {/* Campos de Horário */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: configDia.ativo ? 1 : 0.4, pointerEvents: configDia.ativo ? 'auto' : 'none' }}>
                <input 
                    type="time" 
                    value={configDia.inicio}
                    onChange={(e) => handleChange(key, 'inicio', e.target.value)}
                    style={inputStyle}
                    required={configDia.ativo}
                />
                <span style={{ color: 'var(--text-secundario)', fontWeight: 'bold' }}>até</span>
                <input 
                    type="time" 
                    value={configDia.fim}
                    onChange={(e) => handleChange(key, 'fim', e.target.value)}
                    style={inputStyle}
                    required={configDia.ativo}
                />
                </div>

                {!configDia.ativo && (
                <span style={{ fontSize: '13px', color: '#e74c3c', fontStyle: 'italic' }}>Fechado</span>
                )}
            </div>
            );
        })}
        </div>
    </div>

    <button 
        type="submit" 
        disabled={salvando}
        style={{ padding: '12px 24px', backgroundColor: '#2980b9', color: 'white', border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', opacity: salvando ? 0.7 : 1 }}
    >
        {salvando ? 'Salvando...' : 'Salvar Configurações'}
    </button>
    </form>
</div>
);
}