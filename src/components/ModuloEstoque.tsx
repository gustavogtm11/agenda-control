// src/components/ModuloEstoque.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, onSnapshot, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import '../App.css';

interface ModuloEstoqueProps {
  perfil: { companyId: string; } | null;
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
  const [qtdProduto, setQtdProduto] = useState<string>(''); 
  const [rendimento, setRendimento] = useState<string>('1'); // NOVO: Quantas porções rende cada unidade
  const [valorUnitario, setValorUnitario] = useState<string>(''); 

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

    const valorUnitarioNum = parseFloat(valorUnitario);
    const quantidadeComprada = parseFloat(qtdProduto);
    const rendimentoNum = parseFloat(rendimento);

    if (!nomeProduto || isNaN(quantidadeComprada) || isNaN(valorUnitarioNum) || valorUnitarioNum < 0 || isNaN(rendimentoNum) || rendimentoNum <= 0) {
      alert("Preencha todos os campos com valores válidos!");
      return;
    }

    try {
      const nomeFormatado = nomeProduto.trim();
      const custoTotal = quantidadeComprada * valorUnitarioNum;
      
      // A quantidade que vai para o estoque é a quantidade comprada multiplicada pelas porções
      const quantidadeRealAdicionar = quantidadeComprada * rendimentoNum;

      if (idEmEdicao) {
        await updateDoc(doc(db, 'estoque', idEmEdicao), {
          nome: nomeFormatado,
          quantidade: quantidadeRealAdicionar, // Atualiza para a nova quantidade
          valorUnitario: valorUnitarioNum
        });
        alert("Produto atualizado com sucesso!");
      } else {
        const q = query(collection(db, 'estoque'), where('companyId', '==', perfil?.companyId), where('nome', '==', nomeFormatado));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const produtoExistente = querySnapshot.docs[0];
          const novaQuantidade = produtoExistente.data().quantidade + quantidadeRealAdicionar;
          await updateDoc(doc(db, 'estoque', produtoExistente.id), {
            quantidade: novaQuantidade,
            valorUnitario: valorUnitarioNum
          });
        } else {
          await addDoc(collection(db, 'estoque'), {
            nome: nomeFormatado,
            quantidade: quantidadeRealAdicionar,
            valorUnitario: valorUnitarioNum,
            companyId: perfil?.companyId 
          });
        }

        if (custoTotal > 0 && perfil?.companyId) {
          await addDoc(collection(db, 'financas'), {
            descricao: `Compra de Estoque: ${quantidadeComprada} un. de ${nomeFormatado}`,
            valor: custoTotal,
            tipo: 'saida',
            data: new Date().toISOString(),
            companyId: perfil.companyId,
            origem: 'estoque'
          });
        }
        alert("Estoque adicionado e despesa registrada!");
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
    setQtdProduto(produto.quantidade.toString());
    setRendimento('1'); // Ao editar diretamente, assume 1 para não multiplicar errado, ou o usuário ajusta
    setValorUnitario((produto.valorUnitario || 0).toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limparFormulario() {
    setIdEmEdicao(null);
    setNomeProduto('');
    setQtdProduto('');
    setRendimento('1');
    setValorUnitario('');
  }

  const inputStyle = {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--borda)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-principal)',
    fontSize: '16px',
    width: '100%',
    boxSizing: 'border-box' as const
  };

  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-secundario)' };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', marginTop: '20px' }}>
      <h3 style={{ color: idEmEdicao ? '#e67e22' : 'inherit', marginTop: 0 }}>
        {idEmEdicao ? '✏️ Editando Produto' : '📦 Controle de Estoque'}
      </h3>
      
      <form onSubmit={lidarComCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px', paddingBottom: '25px', borderBottom: '2px dashed var(--borda)' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label style={labelStyle}>Material</label>
            <input type="text" placeholder="Ex: Pó Descolorante" value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label style={labelStyle}>Qtd. Comprada</label>
            <input type="number" step="any" placeholder="0" value={qtdProduto} onChange={(e) => setQtdProduto(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={labelStyle}>Rende (Porções/Unid)</label>
            <input type="number" step="any" placeholder="1" value={rendimento} onChange={(e) => setRendimento(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={labelStyle}>Valor Total Unit. (R$)</label>
            <input type="number" step="0.01" placeholder="0.00" value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <button type="submit" style={{ padding: '12px', backgroundColor: idEmEdicao ? '#e67e22' : '#2980b9', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' }}>
          {idEmEdicao ? 'Atualizar Estoque' : 'Registrar Compra'}
        </button>
      </form>

      <h4>Materiais Disponíveis:</h4>
      {produtos.map(produto => (
        <div key={produto.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'var(--bg-card-item)', marginBottom: '10px', borderRadius: '6px', border: '1px solid var(--borda)' }}>
          <div>
            <strong style={{ fontSize: '16px' }}>{produto.nome}</strong>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>{produto.quantidade} porções/unid. disponíveis</p>
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