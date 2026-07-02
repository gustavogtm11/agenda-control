// src/components/ModuloCaixa.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';

interface ModuloCaixaProps {
  perfil: { companyId: string } | null;
}

interface Transacao {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  data: string;
  origem?: string;
}

type FiltroTempo = 'dia' | 'semana' | 'mes' | 'ano' | 'tudo';

export function ModuloCaixa({ perfil }: ModuloCaixaProps) {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState(0);
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada');
  const [filtroTempo, setFiltroTempo] = useState<FiltroTempo>('mes'); // Inicia mostrando o mês atual

  useEffect(() => {
    if (!perfil?.companyId) return;

    const perguntaBanco = query(
      collection(db, 'financas'),
      where('companyId', '==', perfil.companyId)
    );

    const desativarCanal = onSnapshot(perguntaBanco, (snapshot) => {
      const listaTemporaria: Transacao[] = [];

      snapshot.forEach((arquivo) => {
        const dadosDoArquivo = arquivo.data();
        listaTemporaria.push({
          id: arquivo.id,
          descricao: dadosDoArquivo.descricao,
          valor: dadosDoArquivo.valor,
          tipo: dadosDoArquivo.tipo,
          data: dadosDoArquivo.data,
          origem: dadosDoArquivo.origem
        });
      });

      setTransacoes(listaTemporaria);
    });

    return () => desativarCanal();
  }, [perfil?.companyId]); 

  // Função para excluir transação
  async function excluirTransacao(id: string) {
    if (window.confirm("Tem certeza que deseja excluir esta movimentação? Essa ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, 'financas', id));
        alert("Movimentação excluída com sucesso!");
      } catch (erro) {
        console.error("Erro ao excluir:", erro);
        alert("Erro ao excluir a movimentação.");
      }
    }
  }

  // Filtragem das transações baseada no botão escolhido
  const hoje = new Date();
  const transacoesFiltradas = transacoes.filter(t => {
    if (!t.data) return true;
    const dataTransacao = new Date(t.data);

    switch (filtroTempo) {
      case 'dia':
        return dataTransacao.toDateString() === hoje.toDateString();
      case 'semana':
        // Últimos 7 dias
        const diffTempo = Math.abs(hoje.getTime() - dataTransacao.getTime());
        const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
        return diffDias <= 7;
      case 'mes':
        return dataTransacao.getMonth() === hoje.getMonth() && dataTransacao.getFullYear() === hoje.getFullYear();
      case 'ano':
        return dataTransacao.getFullYear() === hoje.getFullYear();
      default:
        return true;
    }
  }).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()); // Ordena da mais recente para a mais antiga

  // Cálculos Automáticos baseados nas transações FILTRADAS
  const totalEntradas = transacoesFiltradas
    .filter(t => t.tipo === 'entrada')
    .reduce((soma, t) => soma + t.valor, 0);

  const totalSaidas = transacoesFiltradas
    .filter(t => t.tipo === 'saida')
    .reduce((soma, t) => soma + t.valor, 0);

  const saldoTotal = totalEntradas - totalSaidas;

  async function lidarComCadastro(e: React.FormEvent) {
    e.preventDefault();

    if (!descricao || valor <= 0) {
      alert("Por favor, preencha a descrição e o valor corretamente!");
      return;
    }

    try {
      await addDoc(collection(db, 'financas'), {
        descricao: descricao,
        valor: Number(valor),
        tipo: tipo,
        data: new Date().toISOString(),
        companyId: perfil?.companyId,
        origem: 'manual' 
      });

      setDescricao('');
      setValor(0);
      alert("Movimentação financeira registrada!");
    } catch (erro) {
      console.error("Erro ao salvar finanças:", erro);
      alert("Não foi possível salvar a transação.");
    }
  }

  // Estilo para os botões de filtro
  const estiloFiltro = (filtro: FiltroTempo) => ({
    padding: '8px 15px',
    borderRadius: '20px',
    border: '1px solid var(--borda)',
    background: filtroTempo === filtro ? '#2980b9' : 'var(--bg-input)',
    color: filtroTempo === filtro ? 'white' : 'var(--text-principal)',
    cursor: 'pointer',
    fontWeight: 'bold' as const,
    flex: '1 1 auto',
    textAlign: 'center' as const
  });

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginTop: '20px', color: 'var(--text-principal)' }}>
      <h3>💰 Fluxo de Caixa da Empresa</h3>

      {/* FILTROS DE TEMPO */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => setFiltroTempo('dia')} style={estiloFiltro('dia')}>Hoje</button>
        <button onClick={() => setFiltroTempo('semana')} style={estiloFiltro('semana')}>7 Dias</button>
        <button onClick={() => setFiltroTempo('mes')} style={estiloFiltro('mes')}>Este Mês</button>
        <button onClick={() => setFiltroTempo('ano')} style={estiloFiltro('ano')}>Este Ano</button>
        <button onClick={() => setFiltroTempo('tudo')} style={estiloFiltro('tudo')}>Tudo</button>
      </div>

      {/* PLACAR FINANCEIRO */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', textAlign: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px', padding: '15px', background: '#e8f8f5', borderRadius: '6px', color: '#27ae60', border: '1px solid #27ae60' }}>
          <small>Receitas (+)</small>
          <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>R$ {totalEntradas.toFixed(2)}</p>
        </div>
        <div style={{ flex: '1 1 150px', padding: '15px', background: '#fdedec', borderRadius: '6px', color: '#e74c3c', border: '1px solid #e74c3c' }}>
          <small>Despesas (-)</small>
          <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>R$ {totalSaidas.toFixed(2)}</p>
        </div>
        <div style={{ flex: '1 1 150px', padding: '15px', background: saldoTotal >= 0 ? '#eaf2f8' : '#f5eeeb', borderRadius: '6px', color: saldoTotal >= 0 ? '#2980b9' : '#d35400', border: `1px solid ${saldoTotal >= 0 ? '#2980b9' : '#d35400'}` }}>
          <small>Saldo Atual</small>
          <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>R$ {saldoTotal.toFixed(2)}</p>
        </div>
      </div>

      {/* FORMULÁRIO DE LANÇAMENTO MANUAL */}
      <form onSubmit={lidarComCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px', paddingBottom: '20px', borderBottom: '2px dashed var(--borda)' }}>
        <h4>Lançamento Manual</h4>
        <input 
          type="text" 
          placeholder="Descrição (Ex: Pagamento de Luz, Compra de Luvas)" 
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid var(--borda)' }}
        />

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input 
            type="number" 
            placeholder="Valor (R$)" 
            value={valor || ''}
            onChange={e => setValor(Number(e.target.value))}
            style={{ padding: '10px', flex: '1 1 150px', borderRadius: '4px', border: '1px solid var(--borda)' }}
          />

          <select 
            value={tipo} 
            onChange={e => setTipo(e.target.value as 'entrada' | 'saida')}
            style={{ padding: '10px', flex: '1 1 150px', borderRadius: '4px', border: '1px solid var(--borda)' }}
          >
            <option value="entrada">Entrada (+)</option>
            <option value="saida">Saída (-)</option>
          </select>
        </div>

        <button type="submit" style={{ padding: '12px', backgroundColor: '#27ae60', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold', fontSize: '16px' }}>
          Registrar Movimentação
        </button>
      </form>

      {/* HISTÓRICO FINANCEIRO */}
      <h4>Histórico de Lançamentos ({filtroTempo === 'tudo' ? 'Todos' : 'Filtrado'}):</h4>
      {transacoesFiltradas.length === 0 ? (
        <p style={{ color: 'var(--text-secundario)' }}>Nenhuma movimentação para o período selecionado.</p>
      ) : (
        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--borda)', padding: '10px', borderRadius: '4px', background: 'var(--bg-card-item)' }}>
          {transacoesFiltradas.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 5px', borderBottom: '1px solid var(--borda)', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 150px' }}>
                <span style={{ fontWeight: 'bold' }}>{t.descricao}</span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                  <small style={{ color: 'var(--text-secundario)' }}>
                    {new Date(t.data).toLocaleDateString('pt-BR')}
                  </small>
                  {t.origem === 'agenda' && <small style={{ color: '#8e44ad', fontWeight: 'bold' }}>⚡ Agenda</small>}
                  {t.origem === 'estoque' && <small style={{ color: '#d35400', fontWeight: 'bold' }}>📦 Estoque</small>}
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ color: t.tipo === 'entrada' ? '#27ae60' : '#e74c3c', fontWeight: 'bold', fontSize: '16px' }}>
                  {t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toFixed(2)}
                </span>
                <button 
                  onClick={() => excluirTransacao(t.id)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}
                  title="Excluir Lançamento"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}