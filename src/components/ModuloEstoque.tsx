// src/components/ModuloEstoque.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, onSnapshot, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import '../App.css';

interface ModuloEstoqueProps {
  perfil: {
    companyId: string;
  } | null;
}

interface ProdutoEstoque {
  id: string;
  nome: string;
  quantidade: number;
  valorUnitario?: number;
}

export function ModuloEstoque({ perfil }: ModuloEstoqueProps) {
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  
  // Estados do formulário
  const [idEmEdicao, setIdEmEdicao] = useState<string | null>(null);
  const [nomeProduto, setNomeProduto] = useState('');
  
  // Novos estados para controle de Caixa/Unidade
  const [tipoEntrada, setTipoEntrada] = useState<'unidade' | 'caixa' | 'pacote'>('unidade');
  const [qtdProduto, setQtdProduto] = useState<string>(''); // Usado quando é unidade
  const [qtdEmbalagens, setQtdEmbalagens] = useState<string>(''); // Quantas caixas/pacotes comprados
  const [unidadesPorEmbalagem, setUnidadesPorEmbalagem] = useState<string>(''); // Quantos itens vem dentro
  const [valorPreenchido, setValorPreenchido] = useState<string>(''); // Pode ser o valor da unidade ou da caixa

  useEffect(() => {
    if (!perfil?.companyId) return;

    const q = query(collection(db, 'estoque'), where('companyId', '==', perfil.companyId));

    const desfazerEscuta = onSnapshot(q, (snapshot) => {
      const listaProdutos: ProdutoEstoque[] = [];
      snapshot.forEach((documento) => {
        const dados = documento.data();
        listaProdutos.push({
          id: documento.id,
          nome: dados.nome,
          quantidade: dados.quantidade,
          valorUnitario: dados.valorUnitario
        });
      });
      listaProdutos.sort((a, b) => a.nome.localeCompare(b.nome));
      setProdutos(listaProdutos);
    });

    return () => desfazerEscuta();
  }, [perfil?.companyId]);

  async function lidarComCadastro(e: React.FormEvent) {
    e.preventDefault(); 

    if (!nomeProduto) {
      alert("Preencha o nome do material!");
      return;
    }

    let quantidadeFinalNum = 0;
    let custoTotal = 0;
    let valorUnitarioCalculado = 0;
    let descricaoDespesa = '';

    const valorInputNum = parseFloat(valorPreenchido);
    const nomeFormatado = nomeProduto.trim();

    if (tipoEntrada === 'unidade') {
      quantidadeFinalNum = parseFloat(qtdProduto);
      
      if (isNaN(quantidadeFinalNum) || isNaN(valorInputNum) || valorInputNum < 0 || quantidadeFinalNum <= 0) {
        alert("Preencha as quantidades e valores corretamente!");
        return;
      }
      
      custoTotal = quantidadeFinalNum * valorInputNum;
      valorUnitarioCalculado = valorInputNum;
      descricaoDespesa = `Compra de Estoque: ${quantidadeFinalNum}x ${nomeFormatado}`;

    } else {
      // É caixa ou pacote
      const caixasCompradas = parseFloat(qtdEmbalagens);
      const itensPorCaixa = parseFloat(unidadesPorEmbalagem);

      if (isNaN(caixasCompradas) || isNaN(itensPorCaixa) || isNaN(valorInputNum) || valorInputNum < 0 || caixasCompradas <= 0 || itensPorCaixa <= 0) {
        alert("Preencha as quantidades da embalagem e o valor corretamente!");
        return;
      }

      quantidadeFinalNum = caixasCompradas * itensPorCaixa;
      custoTotal = caixasCompradas * valorInputNum; // O valor preenchido é o da caixa inteira
      valorUnitarioCalculado = valorInputNum / itensPorCaixa; // Custo real por unidade para o banco de dados
      
      const tipoTxt = tipoEntrada === 'caixa' ? 'Caixa(s)' : 'Pacote(s)';
      descricaoDespesa = `Compra de Estoque: ${caixasCompradas} ${tipoTxt} de ${nomeFormatado} (${quantidadeFinalNum} unidades no total)`;
    }

    try {
      if (idEmEdicao) {
        // Na edição, tratamos como uma sobreposição direta do saldo final e preço unitário
        await updateDoc(doc(db, 'estoque', idEmEdicao), {
          nome: nomeFormatado,
          quantidade: quantidadeFinalNum,
          valorUnitario: valorUnitarioCalculado
        });
        alert("Produto atualizado com sucesso!");
      } else {
        const q = query(collection(db, 'estoque'), where('companyId', '==', perfil?.companyId), where('nome', '==', nomeFormatado));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const produtoExistente = querySnapshot.docs[0];
          const novaQuantidade = produtoExistente.data().quantidade + quantidadeFinalNum;
          // Média de preço unitário baseada na nova entrada (simplificado para pegar o preço mais recente)
          await updateDoc(doc(db, 'estoque', produtoExistente.id), {
            quantidade: novaQuantidade,
            valorUnitario: valorUnitarioCalculado 
          });
        } else {
          await addDoc(collection(db, 'estoque'), {
            nome: nomeFormatado,
            quantidade: quantidadeFinalNum,
            valorUnitario: valorUnitarioCalculado,
            companyId: perfil?.companyId 
          });
        }

        // Lança no caixa o custo total das caixas ou unidades compradas
        if (custoTotal > 0 && perfil?.companyId) {
          await addDoc(collection(db, 'financas'), {
            descricao: descricaoDespesa,
            valor: custoTotal,
            tipo: 'saida',
            data: new Date().toISOString(),
            companyId: perfil.companyId,
            origem: 'estoque'
          });
        }
        alert("Estoque adicionado e despesa registrada no caixa!");
      }
      limparFormulario();
    } catch (erro) {
      console.error(erro);
      alert("Erro ao salvar o produto.");
    }
  }

  function prepararEdicao(produto: ProdutoEstoque) {
    setIdEmEdicao(produto.id);
    setNomeProduto(produto.nome);
    setTipoEntrada('unidade'); // Força modo unidade na edição para ajustar o saldo direto
    setQtdProduto(produto.quantidade.toString());
    setValorPreenchido((produto.valorUnitario || 0).toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limparFormulario() {
    setIdEmEdicao(null);
    setNomeProduto('');
    setQtdProduto('');
    setQtdEmbalagens('');
    setUnidadesPorEmbalagem('');
    setValorPreenchido('');
    setTipoEntrada('unidade');
  }

  const inputStyle = {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--borda)',
    backgroundColor: 'darkgray',
    color: '#000',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box' as const
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 'bold',
    marginBottom: '6px',
    color: 'var(--text-secundario)'
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', marginTop: '20px' }}>
      <h3 style={{ color: idEmEdicao ? '#e67e22' : 'inherit', marginTop: 0 }}>
        {idEmEdicao ? '✏️ Editando Produto' : '📦 Controle de Estoque'}
      </h3>
      
      <form onSubmit={lidarComCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px', paddingBottom: '25px', borderBottom: '2px dashed var(--borda)' }}>
        
        {/* Tipo de Entrada (Esconde na edição para evitar confusão) */}
        {!idEmEdicao && (
          <div style={{ display: 'flex', gap: '15px' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={labelStyle}>Formato de Compra</label>
              <select 
                value={tipoEntrada} 
                onChange={(e) => setTipoEntrada(e.target.value as 'unidade' | 'caixa' | 'pacote')} 
                style={inputStyle}
              >
                <option value="unidade">Adicionar por Unidades</option>
                <option value="caixa">Comprei em Caixa(s)</option>
                <option value="pacote">Comprei em Pacote(s)</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label style={labelStyle}>Nome do Material</label>
            <input type="text" placeholder="Ex: Luva de Látex" value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)} style={inputStyle} />
          </div>

          {tipoEntrada === 'unidade' ? (
            <>
              <div style={{ flex: '1 1 100px' }}>
                <label style={labelStyle}>Quantidade</label>
                <input type="number" step="any" placeholder="0" value={qtdProduto} onChange={(e) => setQtdProduto(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label style={labelStyle}>Valor da Unidade (R$)</label>
                <input type="number" step="0.01" placeholder="0.00" value={valorPreenchido} onChange={(e) => setValorPreenchido(e.target.value)} style={inputStyle} />
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: '1 1 100px' }}>
                <label style={labelStyle}>Qtd. de {tipoEntrada === 'caixa' ? 'Caixas' : 'Pacotes'}</label>
                <input type="number" step="any" placeholder="0" value={qtdEmbalagens} onChange={(e) => setQtdEmbalagens(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={labelStyle}>Vem quantos dentro?</label>
                <input type="number" step="any" placeholder="100" value={unidadesPorEmbalagem} onChange={(e) => setUnidadesPorEmbalagem(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label style={labelStyle}>Valor da {tipoEntrada === 'caixa' ? 'Caixa' : 'Pacote'} (R$)</label>
                <input type="number" step="0.01" placeholder="0.00" value={valorPreenchido} onChange={(e) => setValorPreenchido(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" style={{ padding: '12px', backgroundColor: idEmEdicao ? '#e67e22' : '#2980b9', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' }}>
            {idEmEdicao ? 'Atualizar Estoque' : 'Registrar Compra'}
          </button>
          
          {idEmEdicao && (
             <button type="button" onClick={limparFormulario} style={{ padding: '12px', backgroundColor: '#7f8c8d', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' }}>
              Cancelar Edição
            </button>
          )}
        </div>
      </form>

      <h4>Materiais Disponíveis:</h4>
      {produtos.map(produto => (
        <div key={produto.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'var(--bg-card-item)', marginBottom: '10px', borderRadius: '6px', border: '1px solid var(--borda)' }}>
          <div>
            <strong style={{ fontSize: '16px' }}>{produto.nome}</strong>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>{produto.quantidade} unidades em estoque | Custo un.: R$ {produto.valorUnitario?.toFixed(2)}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => prepararEdicao(produto)} style={{ padding: '8px 12px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✏️</button>
            <button onClick={() => deleteDoc(doc(db, 'estoque', produto.id))} style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
  );
}