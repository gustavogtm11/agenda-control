// src/components/ModuloSuperAdmin.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';

interface Empresa {
  id: string; // O ID único da empresa (Ex: barbearia_do_ze)
  nome: string;
  statusPgto: 'em_dia' | 'bloqueado'; // O controle de inadimplência
}

export function ModuloSuperAdmin() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  
  // Memórias para o formulário de nova empresa
  const [idEmpresa, setIdEmpresa] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [emailChefe, setEmailChefe] = useState('');
  const [nomeChefe, setNomeChefe] = useState('');

  // 1. DESPERTADOR: Busca TODAS as empresas do banco de dados
  // Como você é o Super-Admin, não filtramos por 'companyId'. Você vê tudo.
  useEffect(() => {
    const desativarEscuta = onSnapshot(collection(db, 'empresas'), (snapshot) => {
      const lista: Empresa[] = [];
      snapshot.forEach(doc => {
        lista.push({
          id: doc.id,
          nome: doc.data().nome,
          statusPgto: doc.data().statusPgto
        });
      });
      setEmpresas(lista);
    });

    return () => desativarEscuta();
  }, []);

  // 2. FUNÇÃO PARA REGISTRAR NOVA EMPRESA E O SEU CHEFE
  async function registrarNovaEmpresa(e: React.FormEvent) {
    e.preventDefault();
    
    // Tratamento básico para não haver espaços no ID da empresa (ex: 'clinica feliz' vira 'clinica_feliz')
    const idFormatado = idEmpresa.trim().toLowerCase().replace(/\s+/g, '_');

    if (!idFormatado || !nomeEmpresa || !emailChefe || !nomeChefe) {
      alert("Preencha todos os campos do cliente!");
      return;
    }

    try {
      // Usamos o Batch para criar dois documentos em pastas diferentes ao mesmo tempo
      const batch = writeBatch(db);

      // A. Cria o documento da Empresa
      const refEmpresa = doc(db, 'empresas', idFormatado);
      batch.set(refEmpresa, {
        nome: nomeEmpresa,
        statusPgto: 'em_dia' // Começa sempre com o pagamento em dia
      });

      // B. Cria o documento do Chefe daquela empresa
      const refChefe = doc(db, 'usuarios', emailChefe.trim().toLowerCase());
      batch.set(refChefe, {
        nome: nomeChefe,
        email: emailChefe.trim().toLowerCase(),
        companyId: idFormatado,
        role: 'chefe' // Dá os poderes de gerência para este e-mail
      });

      await batch.commit();

      alert("Cliente (Empresa e Chefe) registrado com sucesso!");
      setIdEmpresa('');
      setNomeEmpresa('');
      setEmailChefe('');
      setNomeChefe('');
    } catch (erro) {
      console.error(erro);
      alert("Erro ao registrar cliente no sistema.");
    }
  }

  // 3. FUNÇÃO PARA BLOQUEAR OU DESBLOQUEAR UMA EMPRESA
  async function alterarStatusPagamento(empresaId: string, statusAtual: string) {
    const novoStatus = statusAtual === 'em_dia' ? 'bloqueado' : 'em_dia';
    const confirmar = window.confirm(`Deseja mudar o status desta empresa para: ${novoStatus.toUpperCase()}?`);
    
    if (!confirmar) return;

    try {
      const refEmpresa = doc(db, 'empresas', empresaId);
      await updateDoc(refEmpresa, {
        statusPgto: novoStatus
      });
    } catch (erro) {
      console.error(erro);
      alert("Erro ao alterar status financeiro da empresa.");
    }
  }

  return (
    <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
      
      {/* ÁREA DE CADASTRO */}
      <h3 style={{ color: '#8e44ad' }}>👑 Nova Assinatura (SaaS)</h3>
      <form onSubmit={registrarNovaEmpresa} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '40px', background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>ID da Empresa (Ex: barbearia_01)</label>
            <input type="text" value={idEmpresa} onChange={e => setIdEmpresa(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>Nome Fantasia da Empresa</label>
            <input type="text" value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>E-mail do Google do Chefe</label>
            <input type="email" value={emailChefe} onChange={e => setEmailChefe(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>Nome do Chefe</label>
            <input type="text" value={nomeChefe} onChange={e => setNomeChefe(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
          </div>
        </div>

        <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', alignSelf: 'flex-start' }}>
          Criar Ambiente da Empresa
        </button>
      </form>

      {/* LISTAGEM DE CLIENTES E CONTROLE FINANCEIRO */}
      <h3 style={{ color: '#8e44ad' }}>🏢 Clientes Ativos na Plataforma</h3>
      {empresas.length === 0 ? (
        <p style={{ color: '#888' }}>Nenhuma empresa cadastrada no momento.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {empresas.map(empresa => (
            <div key={empresa.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid #eee', borderRadius: '6px', borderLeft: empresa.statusPgto === 'em_dia' ? '5px solid #27ae60' : '5px solid #e74c3c' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '18px' }}>{empresa.nome}</strong>
                <small style={{ color: '#666' }}>ID: {empresa.id}</small>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontWeight: 'bold', color: empresa.statusPgto === 'em_dia' ? '#27ae60' : '#e74c3c' }}>
                  {empresa.statusPgto === 'em_dia' ? '✅ Em Dia' : '❌ Bloqueado'}
                </span>
                
                {/* Botão que inverte o status financeiro da empresa */}
                <button 
                  onClick={() => alterarStatusPagamento(empresa.id, empresa.statusPgto)}
                  style={{ padding: '8px 16px', backgroundColor: empresa.statusPgto === 'em_dia' ? '#e74c3c' : '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {empresa.statusPgto === 'em_dia' ? 'Bloquear Acesso' : 'Desbloquear'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}