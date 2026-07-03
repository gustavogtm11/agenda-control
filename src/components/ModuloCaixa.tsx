// src/components/ModuloCaixa.tsx

import { useState, useEffect, useRef } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';

interface ModuloCaixaProps {
  perfil: { companyId: string } | null;
}

interface Transacao {
  id: string; descricao: string; valor: number; tipo: 'entrada' | 'saida'; data: string; origem?: string;
}

interface ContaPagar {
  id: string; descricao: string; valor: number; vencimento: string; tipoConta: 'fixa' | 'avulsa'; status: 'pendente' | 'paga'; dataPagamento?: string;
}

type FiltroTempo = 'dia' | 'semana' | 'mes' | 'ano' | 'tudo';

export function ModuloCaixa({ perfil }: ModuloCaixaProps) {
  const [abaAtiva, setAbaAtiva] = useState<'extrato' | 'fixas' | 'avulsas'>('extrato');
  
  // Estados - Extrato
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [descricaoTransacao, setDescricaoTransacao] = useState('');
  const [valorTransacao, setValorTransacao] = useState(0);
  const [tipoTransacao, setTipoTransacao] = useState<'entrada' | 'saida'>('entrada');
  const [filtroTempo, setFiltroTempo] = useState<FiltroTempo>('mes');

  // Estados - Contas
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [descConta, setDescConta] = useState('');
  const [valorConta, setValorConta] = useState(0);
  const [vencimentoConta, setVencimentoConta] = useState('');
  
  const notificacaoEnviadaRef = useRef(false);

  useEffect(() => {
    if (!perfil?.companyId) return;

    // Escuta Extrato (financas)
    const qFinancas = query(collection(db, 'financas'), where('companyId', '==', perfil.companyId));
    const desativarFinancas = onSnapshot(qFinancas, (snapshot) => {
      const lista: Transacao[] = [];
      snapshot.forEach((doc) => lista.push({ id: doc.id, ...doc.data() } as Transacao));
      setTransacoes(lista);
    });

    // Escuta Contas a Pagar
    const qContas = query(collection(db, 'contas_pagar'), where('companyId', '==', perfil.companyId));
    const desativarContas = onSnapshot(qContas, (snapshot) => {
      const lista: ContaPagar[] = [];
      snapshot.forEach((doc) => lista.push({ id: doc.id, ...doc.data() } as ContaPagar));
      setContas(lista);
      verificarNotificacoes(lista);
    });

    return () => { desativarFinancas(); desativarContas(); };
  }, [perfil?.companyId]);

  // Lógica de Notificações de Vencimento
  const verificarNotificacoes = (listaContas: ContaPagar[]) => {
    if (notificacaoEnviadaRef.current || Notification.permission !== 'granted') return;
    
    const hoje = new Date().toISOString().split('T')[0];
    const contasPendentes = listaContas.filter(c => c.status === 'pendente');
    
    const vencendoHoje = contasPendentes.filter(c => c.vencimento === hoje);
    const atrasadas = contasPendentes.filter(c => c.vencimento < hoje);

    if (vencendoHoje.length > 0 || atrasadas.length > 0) {
      const titulo = "Avisos do Caixa 💰";
      let corpo = "";
      if (vencendoHoje.length > 0) corpo += `\n- ${vencendoHoje.length} conta(s) vencendo HOJE.`;
      if (atrasadas.length > 0) corpo += `\n- ${atrasadas.length} conta(s) ATRASADA(S).`;
      
      new Notification(titulo, { body: corpo });
      notificacaoEnviadaRef.current = true; // Garante que só apita 1x por sessão
    }
  };

  /* ----- LÓGICA DO EXTRATO ----- */
  async function registrarTransacaoManual(e: React.FormEvent) {
    e.preventDefault();
    if (!descricaoTransacao || valorTransacao <= 0) return alert("Preencha corretamente!");
    try {
      await addDoc(collection(db, 'financas'), {
        descricao: descricaoTransacao, valor: Number(valorTransacao), tipo: tipoTransacao, data: new Date().toISOString(), companyId: perfil?.companyId, origem: 'manual' 
      });
      setDescricaoTransacao(''); setValorTransacao(0);
      alert("Lançamento registrado no extrato!");
    } catch (erro) { alert("Erro ao salvar a transação."); }
  }

  async function excluirTransacao(id: string) {
    if (window.confirm("Excluir esta movimentação permanentemente?")) {
      await deleteDoc(doc(db, 'financas', id));
    }
  }

  const hojeData = new Date();
  const transacoesFiltradas = transacoes.filter(t => {
    if (!t.data) return true;
    const d = new Date(t.data);
    switch (filtroTempo) {
      case 'dia': return d.toDateString() === hojeData.toDateString();
      case 'semana': return Math.ceil(Math.abs(hojeData.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)) <= 7;
      case 'mes': return d.getMonth() === hojeData.getMonth() && d.getFullYear() === hojeData.getFullYear();
      case 'ano': return d.getFullYear() === hojeData.getFullYear();
      default: return true;
    }
  }).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  const totalEntradas = transacoesFiltradas.filter(t => t.tipo === 'entrada').reduce((acc, t) => acc + t.valor, 0);
  const totalSaidas = transacoesFiltradas.filter(t => t.tipo === 'saida').reduce((acc, t) => acc + t.valor, 0);
  const saldoTotal = totalEntradas - totalSaidas;

  /* ----- LÓGICA DE CONTAS A PAGAR ----- */
  async function registrarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!descConta || valorConta <= 0 || !vencimentoConta) return alert("Preencha todos os campos da conta!");
    
    try {
      await addDoc(collection(db, 'contas_pagar'), {
        descricao: descConta,
        valor: Number(valorConta),
        vencimento: vencimentoConta,
        tipoConta: abaAtiva === 'fixas' ? 'fixa' : 'avulsa',
        status: 'pendente',
        companyId: perfil?.companyId
      });
      setDescConta(''); setValorConta(0); setVencimentoConta('');
      alert("Conta registrada com sucesso!");
    } catch (erro) { alert("Erro ao registrar a conta."); }
  }

  async function pagarConta(conta: ContaPagar) {
    if (!window.confirm(`Deseja confirmar o pagamento de ${conta.descricao} e lançar no Extrato?`)) return;
    try {
      // 1. Lança a saída no Extrato
      await addDoc(collection(db, 'financas'), {
        descricao: `Pagamento: ${conta.descricao} (${conta.tipoConta})`,
        valor: conta.valor,
        tipo: 'saida',
        data: new Date().toISOString(),
        companyId: perfil?.companyId,
        origem: 'contas'
      });

      // 2. Muda o status para paga
      await updateDoc(doc(db, 'contas_pagar', conta.id), {
        status: 'paga', dataPagamento: new Date().toISOString()
      });

      // 3. Se for FIXA, já cria a previsão para o próximo mês automaticamente
      if (conta.tipoConta === 'fixa') {
        const dataVenc = new Date(conta.vencimento + 'T12:00:00');
        dataVenc.setMonth(dataVenc.getMonth() + 1);
        const proximoVencimento = dataVenc.toISOString().split('T')[0];
        
        await addDoc(collection(db, 'contas_pagar'), {
            descricao: conta.descricao, valor: conta.valor, vencimento: proximoVencimento, tipoConta: 'fixa', status: 'pendente', companyId: perfil?.companyId
        });
        alert("Conta paga! O extrato foi atualizado e a cobrança do próximo mês já foi gerada.");
      } else {
        alert("Conta paga! O extrato foi atualizado.");
      }
    } catch (e) { alert("Erro ao processar pagamento."); }
  }

  async function excluirConta(id: string) {
    if (window.confirm("Excluir este registro de conta?")) {
      await deleteDoc(doc(db, 'contas_pagar', id));
    }
  }

  // Estilos
  const inputStyle = { padding: '10px', borderRadius: '4px', border: '1px solid var(--borda)', background: 'var(--bg-input)', color: 'var(--text-principal)' };
  const tabStyle = (aba: string) => ({
    padding: '12px 20px', cursor: 'pointer', border: 'none', background: 'transparent',
    borderBottom: abaAtiva === aba ? '3px solid #2980b9' : '3px solid transparent',
    color: abaAtiva === aba ? '#2980b9' : 'var(--text-secundario)', fontWeight: 'bold', flex: '1 1 auto', textAlign: 'center' as const
  });
  const estiloFiltro = (filtro: FiltroTempo) => ({
    padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--borda)',
    background: filtroTempo === filtro ? '#2980b9' : 'var(--bg-input)', color: filtroTempo === filtro ? 'white' : 'var(--text-principal)',
    cursor: 'pointer', fontSize: '13px'
  });

  const renderizarListaContas = (tipoFiltrar: 'fixa' | 'avulsa') => {
    const lista = contas.filter(c => c.tipoConta === tipoFiltrar).sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime());
    const pendentes = lista.filter(c => c.status === 'pendente');
    const pagas = lista.filter(c => c.status === 'paga');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s' }}>
        <form onSubmit={registrarConta} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '15px', background: 'var(--bg-card-item)', borderRadius: '6px', border: '1px solid var(--borda)' }}>
            <input type="text" placeholder="Nome da Conta (Ex: Luz, Internet, Suprimentos)" value={descConta} onChange={e => setDescConta(e.target.value)} style={{ ...inputStyle, flex: '2 1 200px' }} />
            <input type="number" placeholder="Valor (R$)" value={valorConta || ''} onChange={e => setValorConta(Number(e.target.value))} style={{ ...inputStyle, flex: '1 1 100px' }} />
            <div style={{ flex: '1 1 130px', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secundario)', marginBottom: '2px' }}>Vencimento</span>
                <input type="date" value={vencimentoConta} onChange={e => setVencimentoConta(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            </div>
            <button type="submit" style={{ padding: '10px 15px', background: '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Adicionar</button>
        </form>

        <div>
            <h4 style={{ color: '#e74c3c' }}>🔴 Pendentes</h4>
            {pendentes.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-secundario)' }}>Tudo em dia!</p> : pendentes.map(c => {
                const atrasada = c.vencimento < new Date().toISOString().split('T')[0];
                return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: atrasada ? '#fdedec' : 'var(--bg-input)', border: `1px solid ${atrasada ? '#e74c3c' : 'var(--borda)'}`, borderRadius: '6px', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <strong style={{ display: 'block', color: 'var(--text-principal)' }}>{c.descricao}</strong>
                        <small style={{ color: atrasada ? '#e74c3c' : 'var(--text-secundario)', fontWeight: atrasada ? 'bold' : 'normal' }}>Vence em: {c.vencimento.split('-').reverse().join('/')} {atrasada && '(ATRASADA)'}</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-principal)' }}>R$ {c.valor.toFixed(2)}</span>
                        <button onClick={() => pagarConta(c)} style={{ background: '#27ae60', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Pagar</button>
                        <button onClick={() => excluirConta(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>🗑️</button>
                    </div>
                </div>
            )})}
        </div>

        <div>
            <h4 style={{ color: '#27ae60' }}>🟢 Histórico de Pagas</h4>
            {pagas.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-secundario)' }}>Nenhuma conta paga registrada.</p> : pagas.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', border: '1px solid var(--borda)', borderRadius: '6px', marginBottom: '8px', opacity: 0.7 }}>
                    <div>
                        <strong style={{ display: 'block', textDecoration: 'line-through' }}>{c.descricao}</strong>
                        <small>Paga em: {c.dataPagamento ? new Date(c.dataPagamento).toLocaleDateString() : 'N/D'}</small>
                    </div>
                    <span style={{ fontWeight: 'bold' }}>R$ {c.valor.toFixed(2)}</span>
                </div>
            ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginTop: '20px', color: 'var(--text-principal)', minHeight: '80vh' }}>
      <h3 style={{ marginTop: 0 }}>💼 Financeiro</h3>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--borda)', marginBottom: '25px', overflowX: 'auto' }}>
        <button onClick={() => setAbaAtiva('extrato')} style={tabStyle('extrato')}>📊 Extrato Geral</button>
        <button onClick={() => setAbaAtiva('fixas')} style={tabStyle('fixas')}>🔁 Contas Fixas</button>
        <button onClick={() => setAbaAtiva('avulsas')} style={tabStyle('avulsas')}>🛒 Contas Avulsas</button>
      </div>

      {abaAtiva === 'extrato' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button onClick={() => setFiltroTempo('dia')} style={estiloFiltro('dia')}>Hoje</button>
            <button onClick={() => setFiltroTempo('semana')} style={estiloFiltro('semana')}>7 Dias</button>
            <button onClick={() => setFiltroTempo('mes')} style={estiloFiltro('mes')}>Este Mês</button>
            <button onClick={() => setFiltroTempo('ano')} style={estiloFiltro('ano')}>Este Ano</button>
            <button onClick={() => setFiltroTempo('tudo')} style={estiloFiltro('tudo')}>Tudo</button>
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', textAlign: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px', padding: '15px', background: 'rgba(39, 174, 96, 0.1)', borderRadius: '6px', color: '#27ae60', border: '1px solid #27ae60' }}>
              <small>Receitas (+)</small>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>R$ {totalEntradas.toFixed(2)}</p>
            </div>
            <div style={{ flex: '1 1 150px', padding: '15px', background: 'rgba(231, 76, 60, 0.1)', borderRadius: '6px', color: '#e74c3c', border: '1px solid #e74c3c' }}>
              <small>Despesas (-)</small>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>R$ {totalSaidas.toFixed(2)}</p>
            </div>
            <div style={{ flex: '1 1 150px', padding: '15px', background: saldoTotal >= 0 ? 'rgba(41, 128, 185, 0.1)' : 'rgba(211, 84, 0, 0.1)', borderRadius: '6px', color: saldoTotal >= 0 ? '#2980b9' : '#d35400', border: `1px solid ${saldoTotal >= 0 ? '#2980b9' : '#d35400'}` }}>
              <small>Saldo do Período</small>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>R$ {saldoTotal.toFixed(2)}</p>
            </div>
          </div>

          <form onSubmit={registrarTransacaoManual} style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap', padding: '15px', background: 'var(--bg-card-item)', borderRadius: '6px', border: '1px dashed var(--borda)' }}>
            <input type="text" placeholder="Lançamento Manual Rápido" value={descricaoTransacao} onChange={e => setDescricaoTransacao(e.target.value)} style={{ ...inputStyle, flex: '2 1 200px' }} />
            <input type="number" placeholder="R$" value={valorTransacao || ''} onChange={e => setValorTransacao(Number(e.target.value))} style={{ ...inputStyle, flex: '1 1 80px' }} />
            <select value={tipoTransacao} onChange={e => setTipoTransacao(e.target.value as 'entrada'|'saida')} style={{ ...inputStyle, flex: '1 1 100px' }}>
              <option value="entrada">Entrada (+)</option>
              <option value="saida">Saída (-)</option>
            </select>
            <button type="submit" style={{ padding: '10px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Lançar</button>
          </form>

          {transacoesFiltradas.length === 0 ? <p style={{ color: 'var(--text-secundario)' }}>Nenhuma movimentação neste período.</p> : (
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--borda)', borderRadius: '4px', background: 'var(--bg-card-item)' }}>
              {transacoesFiltradas.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--borda)', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', display: 'block' }}>{t.descricao}</span>
                    <small style={{ color: 'var(--text-secundario)' }}>{new Date(t.data).toLocaleDateString('pt-BR')} • {t.origem?.toUpperCase() || 'MANUAL'}</small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ color: t.tipo === 'entrada' ? '#27ae60' : '#e74c3c', fontWeight: 'bold' }}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toFixed(2)}</span>
                    <button onClick={() => excluirTransacao(t.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {abaAtiva === 'fixas' && renderizarListaContas('fixa')}
      {abaAtiva === 'avulsas' && renderizarListaContas('avulsa')}
    </div>
  );
}