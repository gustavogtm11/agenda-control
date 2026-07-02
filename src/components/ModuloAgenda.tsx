// src/components/ModuloAgenda.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, doc, getDocs, getDoc } from 'firebase/firestore';
import '../App.css';

interface ModuloAgendaProps {
  perfil: { companyId: string; role: string } | null;
}

interface Servico { id: string; nome: string; preco: number; duracaoMinutos: number; }
interface Funcionario { email: string; nome: string; }
interface Agendamento {
  id: string; 
  clienteNome: string; 
  servicoId: string; 
  servicoNome: string;
  funcionarioEmail?: string; 
  preco: number; 
  dataHora: string; 
  status: 'pendente' | 'concluido';
  googleEventId?: string; 
}

const pegarDataRelativa = (diasDeslocamento: number) => {
  const data = new Date();
  data.setDate(data.getDate() + diasDeslocamento);
  const tzoffset = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - tzoffset).toISOString().split('T')[0];
};

const dataDeHoje = () => pegarDataRelativa(0);

const gerarHorarios = () => {
  const horarios = [];
  for (let i = 7; i <= 20; i++) {
    const h = i.toString().padStart(2, '0');
    horarios.push(`${h}:00`); horarios.push(`${h}:30`);
  }
  return horarios;
};

export function ModuloAgenda({ perfil }: ModuloAgendaProps) {
  const [servicosDisponiveis, setServicosDisponiveis] = useState<Servico[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  const [idEmEdicao, setIdEmEdicao] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [dataForm, setDataForm] = useState(dataDeHoje());
  const [horaForm, setHoraForm] = useState('08:00');
  const [idServicoSelecionado, setIdServicoSelecionado] = useState('');
  const [emailFuncionarioSelecionado, setEmailFuncionarioSelecionado] = useState('');

  const [dataVisaoDiaria, setDataVisaoDiaria] = useState(dataDeHoje());

  useEffect(() => {
    if (!perfil?.companyId) return;
    onSnapshot(query(collection(db, 'servicos'), where('companyId', '==', perfil.companyId)), (snapshot) => {
      const lista: Servico[] = [];
      snapshot.forEach(doc => lista.push({ id: doc.id, nome: doc.data().nome, preco: doc.data().preco, duracaoMinutos: doc.data().duracaoMinutos || 30 }));
      setServicosDisponiveis(lista);
    });
    onSnapshot(query(collection(db, 'usuarios'), where('companyId', '==', perfil.companyId), where('role', '==', 'funcionario')), (snapshot) => {
      const lista: Funcionario[] = [];
      snapshot.forEach(doc => lista.push({ email: doc.id, nome: doc.data().nome }));
      setFuncionarios(lista);
    });
    onSnapshot(query(collection(db, 'agendamentos'), where('companyId', '==', perfil.companyId), orderBy('dataHora', 'asc')), (snapshot) => {
      const lista: Agendamento[] = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        lista.push({ id: doc.id, ...d } as Agendamento);
      });
      setAgendamentos(lista);
    });
  }, [perfil?.companyId]);

  // FUNÇÃO NOVA: Filtra horários ocupados e evita encavalamento
  const obterHorariosDisponiveis = () => {
    const todosHorarios = gerarHorarios();
    if (!dataForm) return todosHorarios;

    const servicoAtual = servicosDisponiveis.find(s => s.id === idServicoSelecionado);
    const duracaoAtual = servicoAtual?.duracaoMinutos || 30; // Se não escolheu, simula 30 min

    const agendamentosDoDia = agendamentos.filter(a =>
      a.dataHora.startsWith(dataForm) && a.id !== idEmEdicao
    );

    return todosHorarios.filter(horario => {
      const [h, m] = horario.split(':').map(Number);
      const inicioDesejado = h * 60 + m; // Converte para minutos
      const fimDesejado = inicioDesejado + duracaoAtual;

      const temConflito = agendamentosDoDia.some(agendamento => {
         const [hAg, mAg] = agendamento.dataHora.split('T')[1].split(':').map(Number);
         const inicioOcupado = hAg * 60 + mAg;

         const servicoAgendado = servicosDisponiveis.find(s => s.id === agendamento.servicoId);
         const duracaoOcupada = servicoAgendado?.duracaoMinutos || 30;
         const fimOcupado = inicioOcupado + duracaoOcupada;

         // A mágica: Um horário encavala se ele começa ANTES do outro terminar e termina DEPOIS do outro começar
         return inicioDesejado < fimOcupado && fimDesejado > inicioOcupado;
      });

      return !temConflito;
    });
  };

  const horariosValidos = obterHorariosDisponiveis();
  // Garante que o select não quebre caso o horário selecionado suma da lista após mudar a data/serviço
  const horaExibida = horariosValidos.includes(horaForm) ? horaForm : (horariosValidos[0] || '');

  async function lidarComAgendamento(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !dataForm || !horaForm || !idServicoSelecionado || !perfil?.companyId) {
      alert("Preencha todos os campos obrigatórios!"); return;
    }
    
    if (horariosValidos.length === 0) {
      alert("Não há horários disponíveis para este dia com essa duração!"); return;
    }

    const servicoEscolhido = servicosDisponiveis.find(s => s.id === idServicoSelecionado);
    const funcEscolhido = funcionarios.find(f => f.email === emailFuncionarioSelecionado);
    
    // Pega a hora validada (caso a antiga tenha ficado bloqueada)
    const dataHoraIso = `${dataForm}T${horaExibida}`;

    try {
      const tokenGoogle = sessionStorage.getItem('googleToken');
      if (!tokenGoogle) {
        alert("⚠️ Você não está conectado ao Google ou a sessão expirou. O agendamento será salvo apenas no sistema.");
      }

      const start = new Date(`${dataHoraIso}:00`);
      const end = new Date(start.getTime() + ((servicoEscolhido?.duracaoMinutos || 30) * 60 * 1000));
      const convidados = emailFuncionarioSelecionado ? [{ email: emailFuncionarioSelecionado }] : [];
      
      const eventoGoogle = {
        summary: `${servicoEscolhido?.nome} - ${cliente} ${funcEscolhido ? `(Prof: ${funcEscolhido.nome})` : ''}`,
        description: `.\nServiço: ${servicoEscolhido?.nome}\nDuração: ${servicoEscolhido?.duracaoMinutos || 30} min`,
        start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
        end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
        attendees: convidados
      };

      const dadosSalvar: any = {
        clienteNome: cliente, dataHora: dataHoraIso, servicoId: servicoEscolhido?.id,
        servicoNome: servicoEscolhido?.nome, funcionarioEmail: emailFuncionarioSelecionado || null,
        preco: servicoEscolhido?.preco, companyId: perfil?.companyId 
      };

      if (idEmEdicao) {
        const agendaAntiga = agendamentos.find(a => a.id === idEmEdicao);
        if (tokenGoogle && agendaAntiga?.googleEventId) {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${agendaAntiga.googleEventId}?sendUpdates=all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventoGoogle)
          });
        }
        await updateDoc(doc(db, 'agendamentos', idEmEdicao), dadosSalvar);
        alert("Agendamento atualizado com sucesso!");
      } else {
        dadosSalvar.status = 'pendente';
        const docRef = await addDoc(collection(db, 'agendamentos'), dadosSalvar);
        
        if (tokenGoogle) {
          const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventoGoogle)
          });

          if (res.ok) {
            const googleData = await res.json();
            await updateDoc(docRef, { googleEventId: googleData.id });
          } else {
            console.error("Erro da API Google:", await res.text());
          }
        }
        alert("Agendamento efetuado!");
      }

      setCliente(''); setIdServicoSelecionado(''); setEmailFuncionarioSelecionado(''); setIdEmEdicao(null);
      setDataVisaoDiaria(dataForm); 
    } catch (erro) { console.error(erro); alert("Erro ao salvar."); }
  }

  function prepararEdicao(agenda: Agendamento) {
    setIdEmEdicao(agenda.id);
    setCliente(agenda.clienteNome);
    setDataForm(agenda.dataHora.split('T')[0]);
    setHoraForm(agenda.dataHora.split('T')[1]);
    setIdServicoSelecionado(agenda.servicoId);
    setEmailFuncionarioSelecionado(agenda.funcionarioEmail || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function excluirAgendamento(agenda: Agendamento) {
    if (window.confirm("Tem certeza? O agendamento será excluído do sistema e da sua Google Agenda.")) {
      try {
        await deleteDoc(doc(db, 'agendamentos', agenda.id));
        const tokenGoogle = sessionStorage.getItem('googleToken');
        if (tokenGoogle && agenda.googleEventId) {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${agenda.googleEventId}?sendUpdates=all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenGoogle}` }
          });
        }
      } catch(e) {
        console.error("Erro ao excluir", e);
      }
    }
  }

  async function marcarComoConcluido(agenda: Agendamento) {
    try {
      await updateDoc(doc(db, 'agendamentos', agenda.id), { status: 'concluido' });

      if (perfil?.companyId) {
        await addDoc(collection(db, 'financas'), {
          descricao: `Serviço: ${agenda.servicoNome} - Cliente: ${agenda.clienteNome}`,
          valor: agenda.preco,
          tipo: 'entrada',
          data: new Date().toISOString(),
          companyId: perfil.companyId,
          origem: 'agenda'
        });
        
        const servicoRef = doc(db, 'servicos', agenda.servicoId);
        const servicoSnap = await getDoc(servicoRef);
        
        if (servicoSnap.exists()) {
          const dadosServico = servicoSnap.data();
          const nomeMaterial = dadosServico.materialConsumido;
          const qtdConsumida = dadosServico.quantidadeMaterial || 0;

          if (nomeMaterial && qtdConsumida > 0) {
             const qEstoque = query(
              collection(db, 'estoque'), 
              where('companyId', '==', perfil.companyId),
              where('nome', '==', nomeMaterial)
            );
            const querySnapshot = await getDocs(qEstoque);
            
            if (!querySnapshot.empty) {
                const itemEstoque = querySnapshot.docs[0];
                const qtdAtual = itemEstoque.data().quantidade;
                
                await updateDoc(doc(db, 'estoque', itemEstoque.id), {
                    quantidade: Math.max(0, qtdAtual - qtdConsumida)
                });
            }
          }
        }

        alert("Serviço concluído com sucesso! Caixa e Estoque foram atualizados.");
      } else {
        console.error("Erro: perfil.companyId está vazio!");
      }
    } catch (erro) {
      console.error("Erro ao marcar concluído:", erro);
      alert("Houve um erro ao tentar concluir o serviço.");
    }
  }

  function mudarDia(delta: number) {
    const [ano, mes, dia] = dataVisaoDiaria.split('-').map(Number);
    const dataAtual = new Date(ano, mes - 1, dia); 
    dataAtual.setDate(dataAtual.getDate() + delta);
    
    const novoAno = dataAtual.getFullYear();
    const novoMes = String(dataAtual.getMonth() + 1).padStart(2, '0');
    const novoDia = String(dataAtual.getDate()).padStart(2, '0');
    
    setDataVisaoDiaria(`${novoAno}-${novoMes}-${novoDia}`);
  }

  const obterTituloDataVisao = () => {
    if (dataVisaoDiaria === pegarDataRelativa(0)) return 'Hoje';
    if (dataVisaoDiaria === pegarDataRelativa(-1)) return 'Ontem';
    if (dataVisaoDiaria === pegarDataRelativa(1)) return 'Amanhã';
    return 'Data Selecionada';
  };

  const tituloDaData = obterTituloDataVisao();
  const corDoTitulo = tituloDaData === 'Hoje' ? '#3498db' : 'var(--text-secundario)';

  const agendamentosDoDia = agendamentos.filter(a => a.dataHora.startsWith(dataVisaoDiaria));

  const inputStyle = {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--borda)',
    color: 'var(--text-principal)',
    fontSize: '14px',
    boxSizing: 'border-box' as const
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', transition: 'all 0.3s' }}>
      
      <h3 style={{ marginTop: 0, color: idEmEdicao ? '#e67e22' : 'var(--text-principal)' }}>
        {idEmEdicao ? '✏️ Editando Agendamento' : '➕ Novo Agendamento'}
      </h3>
      
      <form onSubmit={lidarComAgendamento} style={{ display: 'flex', gap: '10px', marginBottom: '40px', flexWrap: 'wrap', paddingBottom: '20px', borderBottom: '2px dashed var(--borda)' }}>
        <input 
          type="text" 
          placeholder="Nome do Cliente" 
          value={cliente} 
          onChange={e => setCliente(e.target.value)} 
          style={{ ...inputStyle, flex: '1 1 200px' }} 
        />
        <input 
          type="date" 
          value={dataForm} 
          onChange={e => setDataForm(e.target.value)} 
          style={{ ...inputStyle, flex: '1 1 130px' }} 
        />
        
        {/* Select de Horários Inteligente (Filtra ocupados) */}
        <select 
          value={horaExibida} 
          onChange={e => setHoraForm(e.target.value)} 
          style={{ ...inputStyle, flex: '1 1 100px' }}
        >
          {horariosValidos.length === 0 ? (
            <option value="">Lotação Máx.</option>
          ) : (
            horariosValidos.map(h => <option key={h} value={h}>{h}</option>)
          )}
        </select>

        <select 
          value={idServicoSelecionado} 
          onChange={e => setIdServicoSelecionado(e.target.value)} 
          style={{ ...inputStyle, flex: '1 1 200px' }}
        >
          <option value="">-- Serviço --</option>
          {servicosDisponiveis.map(s => <option key={s.id} value={s.id}>{s.nome} - R$ {s.preco.toFixed(2)}</option>)}
        </select>
        <select 
          value={emailFuncionarioSelecionado} 
          onChange={e => setEmailFuncionarioSelecionado(e.target.value)} 
          style={{ ...inputStyle, flex: '1 1 180px' }}
        >
          <option value="">-- Profissional --</option>
          {funcionarios.map(f => <option key={f.email} value={f.email}>{f.nome}</option>)}
        </select>
        
        <button type="submit" disabled={horariosValidos.length === 0} style={{ padding: '12px 20px', backgroundColor: horariosValidos.length === 0 ? '#95a5a6' : (idEmEdicao ? '#e67e22' : '#2980b9'), color: 'white', border: 'none', cursor: horariosValidos.length === 0 ? 'not-allowed' : 'pointer', borderRadius: '6px', fontWeight: 'bold' }}>
          {idEmEdicao ? 'Atualizar' : 'Agendar'}
        </button>
        {idEmEdicao && (
          <button type="button" onClick={() => { setIdEmEdicao(null); setCliente(''); }} style={{ padding: '12px 20px', backgroundColor: 'var(--text-secundario)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Cancelar
          </button>
        )}
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card-destaque)', padding: '15px', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-principal)' }}>🗓️ Planner</h3>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'var(--bg-input)', padding: '5px 15px', borderRadius: '20px', border: '1px solid var(--borda)' }}>
          <button type="button" onClick={() => mudarDia(-1)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-principal)' }}>◀</button>
          
          {/* Seletor Rápido de Data Integrado */}
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: corDoTitulo }}>
              {tituloDaData}
            </span>
            <input 
              type="date" 
              value={dataVisaoDiaria}
              onChange={e => {
                if(e.target.value) setDataVisaoDiaria(e.target.value);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-principal)',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer',
                outline: 'none',
                padding: '2px'
              }}
              title="Pular para uma data específica"
            />
          </div>

          <button type="button" onClick={() => mudarDia(1)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-principal)' }}>▶</button>
        </div>
      </div>

      {agendamentosDoDia.length === 0 ? (
        <p style={{ color: 'var(--text-secundario)', textAlign: 'center', padding: '20px' }}>Nenhum agendamento para este dia.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {agendamentosDoDia.map(agenda => {
            const horaAgendamento = agenda.dataHora.split('T')[1];
            return (
              <div key={agenda.id} style={{ display: 'flex', backgroundColor: 'var(--bg-card-item)', border: '1px solid var(--borda)', borderRadius: '6px', overflow: 'hidden', color: 'var(--text-principal)' }}>
                
                <div style={{ backgroundColor: agenda.status === 'pendente' ? '#34495e' : '#27ae60', color: 'white', padding: '20px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '60px', fontWeight: 'bold', fontSize: '18px' }}>
                  {horaAgendamento}
                </div>
                
                <div style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>{agenda.clienteNome}</h4>
                    <p style={{ margin: 0, color: 'var(--text-secundario)', fontSize: '14px' }}>
                      {agenda.servicoNome} {agenda.funcionarioEmail && `(Prof: ${funcionarios.find(f => f.email === agenda.funcionarioEmail)?.nome})`}
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {agenda.status === 'pendente' ? (
                      <>
                        <button onClick={() => prepararEdicao(agenda)} style={{ padding: '8px 12px', backgroundColor: '#f39d12c9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✏️</button>
                        <button onClick={() => excluirAgendamento(agenda)} style={{ padding: '8px 12px', backgroundColor: '#e74d3ccb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                        <button onClick={() => marcarComoConcluido(agenda)} style={{ padding: '8px 12px', backgroundColor: '#27ae60c9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✓ Concluir</button>
                      </>
                    ) : <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✓ Finalizado</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}