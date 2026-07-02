// src/components/ModuloFuncionarios.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
// Importamos as novas ferramentas necessárias para eliminar (deleteDoc) e atualizar (updateDoc) documentos
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

interface ModuloFuncionariosProps {
perfil: { companyId: string } | null;
}

// Regra do TypeScript: O que um funcionário vindo do banco de dados possui
interface Funcionario {
id: string; // O e-mail será o nosso ID único
nome: string;
email: string;
role: string;
}

export function ModuloFuncionarios({ perfil }: ModuloFuncionariosProps) {
// MEMÓRIA 1: Guarda a lista de funcionários que vem do banco de dados
const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

// MEMÓRIAS DO FORMULÁRIO: Controlam o que está escrito nos inputs do ecrã
const [email, setEmail] = useState('');
const [nome, setNome] = useState('');

// MEMÓRIA DE CONTROLO: Se estiver vazia (null), significa que estamos a criar um novo funcionário.
// Se guardar o e-mail de alguém, significa que estamos a EDITAR esse funcionário.
const [idFuncionarioEditando, setIdFuncionarioEditando] = useState<string | null>(null);

// 1. O DESPERTADOR (useEffect): Procura os funcionários da empresa em tempo real
useEffect(() => {
if (!perfil?.companyId) return;

// Fazemos a pergunta filtrada: "Procura na pasta 'usuarios' quem pertence a esta empresa e tem o cargo de funcionário"
const q = query(
    collection(db, 'usuarios'),
    where('companyId', '==', perfil.companyId),
    where('role', '==', 'funcionario')
);

// Ligamos o canal em tempo real
const desativarEscuta = onSnapshot(q, (snapshot) => {
    const lista: Funcionario[] = [];
    snapshot.forEach((doc) => {
    const dados = doc.data();
    lista.push({
        id: doc.id,
        nome: dados.nome,
        email: dados.email,
        role: dados.role
    });
    });
    setFuncionarios(lista); // Guarda a lista na memória do React
});

return () => desativarEscuta();
}, [perfil?.companyId]);


// 2. FUNÇÃO UNIFICADA: Serve tanto para ADICIONAR quanto para SALVAR ALTERAÇÕES
async function lidarComSubmissao(e: React.FormEvent) {
e.preventDefault();
if (!email || !nome || !perfil?.companyId) {
    alert("Preencha todos os campos!");
    return;
}

try {
    if (idFuncionarioEditando) {
    // --- MODO EDIÇÃO ---
    // Se temos um ID guardado na memória de edição, atualizamos o documento existente
    const refUsuario = doc(db, 'usuarios', idFuncionarioEditando);
    await updateDoc(refUsuario, {
        nome: nome
        // O e-mail não mudamos aqui por segurança, pois ele é o ID do login
    });

    alert("Dados do funcionário atualizados!");
    setIdFuncionarioEditando(null); // Limpa o modo edição, voltando ao modo padrão
    } else {
    // --- MODO CRIAÇÃO ---
    // Se não estamos a editar ninguém, cria um registo totalmente novo
    await setDoc(doc(db, 'usuarios', email), {
        nome: nome,
        email: email,
        companyId: perfil.companyId,
        role: 'funcionario'
    });
    alert("Funcionário adicionado com sucesso!");
    }

    // Limpa os campos do formulário no ecrã após o sucesso
    setEmail('');
    setNome('');
} catch (erro) {
    console.error(erro);
    alert("Erro ao processar a operação.");
}
}


// 3. FUNÇÃO PARA ATIVAR O MODO EDIÇÃO
// Quando o chefe clica em "Editar", pegamos nos dados e jogamos para os inputs
function iniciarEdicao(func: Funcionario) {
setIdFuncionarioEditando(func.id); // Avisamos o sistema que este e-mail está a ser editado
setNome(func.nome); // Coloca o nome atual no input
setEmail(func.email); // Coloca o e-mail atual no input
}


// 4. FUNÇÃO PARA ELIMINAR (DELETAR) UM FUNCIONÁRIO
async function excluirFuncionario(idDoFuncionario: string) {
// Uma pergunta de confirmação nativa do navegador para evitar cliques por acidente
const confirmar = window.confirm("Tem certeza de que deseja remover este funcionário do sistema?");
if (!confirmar) return;

try {
    // Apaga o documento diretamente na pasta 'usuarios' do Firebase usando o ID (e-mail) dele
    await deleteDoc(doc(db, 'usuarios', idDoFuncionario));
    alert("Funcionário removido com sucesso!");
} catch (erro) {
    console.error(erro);
    alert("Não foi possível eliminar o funcionário.");
}
}

return (
<div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
    
    {/* O título muda dinamicamente de acordo com o modo */}
    <h3>{idFuncionarioEditando ? '✏️ Editar Funcionário' : '👥 Cadastro de Funcionários'}</h3>
    
    <form onSubmit={lidarComSubmissao} style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' }}>
    <input 
        type="text" placeholder="Nome Completo" value={nome} 
        onChange={e => setNome(e.target.value)} 
        style={{ padding: '8px', flex: 2, minWidth: '200px' }}
    />
    <input 
        type="email" placeholder="E-mail do Google da pessoa" value={email} 
        onChange={e => setEmail(e.target.value)} 
        // Se estivermos em modo edição, bloqueamos o input de e-mail (disabled) para evitar problemas
        disabled={idFuncionarioEditando !== null}
        style={{ padding: '8px', flex: 2, minWidth: '200px', backgroundColor: idFuncionarioEditando ? '#f0f0f0' : '#fff' }}
    />
    
    {/* O texto e a cor do botão mudam dinamicamente */}
    <button 
        type="submit" 
        style={{ 
        padding: '8px 16px', 
        backgroundColor: idFuncionarioEditando ? '#e67e22' : '#34495e', 
        color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' 
        }}
    >
        {idFuncionarioEditando ? 'Salvar Alterações' : 'Adicionar Equipa'}
    </button>

    {/* Se estiver editando, mostra um botão extra para cancelar a edição se o usuário desistir */}
    {idFuncionarioEditando && (
        <button 
        type="button" 
        onClick={() => { setIdFuncionarioEditando(null); setNome(''); setEmail(''); }}
        style={{ padding: '8px 16px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
        Cancelar
        </button>
    )}
    </form>

    {/* LISTAGEM DOS COMPONENTES (A LEITURA REAL DO BANCO) */}
    <h4>Funcionários Registados:</h4>
    {funcionarios.length === 0 ? (
    <p style={{ color: '#888' }}>Nenhum funcionário cadastrado nesta empresa.</p>
    ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {funcionarios.map(func => (
        <div key={func.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #eee', borderRadius: '6px', backgroundColor: '#fafafa' }}>
            <div>
            <strong style={{ display: 'block', fontSize: '16px' }}>{func.nome}</strong>
            <small style={{ color: '#666' }}>{func.email}</small>
            </div>
            
            {/* BOTÕES DE AÇÃO DO CRUD */}
            <div style={{ display: 'flex', gap: '8px' }}>
            <button 
                onClick={() => iniciarEdicao(func)}
                style={{ padding: '6px 12px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            >
                Editar
            </button>
            <button 
                onClick={() => excluirFuncionario(func.id)}
                style={{ padding: '6px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            >
                Excluir
            </button>
            </div>
        </div>
        ))}
    </div>
    )}
</div>
);
}