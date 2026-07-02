// src/components/ModuloServicos.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import '../App.css'

interface ModuloServicosProps {
  perfil: { companyId: string } | null;
}

// NOVA ESTRUTURA: Um item de consumo tem o nome do material e a quantidade
interface ConsumoMaterial {
  nomeMaterial: string;
  quantidade: number;
}

interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracaoMinutos: number;
  materiaisConsumidos?: ConsumoMaterial[]; // Agora é uma lista!
}

interface ProdutoEstoque {
  id: string;
  nome: string;
}

export function ModuloServicos({ perfil }: ModuloServicosProps) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [produtosEstoque, setProdutosEstoque] = useState<ProdutoEstoque[]>([]);
  
  // Estados do Formulário
  const [idEmEdicao, setIdEmEdicao] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState<number | ''>('');
  const [duracao, setDuracao] = useState<number | ''>(30);
  
  // ESTADO DA LISTA DE MATERIAIS CONSUMIDOS
  // Começamos com uma lista vazia. O usuário clica no "+" para adicionar itens.
  const [materiaisConsumidos, setMateriaisConsumidos] = useState<ConsumoMaterial[]>([]);

  useEffect(() => {
    if (!perfil?.companyId) return;

    const qServicos = query(collection(db, 'servicos'), where('companyId', '==', perfil.companyId));
    
    const unsubscribeServicos = onSnapshot(qServicos, (snapshot) => {
      const lista: Servico[] = [];
      snapshot.forEach(doc => {
        const dados = doc.data();
        lista.push({
          id: doc.id,
          nome: dados.nome,
          preco: dados.preco,
          duracaoMinutos: dados.duracaoMinutos || 30,
          materiaisConsumidos: dados.materiaisConsumidos || [] // Carrega a lista se existir
        });
      });
      lista.sort((a, b) => a.nome.localeCompare(b.nome));
      setServicos(lista);
    });

    const qEstoque = query(collection(db, 'estoque'), where('companyId', '==', perfil.companyId));
    const unsubscribeEstoque = onSnapshot(qEstoque, (snapshot) => {
      const listaEstoque: ProdutoEstoque[] = [];
      snapshot.forEach(doc => {
        listaEstoque.push({
          id: doc.id,
          nome: doc.data().nome
        });
      });
      setProdutosEstoque(listaEstoque);
    });

    return () => {
      unsubscribeServicos();
      unsubscribeEstoque();
    };
  }, [perfil?.companyId]);

  // FUNÇÕES PARA GERENCIAR A LISTA DE MATERIAIS NO FORMULÁRIO

  // Adiciona uma linha em branco na lista
  const adicionarMaterial = () => {
    setMateriaisConsumidos([...materiaisConsumidos, { nomeMaterial: '', quantidade: 1 }]);
  };

  // Remove uma linha específica
  const removerMaterial = (index: number) => {
    const novaLista = [...materiaisConsumidos];
    novaLista.splice(index, 1);
    setMateriaisConsumidos(novaLista);
  };

  // Atualiza os dados de uma linha específica (quando o usuário escolhe o material ou digita a quantidade)
  const atualizarMaterial = (index: number, campo: keyof ConsumoMaterial, valor: any) => {
    const novaLista = [...materiaisConsumidos];
    novaLista[index] = { ...novaLista[index], [campo]: valor };
    setMateriaisConsumidos(novaLista);
  };


  async function lidarComCadastro(e: React.FormEvent) {
    e.preventDefault();

    if (!nome || preco === '' || Number(preco) < 0 || duracao === '' || Number(duracao) <= 0) {
      alert('Preencha todos os campos obrigatórios (Nome, Preço e Duração) com valores válidos.');
      return;
    }

    // Validação extra: garantir que as linhas de material estejam preenchidas
    const temMaterialInvalido = materiaisConsumidos.some(m => !m.nomeMaterial || m.quantidade <= 0);
    if (temMaterialInvalido) {
        alert("Preencha corretamente os materiais consumidos ou remova a linha.");
        return;
    }

    try {
      const dadosServico: any = {
        nome: nome.trim(),
        preco: Number(preco),
        duracaoMinutos: Number(duracao),
        companyId: perfil?.companyId,
        materiaisConsumidos: materiaisConsumidos // Salvamos o array completo!
      };

      if (idEmEdicao) {
        await updateDoc(doc(db, 'servicos', idEmEdicao), dadosServico);
        alert('Serviço atualizado!');
      } else {
        await addDoc(collection(db, 'servicos'), dadosServico);
        alert('Serviço cadastrado com sucesso!');
      }
      
      limparFormulario();
    } catch (error) {
      console.error("Erro ao salvar serviço: ", error);
      alert('Ocorreu um erro ao salvar.');
    }
  }

  function prepararEdicao(servico: Servico) {
    setIdEmEdicao(servico.id);
    setNome(servico.nome);
    setPreco(servico.preco);
    setDuracao(servico.duracaoMinutos);
    // Carrega a lista de materiais consumidos (se não houver, garante que é array vazio)
    setMateriaisConsumidos(servico.materiaisConsumidos || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limparFormulario() {
    setIdEmEdicao(null);
    setNome('');
    setPreco('');
    setDuracao(30);
    setMateriaisConsumidos([]); // Zera a lista ao limpar
  }

  async function excluirServico(id: string, nomeServico: string) {
    if (window.confirm(`Tem certeza que deseja excluir o serviço "${nomeServico}"?`)) {
      try {
        await deleteDoc(doc(db, 'servicos', id));
      } catch (error) {
        console.error("Erro ao excluir: ", error);
      }
    }
  }

  const inputStyle = {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--borda)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-principal)',
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
        {idEmEdicao ? '✏️ Editando Serviço' : '✂️ Cadastro de Serviços'}
      </h3>

      <form onSubmit={lidarComCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px', paddingBottom: '25px', borderBottom: '2px dashed var(--borda)' }}>
        
        {/* PRIMEIRA LINHA: Dados Básicos */}
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 250px' }}>
            <label style={labelStyle}>Nome do Serviço *</label>
            <input type="text" placeholder="Ex: Corte Degrade" value={nome} onChange={(e) => setNome(e.target.value)} style={inputStyle} />
          </div>
          
          <div style={{ flex: '1 1 120px' }}>
            <label style={labelStyle}>Preço (R$) *</label>
            <input type="number" step="0.01" placeholder="0.00" value={preco} onChange={(e) => setPreco(Number(e.target.value))} style={inputStyle} />
          </div>

          <div style={{ flex: '1 1 120px' }}>
            <label style={labelStyle}>Duração (min) *</label>
            <input type="number" placeholder="30" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>

        {/* SEGUNDA SEÇÃO: Lista Dinâmica de Materiais Consumidos */}
        <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '15px', borderRadius: '6px', border: '1px solid var(--borda)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Materiais Consumidos (Opcional)</label>
              
              {/* BOTÃO + PARA ADICIONAR MATERIAL */}
              <button 
                type="button" 
                onClick={adicionarMaterial} 
                style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                + Adicionar Material
              </button>
          </div>

          {/* LISTA DE CAMPOS (RENDERIZADA BASEADA NO ARRAY) */}
          {materiaisConsumidos.length === 0 ? (
              <p style={{ color: 'var(--text-secundario)', fontSize: '13px', fontStyle: 'italic' }}>Nenhum material vinculado a este serviço.</p>
          ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {materiaisConsumidos.map((item, index) => (
                      <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <select 
                            value={item.nomeMaterial} 
                            onChange={(e) => atualizarMaterial(index, 'nomeMaterial', e.target.value)}
                            style={{ ...inputStyle, flex: 2 }}
                          >
                            <option value="">Selecione o material...</option>
                            {produtosEstoque.map(produto => (
                              <option key={produto.id} value={produto.nome}>{produto.nome}</option>
                            ))}
                          </select>
                          
                          <input
                            type="number"
                            placeholder="Qtd"
                            value={item.quantidade}
                            onChange={(e) => atualizarMaterial(index, 'quantidade', Number(e.target.value))}
                            style={{ ...inputStyle, flex: 1 }}
                          />

                          <button 
                            type="button" 
                            onClick={() => removerMaterial(index)}
                            style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', padding: '10px', cursor: 'pointer' }}
                            title="Remover material"
                          >
                            🗑️
                          </button>
                      </div>
                  ))}
              </div>
          )}
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" style={{ padding: '12px 24px', backgroundColor: idEmEdicao ? '#e67e22' : '#27ae60', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px' }}>
            {idEmEdicao ? 'Atualizar Serviço' : 'Cadastrar Serviço'}
          </button>

          {idEmEdicao && (
            <button type="button" onClick={limparFormulario} style={{ padding: '12px 24px', backgroundColor: 'var(--text-secundario)', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '15px' }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* CATÁLOGO */}
      <h4 style={{ marginBottom: '15px' }}>Catálogo de Serviços</h4>
      {servicos.length === 0 ? (
        <p style={{ color: 'var(--text-secundario)' }}>Nenhum serviço cadastrado.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
          {servicos.map(servico => (
            <div key={servico.id} style={{ padding: '15px', background: 'var(--bg-card-item)', border: '1px solid var(--borda)', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '18px', display: 'block', marginBottom: '8px' }}>{servico.nome}</strong>
                <p style={{ margin: '0 0 5px 0', color: '#27ae60', fontWeight: 'bold', fontSize: '16px' }}>R$ {servico.preco.toFixed(2)}</p>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secundario)', fontSize: '14px' }}>⏱️ {servico.duracaoMinutos} minutos</p>
                
                {/* MOSTRA A LISTA DE MATERIAIS NO CARD DO CATÁLOGO */}
                {servico.materiaisConsumidos && servico.materiaisConsumidos.length > 0 && (
                  <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '4px', border: '1px dashed var(--borda)', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secundario)', display: 'block', marginBottom: '5px' }}>📦 Consome: </span>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {servico.materiaisConsumidos.map((mat, i) => (
                            <li key={i}><strong>{mat.quantidade}x {mat.nomeMaterial}</strong></li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button onClick={() => prepararEdicao(servico)} style={{ flex: 1, padding: '10px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ✏️ Editar
                </button>
                <button onClick={() => excluirServico(servico.id, servico.nome)} style={{ flex: 1, padding: '10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  🗑️ Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}