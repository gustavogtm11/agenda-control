// src/components/ModuloCaixa.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';

interface ModuloCaixaProps {
  perfil: { companyId: string } | null;
}

interface Transacao {
  id: string; descricao: string; valor: number; tipo: 'entrada' | 'saida'; data: string; origem?: string;
}

interface ContaPagar {
  id: string; 
  descricao: string; 
  valor: number; 
  vencimento: string; 
  diaVencimento?: number; // Exclusivo para contas fixas
  tipoConta: 'fixa' | 'avulsa'; 
  status: 'pendente' | 'paga'; 
  dataPagamento?: string;
  parcelaAtual?: number; // Para avulsas parceladas
  totalParcelas?: number; // Para avulsas parceladas
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

  // Estados - Contas (Formulário Atualizado)
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [idContaEdicao, setIdContaEdicao] = useState<string | null>(null);
  const [descConta, setDescConta] = useState('');
  const [valorConta, setValorConta] = useState(0);
  const [vencimentoConta, setVencimentoConta] = useState(''); // Para Avulsas
  const [diaVencimentoConta, setDiaVencimentoConta] = useState<number | ''>(''); // Para Fixas
  const [totalParcelasConta, setTotalParcelasConta] = useState<number>(1);
  const [parcelaAtualConta, setParcelaAtualConta] = useState<number>(1);

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
    });

    return () => { desativarFinancas(); desativarContas(); };
  }, [perfil?.companyId]);

  /* ----- VERIFICAÇÃO DE BADGES (Bolinhas Vermelhas) COM FUSO HORÁRIO CORRETO ----- */
  const agora = new Date();
  const tzoffset = agora.getTimezoneOffset() * 60000; 
  const hojeStr = new Date(agora.getTime() - tzoffset).toISOString().split('T')[0];

  const fixasComDivida = contas.some(c => c.tipoConta === 'fixa' && c.status === 'pendente' && c.vencimento <= hojeStr);
  const avulsasComDivida = contas.some(c => c.tipoConta === 'avulsa' && c.status === 'pendente' && c.vencimento <= hojeStr);

  const renderBadge = (temBadge: boolean) => {
    if (!temBadge) return null;
    return (
      <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#e74c3c', borderRadius: '50%', marginLeft: '8px', verticalAlign: 'middle', boxShadow: '0 0 5px rgba(231, 76, 60, 0.8)' }}></span>
    );
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
  
  // Utilizado apenas na CRIAÇÃO de uma nova conta fixa
  function calcularProximoVencimentoCriacao(dia: number) {
    const hoje = new Date();
    let mes = hoje.getMonth();
    let ano = hoje.getFullYear();
    
    // Se o dia do vencimento já passou neste mês, joga para o próximo mês
    if (hoje.getDate() > dia) {
        mes++;
        if (mes > 11) { mes = 0; ano++; }
    }
    
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  // NOVA LÓGICA: Utilizado apenas ao PAGAR uma conta fixa, forçando +1 mês em relação à conta paga!
  function calcularProximoVencimentoAposPagamento(vencimentoAtual: string, diaFixo: number) {
      let [anoStr, mesStr] = vencimentoAtual.split('-');
      let ano = parseInt(anoStr);
      let mes = parseInt(mesStr); // 1 a 12

      mes++;
      if (mes > 12) {
          mes = 1;
          ano++;
      }
      return `${ano}-${String(mes).padStart(2, '0')}-${String(diaFixo).padStart(2, '0')}`;
  }

  async function registrarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!descConta || valorConta <= 0) return alert("Preencha a descrição e o valor!");
    
    if (abaAtiva === 'fixas' && (!diaVencimentoConta || diaVencimentoConta < 1 || diaVencimentoConta > 31)) {
        return alert("Informe um dia de vencimento válido (1 a 31) para a conta fixa!");
    }
    if (abaAtiva === 'avulsas' && !vencimentoConta) {
        return alert("Informe a data do primeiro vencimento!");
    }

    const dataVencimentoFinal = abaAtiva === 'fixas' 
        ? calcularProximoVencimentoCriacao(Number(diaVencimentoConta)) 
        : vencimentoConta;

    try {
      if (idContaEdicao) {
          // Editando conta existente
          await updateDoc(doc(db, 'contas_pagar', idContaEdicao), {
              descricao: descConta,
              valor: Number(valorConta),
              vencimento: dataVencimentoFinal,
              diaVencimento: abaAtiva === 'fixas' ? Number(diaVencimentoConta) : null,
              totalParcelas: abaAtiva === 'avulsas' ? Number(totalParcelasConta) : null,
              parcelaAtual: abaAtiva === 'avulsas' ? Number(parcelaAtualConta) : null
          });
          alert("Conta atualizada com sucesso!");
      } else {
          // Criando nova conta
          await addDoc(collection(db, 'contas_pagar'), {
            descricao: descConta,
            valor: Number(valorConta),
            vencimento: dataVencimentoFinal,
            tipoConta: abaAtiva === 'fixas' ? 'fixa' : 'avulsa',
            diaVencimento: abaAtiva === 'fixas' ? Number(diaVencimentoConta) : null,
            totalParcelas: abaAtiva === 'avulsas' ? Number(totalParcelasConta) : null,
            parcelaAtual: abaAtiva === 'avulsas' ? 1 : null,
            status: 'pendente',
            companyId: perfil?.companyId
          });
          alert("Conta registrada com sucesso!");
      }
      
      limparFormularioConta();
    } catch (erro) { alert("Erro ao salvar a conta."); }
  }

  function limparFormularioConta() {
    setDescConta(''); 
    setValorConta(0); 
    setVencimentoConta('');
    setDiaVencimentoConta('');
    setTotalParcelasConta(1);
    setParcelaAtualConta(1);
    setIdContaEdicao(null);
  }

  function prepararEdicaoConta(conta: ContaPagar) {
    setIdContaEdicao(conta.id);
    setDescConta(conta.descricao);
    setValorConta(conta.valor);
    
    if (conta.tipoConta === 'fixa') {
        setDiaVencimentoConta(conta.diaVencimento || 1);
        setAbaAtiva('fixas');
    } else {
        setVencimentoConta(conta.vencimento);
        setTotalParcelasConta(conta.totalParcelas || 1);
        setParcelaAtualConta(conta.parcelaAtual || 1);
        setAbaAtiva('avulsas');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function pagarConta(conta: ContaPagar) {
    if (!window.confirm(`Deseja confirmar o pagamento de ${conta.descricao} e lançar no Extrato?`)) return;
    try {
      // 1. Lança a saída no Extrato
      let infoParcela = '';
      if (conta.tipoConta === 'avulsa' && conta.totalParcelas && conta.totalParcelas > 1) {
          infoParcela = `(Parc. ${conta.parcelaAtual}/${conta.totalParcelas})`;
      }

      await addDoc(collection(db, 'financas'), {
        descricao: `Pgto: ${conta.descricao} ${infoParcela}`,
        valor: conta.valor,
        tipo: 'saida',
        data: new Date().toISOString(),
        companyId: perfil?.companyId,
        origem: 'contas'
      });

      // 2. Muda o status da atual para paga
      await updateDoc(doc(db, 'contas_pagar', conta.id), {
        status: 'paga', dataPagamento: new Date().toISOString()
      });

      // 3. Lógica de gerar a próxima cobrança
      if (conta.tipoConta === 'fixa') {
        // Usa a NOVA função de gerar vencimento com base na conta recém-paga!
        const proximoVenc = calcularProximoVencimentoAposPagamento(conta.vencimento, conta.diaVencimento || parseInt(conta.vencimento.split('-')[2]));
        
        await addDoc(collection(db, 'contas_pagar'), {
            descricao: conta.descricao, valor: conta.valor, diaVencimento: conta.diaVencimento, vencimento: proximoVenc, tipoConta: 'fixa', status: 'pendente', companyId: perfil?.companyId
        });
        alert("Conta fixa paga! A cobrança do próximo mês já foi gerada.");
        
      } else if (conta.tipoConta === 'avulsa') {
          // Se for avulsa e ainda tiver parcelas pela frente
          if (conta.totalParcelas && conta.parcelaAtual && conta.parcelaAtual < conta.totalParcelas) {
              const dataVenc = new Date(conta.vencimento + 'T12:00:00');
              dataVenc.setMonth(dataVenc.getMonth() + 1);
              const proximoVencimento = dataVenc.toISOString().split('T')[0];

              await addDoc(collection(db, 'contas_pagar'), {
                descricao: conta.descricao, 
                valor: conta.valor, 
                vencimento: proximoVencimento, 
                tipoConta: 'avulsa', 
                status: 'pendente', 
                companyId: perfil?.companyId,
                parcelaAtual: conta.parcelaAtual + 1,
                totalParcelas: conta.totalParcelas
            });
            alert(`Parcela ${conta.parcelaAtual}/${conta.totalParcelas} paga! Próxima parcela gerada.`);
          } else {
            alert("Conta avulsa paga e finalizada com sucesso!");
          }
      }
    } catch (e) { alert("Erro ao processar pagamento."); }
  }

  async function excluirConta(id: string) {
    if (window.confirm("Tem certeza que deseja excluir este registro?")) {
      await deleteDoc(doc(db, 'contas_pagar', id));
      if (idContaEdicao === id) limparFormularioConta();
    }
  }

  // Estilos
  const inputStyle = { padding: '10px', borderRadius: '4px', border: '1px solid var(--borda)', background: 'var(--bg-input)', color: 'var(--text-principal)' };
  
  const tabStyle = (aba: string) => ({
    padding: '12px 20px', cursor: 'pointer', border: 'none', background: 'transparent',
    borderBottom: abaAtiva === aba ? '3px solid #2980b9' : '3px solid transparent',
    color: abaAtiva === aba ? '#2980b9' : 'var(--text-secundario)', fontWeight: 'bold', flex: '1 1 auto', textAlign: 'center' as const,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
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
        
        {/* AVISO DE EDIÇÃO DE CONTA */}
        {idContaEdicao && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f39c12', padding: '10px', borderRadius: '6px', color: 'white', fontWeight: 'bold' }}>
                <span>✏️ Editando: {descConta}</span>
                <button onClick={limparFormularioConta} style={{ background: 'transparent', border: '1px solid white', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Cancelar Edição</button>
            </div>
        )}

        <form onSubmit={registrarConta} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '15px', background: 'var(--bg-card-item)', borderRadius: '6px', border: '1px solid var(--borda)' }}>
            <input type="text" placeholder="Nome da Conta (Ex: Luz, Internet, Fornecedor)" value={descConta} onChange={e => setDescConta(e.target.value)} style={{ ...inputStyle, flex: '1 1 100px' }} />
            
            <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secundario)', marginBottom: '2px' }}>Valor da Parcela (R$)</span>
                <input type="number" step="0.01" placeholder="R$" value={valorConta || ''} onChange={e => setValorConta(Number(e.target.value))} style={{ ...inputStyle, width: '90%' }} />
            </div>

            {/* SE FOR CONTA FIXA: MOSTRA APENAS O DIA */}
            {tipoFiltrar === 'fixa' ? (
                <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secundario)', marginBottom: '2px' }}>Dia do Vencimento</span>
                    <input type="number" min="1" max="31" placeholder="Ex: 5" value={diaVencimentoConta} onChange={e => setDiaVencimentoConta(Number(e.target.value))} style={{ ...inputStyle, width: '90%' }} />
                </div>
            ) : (
            /* SE FOR CONTA AVULSA: MOSTRA DATA COMPLETA E PARCELAS */
                <>
                    <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secundario)', marginBottom: '2px' }}>1º Vencimento</span>
                        <input type="date" value={vencimentoConta} onChange={e => setVencimentoConta(e.target.value)} style={{ ...inputStyle, maxWidth: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secundario)', marginBottom: '2px' }}>Qtd. de Parcelas</span>
                        <input type="number" min="1" value={totalParcelasConta} onChange={e => setTotalParcelasConta(Number(e.target.value))} style={{ ...inputStyle, maxWidth: '100%' }} title="Digite 1 se for à vista" />
                    </div>
                </>
            )}
            
            <div style={{ flex: '1 1 100%', display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="submit" style={{ padding: '10px 20px', background: idContaEdicao ? '#e67e22' : '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {idContaEdicao ? 'Atualizar Conta' : '+ Adicionar Conta'}
                </button>
            </div>
        </form>

        <div>
            <h4 style={{ color: '#e74c3c' }}>🔴 Pendentes</h4>
            {pendentes.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-secundario)' }}>Tudo em dia!</p> : pendentes.map(c => {
                const atrasada = c.vencimento < hojeStr;
                const venceHoje = c.vencimento === hojeStr;
                const infoParcela = c.tipoConta === 'avulsa' && c.totalParcelas && c.totalParcelas > 1 ? `(Parc. ${c.parcelaAtual}/${c.totalParcelas})` : '';

                return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: atrasada || venceHoje ? '#fdedec' : 'var(--bg-input)', border: `1px solid ${atrasada || venceHoje ? '#e74c3c' : 'var(--borda)'}`, borderRadius: '6px', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <strong style={{ display: 'block', color: 'var(--text-principal)' }}>{c.descricao} <span style={{fontSize: '13px', color: 'var(--text-secundario)'}}>{infoParcela}</span></strong>
                        <small style={{ color: atrasada || venceHoje ? '#e74c3c' : 'var(--text-secundario)', fontWeight: atrasada || venceHoje ? 'bold' : 'normal' }}>
                            Vence em: {c.vencimento.split('-').reverse().join('/')} 
                            {atrasada && ' (ATRASADA)'}
                            {venceHoje && ' (VENCE HOJE)'}
                            {c.tipoConta === 'fixa' && c.diaVencimento && ` • Fixa no dia: ${c.diaVencimento}`}
                        </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-principal)' }}>R$ {c.valor.toFixed(2)}</span>
                        <button onClick={() => pagarConta(c)} style={{ background: '#27ae60', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Pagar</button>
                        <button onClick={() => prepararEdicaoConta(c)} style={{ background: '#f39c12', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✏️</button>
                        <button onClick={() => excluirConta(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                    </div>
                </div>
            )})}
        </div>

        <div>
            <h4 style={{ color: '#27ae60' }}>🟢 Histórico de Pagas</h4>
            {pagas.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-secundario)' }}>Nenhuma conta paga registrada.</p> : pagas.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', border: '1px solid var(--borda)', borderRadius: '6px', marginBottom: '8px', opacity: 0.7 }}>
                    <div>
                        <strong style={{ display: 'block', textDecoration: 'line-through' }}>
                            {c.descricao} {c.tipoConta === 'avulsa' && c.totalParcelas && c.totalParcelas > 1 ? `(Parc. ${c.parcelaAtual}/${c.totalParcelas})` : ''}
                        </strong>
                        <small>Paga em: {c.dataPagamento ? new Date(c.dataPagamento).toLocaleDateString() : 'N/D'}</small>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center'}}>
                        <span style={{ fontWeight: 'bold' }}>R$ {c.valor.toFixed(2)}</span>
                        <button onClick={() => excluirConta(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>🗑️</button>
                    </div>
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
        <button onClick={() => setAbaAtiva('extrato')} style={tabStyle('extrato')}>
          📊 Extrato Geral
        </button>
        <button onClick={() => setAbaAtiva('fixas')} style={tabStyle('fixas')}>
          🔁 Contas Fixas {renderBadge(fixasComDivida)}
        </button>
        <button onClick={() => setAbaAtiva('avulsas')} style={tabStyle('avulsas')}>
          🛒 Contas Avulsas {renderBadge(avulsasComDivida)}
        </button>
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