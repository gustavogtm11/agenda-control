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
  duracaoMinutos: number; 
  status: 'pendente' | 'concluido';
  googleEventId?: string; 
}

type DiaSemana = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
interface HorarioDia { ativo: boolean; inicio: string; fim: string; }
type HorariosFuncionamento = Record<DiaSemana, HorarioDia>;

const diasDaSemanaKeys: DiaSemana[] = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

const pegarDataRelativa = (diasDeslocamento: number) => {
  const data = new Date();
  data.setDate(data.getDate() + diasDeslocamento);
  const tzoffset = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - tzoffset).toISOString().split('T')[0];
};

const dataDeHoje = () => pegarDataRelativa(0);

const gerarHorarios = () => {
  const horarios = [];
  for (let i = 0; i <= 23; i++) {
    const h = i.toString().padStart(2, '0');
    horarios.push(`${h}:00`); horarios.push(`${h}:30`);
  }
  return horarios;
};

export function ModuloAgenda({ perfil }: ModuloAgendaProps) {
  const [servicosDisponiveis, setServicosDisponiveis] = useState<Servico[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [configHorarios, setConfigHorarios] = useState<HorariosFuncionamento | null>(null);

  // Estados do Formulário
  const [idEmEdicao, setIdEmEdicao] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [dataForm, setDataForm] = useState(dataDeHoje());
  const [horaForm, setHoraForm] = useState('08:00');
  const [idServicoSelecionado, setIdServicoSelecionado] = useState('');
  const [emailFuncionarioSelecionado, setEmailFuncionarioSelecionado] = useState('');

  // Estados do Planner e Visão
  const [dataVisaoDiaria, setDataVisaoDiaria] = useState(dataDeHoje());

  // Estados do Gerador de WhatsApp
  const [modalWppAberto, setModalWppAberto] = useState(false);
  const [dataInicioWpp, setDataInicioWpp] = useState(dataDeHoje());
  const [dataFimWpp, setDataFimWpp] = useState(dataDeHoje());
  const [textoWpp, setTextoWpp] = useState('');

  useEffect(() => {
    if (!perfil?.companyId) return;

    const unsubServicos = onSnapshot(query(collection(db, 'servicos'), where('companyId', '==', perfil.companyId)), (snapshot) => {
      const lista: Servico[] = [];
      snapshot.forEach(doc => lista.push({ id: doc.id, nome: doc.data().nome, preco: doc.data().preco, duracaoMinutos: doc.data().duracaoMinutos || 30 }));
      setServicosDisponiveis(lista);
    });

    const unsubFuncionarios = onSnapshot(query(collection(db, 'usuarios'), where('companyId', '==', perfil.companyId), where('role', '==', 'funcionario')), (snapshot) => {
      const lista: Funcionario[] = [];
      snapshot.forEach(doc => lista.push({ email: doc.id, nome: doc.data().nome }));
      setFuncionarios(lista);
    });

    const unsubAgendamentos = onSnapshot(query(collection(db, 'agendamentos'), where('companyId', '==', perfil.companyId), orderBy('dataHora', 'asc')), (snapshot) => {
      const lista: Agendamento[] = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        lista.push({ id: doc.id, ...d } as Agendamento);
      });
      setAgendamentos(lista);
    });

    const unsubConfig = onSnapshot(doc(db, 'empresas', perfil.companyId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().horariosFuncionamento) {
        setConfigHorarios(docSnap.data().horariosFuncionamento);
      }
    });

    return () => {
      unsubServicos();
      unsubFuncionarios();
      unsubAgendamentos();
      unsubConfig();
    };
  }, [perfil?.companyId]);

  const obterHorariosDisponiveis = () => {
    const todosHorarios = gerarHorarios();
    if (!dataForm || !configHorarios) return todosHorarios;

    const [ano, mes, dia] = dataForm.split('-').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    const diaSemanaIndex = dataObj.getDay();
    const diaKey = diasDaSemanaKeys[diaSemanaIndex];
    
    const configDoDia = configHorarios[diaKey];

    if (!configDoDia || !configDoDia.ativo) {
      return [];
    }

    const servicoAtual = servicosDisponiveis.find(s => s.id === idServicoSelecionado);
    const duracaoAtual = servicoAtual?.duracaoMinutos || 30;

    const agendamentosDoDia = agendamentos.filter(a =>
      a.dataHora.startsWith(dataForm) && a.id !== idEmEdicao && a.status === 'pendente'
    );

    const [hInicioConfig, mInicioConfig] = configDoDia.inicio.split(':').map(Number);
    const inicioExpediente = hInicioConfig * 60 + mInicioConfig;

    const [hFimConfig, mFimConfig] = configDoDia.fim.split(':').map(Number);
    const fimExpediente = hFimConfig * 60 + mFimConfig;

    return todosHorarios.filter(horario => {
      const [h, m] = horario.split(':').map(Number);
      const inicioDesejado = h * 60 + m; 
      const fimDesejado = inicioDesejado + duracaoAtual;

      if (inicioDesejado < inicioExpediente || fimDesejado > fimExpediente) {
        return false;
      }

      const temConflito = agendamentosDoDia.some(agendamento => {
         const [hAg, mAg] = agendamento.dataHora.split('T')[1].split(':').map(Number);
         const inicioOcupado = hAg * 60 + mAg;
         const duracaoOcupada = agendamento.duracaoMinutos || servicosDisponiveis.find(s => s.id === agendamento.servicoId)?.duracaoMinutos || 30;
         const fimOcupado = inicioOcupado + duracaoOcupada;

         const conflitoTempo = inicioDesejado < fimOcupado && fimDesejado > inicioOcupado;
         const mesmoProfissional = !emailFuncionarioSelecionado || !agendamento.funcionarioEmail || emailFuncionarioSelecionado === agendamento.funcionarioEmail;

         return conflitoTempo && mesmoProfissional;
      });

      return !temConflito;
    });
  };

  const horariosValidos = obterHorariosDisponiveis();
  const horaExibida = horariosValidos.includes(horaForm) ? horaForm : (horariosValidos[0] || '');

  // ==========================================
  // LÓGICA DO GERADOR DE WHATSAPP
  // ==========================================
  const obterHorariosLivresParaWpp = (dataStr: string) => {
    if (!configHorarios) return [];
    
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    const diaKey = diasDaSemanaKeys[dataObj.getDay()];
    const config = configHorarios[diaKey];
    
    if (!config || !config.ativo) return [];

    const todosHorarios = gerarHorarios(); 
    const agendamentosDoDia = agendamentos.filter(a => a.dataHora.startsWith(dataStr) && a.status === 'pendente');

    const [hInicio, mInicio] = config.inicio.split(':').map(Number);
    const inicioExpediente = hInicio * 60 + mInicio;
    
    const [hFim, mFim] = config.fim.split(':').map(Number);
    const fimExpediente = hFim * 60 + mFim;

    return todosHorarios.filter(horario => {
       const [h, m] = horario.split(':').map(Number);
       const minutosAtual = h * 60 + m;
       
       if (minutosAtual < inicioExpediente || minutosAtual >= fimExpediente) return false;

       // Checa se o horário exato já tem alguém agendado cobrindo ele
       const ocupado = agendamentosDoDia.some(ag => {
         const [hAg, mAg] = ag.dataHora.split('T')[1].split(':').map(Number);
         const inicioAg = hAg * 60 + mAg;
         const fimAg = inicioAg + (ag.duracaoMinutos || 30);
         return minutosAtual >= inicioAg && minutosAtual < fimAg;
       });

       return !ocupado;
    });
  };

  const gerarTextoWhatsApp = () => {
    const inicio = new Date(dataInicioWpp + 'T00:00:00');
    const fim = new Date(dataFimWpp + 'T00:00:00');
    
    if (inicio > fim) {
       alert("A data de início não pode ser maior que a data final.");
       return;
    }

    let textoFinal = "Olá! Aqui estão nossos horários disponíveis:\n\n";
    let dataAtual = new Date(inicio);
    const nomesDias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    while (dataAtual <= fim) {
       const ano = dataAtual.getFullYear();
       const mes = String(dataAtual.getMonth() + 1).padStart(2, '0');
       const dia = String(dataAtual.getDate()).padStart(2, '0');
       const dataStr = `${ano}-${mes}-${dia}`;
       
       const horariosLivres = obterHorariosLivresParaWpp(dataStr);
       
       if (horariosLivres.length > 0) {
          const nomeDia = nomesDias[dataAtual.getDay()];
          textoFinal += `*${nomeDia} ${dia}/${mes}*\n`;
          textoFinal += horariosLivres.map(h => `- ${h}`).join('; ') + '\n\n';
       }
       
       dataAtual.setDate(dataAtual.getDate() + 1);
    }
    
    if (textoFinal === "Olá! Aqui estão nossos horários disponíveis:\n\n") {
        textoFinal = "Não há horários disponíveis no período selecionado ou a empresa está fechada nesses dias.";
    }

    setTextoWpp(textoFinal);
  };

  const copiarTexto = () => {
     navigator.clipboard.writeText(textoWpp);
     alert("Mensagem copiada para a área de transferência!");
  };

  const abrirWhatsApp = () => {
     if (!textoWpp) return;
     const textoEncoded = encodeURIComponent(textoWpp);
     window.open(`https://wa.me/?text=${textoEncoded}`, '_blank');
  };
  // ==========================================

  async function lidarComAgendamento(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !dataForm || !horaExibida || !idServicoSelecionado || !perfil?.companyId) {
      alert("Preencha todos os campos obrigatórios!"); return;
    }
    
    if (horariosValidos.length === 0) {
      alert("Não há horários disponíveis para este dia com essa duração!"); return;
    }

    const servicoEscolhido = servicosDisponiveis.find(s => s.id === idServicoSelecionado);
    const funcEscolhido = funcionarios.find(f => f.email === emailFuncionarioSelecionado);
    const dataHoraIso = `${dataForm}T${horaExibida}`;

    try {
      const tokenGoogle = sessionStorage.getItem('googleToken');
      if (!tokenGoogle && navigator.onLine) {
        alert("⚠️ Você não está conectado ao Google ou a sessão expirou. O agendamento será salvo apenas no sistema.");
      }

      const duracaoFinal = servicoEscolhido?.duracaoMinutos || 30;
      const start = new Date(`${dataHoraIso}:00`);
      const end = new Date(start.getTime() + (duracaoFinal * 60 * 1000));
      const convidados = emailFuncionarioSelecionado ? [{ email: emailFuncionarioSelecionado }] : [];
      
      const eventoGoogle = {
        summary: `${servicoEscolhido?.nome} - ${cliente} ${funcEscolhido ? `(Prof: ${funcEscolhido.nome})` : ''}`,
        description: `.\nServiço: ${servicoEscolhido?.nome}\nDuração: ${duracaoFinal} min`,
        start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
        end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
        attendees: convidados
      };

      const dadosSalvar: any = {
        clienteNome: cliente, dataHora: dataHoraIso, servicoId: servicoEscolhido?.id,
        servicoNome: servicoEscolhido?.nome, funcionarioEmail: emailFuncionarioSelecionado || null,
        preco: servicoEscolhido?.preco, 
        duracaoMinutos: duracaoFinal,
        companyId: perfil?.companyId 
      };

      if (idEmEdicao) {
        const agendaAntiga = agendamentos.find(a => a.id === idEmEdicao);
        if (tokenGoogle && agendaAntiga?.googleEventId && navigator.onLine) {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${agendaAntiga.googleEventId}?sendUpdates=all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventoGoogle)
          });
        }
        await updateDoc(doc(db, 'agendamentos', idEmEdicao), dadosSalvar);
        
      } else {
        dadosSalvar.status = 'pendente';
        const docRef = await addDoc(collection(db, 'agendamentos'), dadosSalvar);
        
        if (tokenGoogle && navigator.onLine) {
          const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventoGoogle)
          });

          if (res.ok) {
            const googleData = await res.json();
            await updateDoc(docRef, { googleEventId: googleData.id });
          }
        }
      }

      if (!navigator.onLine) {
        alert("Agendamento salvo localmente! Sincronizará com o banco de dados assim que a internet voltar.");
      } else {
        alert(idEmEdicao ? "Agendamento atualizado com sucesso!" : "Agendamento efetuado!");
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
    if (window.confirm("Tem certeza? O agendamento será excluído do sistema.")) {
      try {
        await deleteDoc(doc(db, 'agendamentos', agenda.id));
        const tokenGoogle = sessionStorage.getItem('googleToken');
        if (tokenGoogle && agenda.googleEventId && navigator.onLine) {
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
          const materiais = dadosServico.materiaisConsumidos || [];

          for (const mat of materiais) {
             const nomeMaterial = mat.nomeMaterial;
             const qtdConsumida = parseFloat(mat.quantidade) || 0;

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
        }

        if (!navigator.onLine) {
          alert("Serviço concluído localmente. O caixa e o estoque serão atualizados quando a conexão retornar.");
        } else {
          alert("Serviço concluído com sucesso! Caixa e Estoque foram atualizados.");
        }
        
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
    fontSize: '16px',
    boxSizing: 'border-box' as const
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', transition: 'all 0.3s' }}>
      
      <h3 style={{ marginTop: 0, color: idEmEdicao ? '#e67e22' : 'var(--text-principal)' }}>
        {idEmEdicao ? '✏️ Editando Agendamento' : '➕ Novo Agendamento'}
      </h3>
      
      <form onSubmit={lidarComAgendamento} style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap', paddingBottom: '20px', borderBottom: '2px dashed var(--borda)' }}>
        <input type="text" placeholder="Nome do Cliente" value={cliente} onChange={e => setCliente(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px' }} />
        <input type="date" value={dataForm} onChange={e => setDataForm(e.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }} />
        
        <select value={horaExibida} onChange={e => setHoraForm(e.target.value)} style={{ ...inputStyle, flex: '1 1 100px' }}>
          {horariosValidos.length === 0 ? (
            <option value="">Dia Fechado/Sem Horários</option>
          ) : (
            horariosValidos.map(h => <option key={h} value={h}>{h}</option>)
          )}
        </select>

        <select value={idServicoSelecionado} onChange={e => setIdServicoSelecionado(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px' }}>
          <option value="">-- Serviço --</option>
          {servicosDisponiveis.map(s => <option key={s.id} value={s.id}>{s.nome} - R$ {s.preco.toFixed(2)}</option>)}
        </select>
        <select value={emailFuncionarioSelecionado} onChange={e => setEmailFuncionarioSelecionado(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px' }}>
          <option value="">-- Profissional --</option>
          {funcionarios.map(f => <option key={f.email} value={f.email}>{f.nome}</option>)}
        </select>
        
        <button type="submit" disabled={horariosValidos.length === 0} style={{ padding: '12px 20px', backgroundColor: horariosValidos.length === 0 ? '#95a5a6' : (idEmEdicao ? '#e67e22' : '#2980b9'), color: 'white', border: 'none', cursor: horariosValidos.length === 0 ? 'not-allowed' : 'pointer', borderRadius: '6px', fontWeight: 'bold' }}>
          {idEmEdicao ? 'Atualizar' : 'Agendar'}
        </button>
        {idEmEdicao && (
          <button type="button" onClick={() => { setIdEmEdicao(null); setCliente(''); }} style={{ padding: '12px 20px', backgroundColor: 'var(--text-secundario)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
        )}
      </form>

      {/* GERADOR DE WHATSAPP */}
      <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '15px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #2ecc71' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h4 style={{ margin: 0, color: '#27ae60', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📱 Gerar Horários para WhatsApp
          </h4>
          <button onClick={() => setModalWppAberto(!modalWppAberto)} style={{ padding: '8px 15px', backgroundColor: modalWppAberto ? 'var(--text-secundario)' : '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {modalWppAberto ? 'Fechar Gerador' : 'Abrir Gerador'}
          </button>
        </div>

        {modalWppAberto && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '12px', display: 'block', color: 'var(--text-secundario)', marginBottom: '5px' }}>Data Início</label>
                <input type="date" value={dataInicioWpp} onChange={e => setDataInicioWpp(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', display: 'block', color: 'var(--text-secundario)', marginBottom: '5px' }}>Data Fim</label>
                <input type="date" value={dataFimWpp} onChange={e => setDataFimWpp(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                 <button onClick={() => {
                   const hoje = dataDeHoje();
                   setDataInicioWpp(hoje);
                   setDataFimWpp(hoje);
                 }} style={{ padding: '12px', backgroundColor: 'var(--bg-input)', color: 'var(--text-principal)', border: '1px solid var(--borda)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                   Somente Hoje
                 </button>
                 <button onClick={gerarTextoWhatsApp} style={{ padding: '12px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                   Gerar Lista
                 </button>
              </div>
            </div>
            
            {textoWpp && (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  <textarea 
                     value={textoWpp} 
                     onChange={e => setTextoWpp(e.target.value)}
                     style={{ width: '100%', height: '180px', padding: '12px', borderRadius: '4px', border: '1px solid var(--borda)', backgroundColor: 'var(--bg-input)', color: 'var(--text-principal)', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                     <button onClick={copiarTexto} style={{ flex: '1 1 200px', padding: '12px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                       📋 Copiar Mensagem
                     </button>
                     <button onClick={abrirWhatsApp} style={{ flex: '1 1 200px', padding: '12px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                       💬 Enviar via WhatsApp
                     </button>
                  </div>
               </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card-destaque)', padding: '15px', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-principal)' }}>🗓️ Planner</h3>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'var(--bg-input)', padding: '5px 15px', borderRadius: '20px', border: '1px solid var(--borda)' }}>
          <button type="button" onClick={() => mudarDia(-1)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-principal)' }}>◀</button>
          
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