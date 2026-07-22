// src/components/ModuloAgenda.tsx

import { useState, useEffect } from 'react';
import { db, auth } from '../config/firebase'; 
import { signOut } from 'firebase/auth'; 
import { collection, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, doc, getDocs, getDoc } from 'firebase/firestore';
import '../App.css';
import { Toaster, toast } from "sonner";

interface ModuloAgendaProps {
  // Ajustado para receber email e nome, necessários para o OneSignal
  perfil: { companyId: string; role: string; nome?: string; email?: string } | null;
}

interface Servico { id: string; nome: string; preco: number; duracaoMinutos: number; materiaisConsumidos?: { nomeMaterial: string, quantidade: string }[]; }
interface Funcionario { email: string; nome: string; }
interface Agendamento {
  id: string; 
  clienteNome: string; 
  servicoId: string; 
  servicoNome: string;
  servicoIds?: string[]; 
  funcionarioEmail?: string; 
  preco: number; 
  dataHora: string; 
  duracaoMinutos: number; 
  status: 'pendente' | 'concluido';
  googleEventId?: string; 
  googleSyncPending?: boolean; 
  transacaoCaixaId?: string; 
  notificado30Min?: boolean;
  bloquearConclusaoAuto?: boolean;
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

// --- FUNÇÃO AUXILIAR DO ONESIGNAL ---
const formatarDataOneSignal = (data: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const offset = -data.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const mins = pad(Math.abs(offset) % 60);
  
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())} ${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())} GMT${sign}${hours}${mins}`;
};

export function ModuloAgenda({ perfil }: ModuloAgendaProps) {
  const [servicosDisponiveis, setServicosDisponiveis] = useState<Servico[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  const [configHorarios, setConfigHorarios] = useState<HorariosFuncionamento | null>(null);
  const [almocoConfig, setAlmocoConfig] = useState<any>(null);
  const [diasBloqueadosConfig, setDiasBloqueadosConfig] = useState<string[]>([]);
  const [mensagemLembreteConfig, setMensagemLembreteConfig] = useState<string>('');
  const [tempoLembreteConfig, setTempoLembreteConfig] = useState<number>(30); // Estado para o tempo do OneSignal/Notificação

  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [idEmEdicao, setIdEmEdicao] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [dataForm, setDataForm] = useState(dataDeHoje());
  const [horaForm, setHoraForm] = useState('08:00');
  
  const [servicoIdsSelecionados, setServicoIdsSelecionados] = useState<string[]>([]);
  const [emailFuncionarioSelecionado, setEmailFuncionarioSelecionado] = useState('');
  
  const [isEncaixeAtivo, setIsEncaixeAtivo] = useState(false);
  const [dataVisaoDiaria, setDataVisaoDiaria] = useState(dataDeHoje());

  const [modalWppAberto, setModalWppAberto] = useState(false);
  const [dataInicioWpp, setDataInicioWpp] = useState(dataDeHoje());
  const [dataFimWpp, setDataFimWpp] = useState(dataDeHoje());
  const [textoWpp, setTextoWpp] = useState('');

  const [agendaLembreteAlvo, setAgendaLembreteAlvo] = useState<Agendamento | null>(null);
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);

  const lidarComTokenExpirado = () => {
    sessionStorage.removeItem('googleToken');
    toast.error("Sua sessão do Google Calendar expirou por segurança. Você será redirecionado para fazer login novamente.");
    signOut(auth); 
  };

  // Solicita permissão de notificação nativa ao carregar o módulo
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Evento global para fechar menus suspensos de 3 pontinhos ao clicar fora
  useEffect(() => {
    const fecharMenus = () => setMenuAbertoId(null);
    window.addEventListener('click', fecharMenus);
    return () => window.removeEventListener('click', fecharMenus);
  }, []);

  useEffect(() => {
    if (!perfil?.companyId) return;

    const unsubServicos = onSnapshot(query(collection(db, 'servicos'), where('companyId', '==', perfil.companyId)), (snapshot) => {
      const lista: Servico[] = [];
      snapshot.forEach(doc => lista.push({ id: doc.id, ...doc.data() } as Servico));
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
      if (docSnap.exists()) {
          const dados = docSnap.data();
          
          if (dados.horariosFuncionamento) {
              setConfigHorarios(dados.horariosFuncionamento);
          } else if (dados.configuracoesGlobais?.horariosFuncionamento) {
              setConfigHorarios(dados.configuracoesGlobais.horariosFuncionamento);
          }
          
          if (dados.horarioAlmoco) {
              setAlmocoConfig(dados.horarioAlmoco);
          } else if (dados.configuracoes?.horarioAlmoco) {
              setAlmocoConfig(dados.configuracoes.horarioAlmoco);
          } else if (dados.configuracoesGlobais?.horarioAlmoco) {
              setAlmocoConfig(dados.configuracoesGlobais.horarioAlmoco);
          }
          
          if (dados.diasBloqueados) setDiasBloqueadosConfig(dados.diasBloqueados);
          if (dados.mensagemLembrete) setMensagemLembreteConfig(dados.mensagemLembrete);
          
          if (dados.minutosAvisoPrevioAgenda !== undefined) {
            setTempoLembreteConfig(dados.minutosAvisoPrevioAgenda);
          } else if (dados.configuracoesGlobais?.minutosAvisoPrevioAgenda !== undefined) {
            setTempoLembreteConfig(dados.configuracoesGlobais.minutosAvisoPrevioAgenda);
          }
      }
    });

    return () => {
      unsubServicos();
      unsubFuncionarios();
      unsubAgendamentos();
      unsubConfig();
    };
  }, [perfil?.companyId]);

  // =========================================================
  // FUNÇÕES DE CONCLUSÃO E REVERSÃO DE CAIXA (CENTRALIZADAS)
  // =========================================================

  async function efetuarConclusao(agenda: Agendamento, isAuto = false) {
    if (agenda.status === 'concluido') return; // Segurança contra duplicação

    try {
      let transacaoId = '';
      if (perfil?.companyId) {
        // 1. Adicionar ao Caixa
        const docRef = await addDoc(collection(db, 'financas'), {
          descricao: `Serviço${isAuto ? ' (Automático)' : ''}: ${agenda.servicoNome} - Cliente: ${agenda.clienteNome}`,
          valor: agenda.preco,
          tipo: 'entrada',
          data: new Date().toISOString(),
          companyId: perfil.companyId,
          origem: 'agenda'
        });
        transacaoId = docRef.id;
        
        // 2. Dar baixa no Estoque
        const idsDosServicos = agenda.servicoIds && agenda.servicoIds.length > 0 ? agenda.servicoIds : [agenda.servicoId];
        
        for (const sId of idsDosServicos) {
          const servicoRef = doc(db, 'servicos', sId);
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
        }
      }

      // 3. Atualizar Status do Agendamento
      await updateDoc(doc(db, 'agendamentos', agenda.id), { 
          status: 'concluido',
          bloquearConclusaoAuto: false, 
          transacaoCaixaId: transacaoId 
      });

      if (!isAuto) toast.success("Serviço concluído com sucesso! Caixa e Estoque atualizados.");

    } catch (erro) {
      if (!isAuto) toast.error("Houve um erro ao tentar concluir o serviço no caixa.");
      console.error("Erro ao concluir serviço:", erro);
    }
  }

  async function efetuarReversao(agenda: Agendamento, silent = false) {
    if (agenda.status !== 'concluido') return;

    try {
        // 1. Remover do Caixa
        if (agenda.transacaoCaixaId && perfil?.companyId) {
            await deleteDoc(doc(db, 'financas', agenda.transacaoCaixaId));
        }

        // 2. Devolver ao Estoque
        const idsDosServicos = agenda.servicoIds && agenda.servicoIds.length > 0 ? agenda.servicoIds : [agenda.servicoId];

        for (const sId of idsDosServicos) {
          const servicoRef = doc(db, 'servicos', sId);
          const servicoSnap = await getDoc(servicoRef);
          
          if (servicoSnap.exists() && perfil?.companyId) {
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
                            quantidade: qtdAtual + qtdConsumida
                        });
                    }
                }
            }
          }
        }

        // 3. Atualizar Status para Pendente
        await updateDoc(doc(db, 'agendamentos', agenda.id), { 
            status: 'pendente',
            bloquearConclusaoAuto: true, 
            transacaoCaixaId: null 
        });

        if (!silent) toast.success("Agendamento revertido! Valor subtraído do Caixa e materiais devolvidos ao estoque.");

    } catch (error) {
        if (!silent) toast.error("Erro ao tentar reverter o agendamento no caixa e estoque.");
        console.error("Erro na reversão:", error);
    }
  }

  // =========================================================
  // VERIFICADOR DE NOTIFICAÇÕES PRÉVIAS E CONCLUSÃO AUTOMÁTICA
  // =========================================================
  useEffect(() => {
    if (agendamentos.length === 0) return;

    const verificarNotificacoesEStatus = () => {
      const agora = new Date();

      agendamentos.forEach(async (ag) => {
        if (ag.status === 'pendente') {
          const inicio = new Date(`${ag.dataHora}:00`);
          const fim = new Date(inicio.getTime() + (ag.duracaoMinutos * 60000));
          
          const minutosAteInicio = (inicio.getTime() - agora.getTime()) / 60000;

          // 1. NOTIFICAÇÃO PRÉVIA AO AGENDAMENTO (Tempo dinâmico)
          if (minutosAteInicio <= tempoLembreteConfig && minutosAteInicio > 0 && !ag.notificado30Min) {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('⏰ Lembrete de Agendamento!', {
                body: `Seu agendamento com ${ag.clienteNome} (${ag.servicoNome}) é às ${ag.dataHora.split('T')[1]} (em ~${Math.round(minutosAteInicio)} min).`,
                tag: ag.id
              });
            }

            try {
              await updateDoc(doc(db, 'agendamentos', ag.id), { 
                notificado30Min: true // Mantido o nome no banco para retrocompatibilidade
              });
            } catch (err) {
              console.error("Erro ao registrar notificação enviada:", err);
            }
          }

          // 2. CONCLUSÃO AUTOMÁTICA
          if (!ag.bloquearConclusaoAuto && agora >= fim) {
            await efetuarConclusao(ag, true);
          }
        }
      });
    };

    verificarNotificacoesEStatus();
    const intervalo = setInterval(verificarNotificacoesEStatus, 30000); 

    return () => clearInterval(intervalo);
  }, [agendamentos, tempoLembreteConfig, perfil?.companyId]); 

  useEffect(() => {
    const tokenGoogle = sessionStorage.getItem('googleToken');
    if (!tokenGoogle || !perfil?.companyId || agendamentos.length === 0) return;

    const executarSincronizacao = async () => {
      if (!navigator.onLine) return;

      const agendamentosPendentes = agendamentos.filter(a => a.googleSyncPending);

      for (const agenda of agendamentosPendentes) {
        try {
          const funcEscolhido = funcionarios.find(f => f.email === agenda.funcionarioEmail);
          const start = new Date(`${agenda.dataHora}:00`);
          const end = new Date(start.getTime() + ((agenda.duracaoMinutos || 30) * 60 * 1000));

          const eventoGoogle = {
            summary: `${agenda.servicoNome} - ${agenda.clienteNome} ${funcEscolhido ? `(Prof: ${funcEscolhido.nome})` : ''}`,
            description: `Serviços: ${agenda.servicoNome}\nDuração: ${agenda.duracaoMinutos} min\nCliente: ${agenda.clienteNome}${funcEscolhido ? `\nProfissional: ${funcEscolhido.nome}` : ''}`,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() }
          };

          if (agenda.googleEventId) {
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${agenda.googleEventId}?sendUpdates=all`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(eventoGoogle)
            });
            if (res.status === 401) { lidarComTokenExpirado(); return; }
            if (res.ok) await updateDoc(doc(db, 'agendamentos', agenda.id), { googleSyncPending: false });
          } else {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(eventoGoogle)
            });
            if (res.status === 401) { lidarComTokenExpirado(); return; }
            if (res.ok) {
              const googleData = await res.json();
              await updateDoc(doc(db, 'agendamentos', agenda.id), {
                googleEventId: googleData.id,
                googleSyncPending: false
              });
            }
          }
        } catch (err) {
          console.error("Falha ao sincronizar item em 2º plano:", err);
          break; 
        }
      }

      const exclusoesPendentes = JSON.parse(localStorage.getItem('googleDeletionsPending') || '[]');
      if (exclusoesPendentes.length > 0) {
        const restantes: string[] = [];
        for (const eventId of exclusoesPendentes) {
          try {
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${tokenGoogle}` }
            });
            if (res.status === 401) { lidarComTokenExpirado(); return; }
            if (!res.ok && res.status !== 404) restantes.push(eventId);
          } catch (err) {
            restantes.push(eventId);
          }
        }
        localStorage.setItem('googleDeletionsPending', JSON.stringify(restantes));
      }
    };

    executarSincronizacao();
    window.addEventListener('online', executarSincronizacao);
    
    const intervaloSincronismo = setInterval(() => {
      executarSincronizacao();
    }, 15000);

    return () => {
      window.removeEventListener('online', executarSincronizacao);
      clearInterval(intervaloSincronismo);
    };
  }, [agendamentos, perfil?.companyId, funcionarios]);

 // =========================================================
  // ONESIGNAL: AGENDAR PUSH NOTIFICATION
  // =========================================================
  const agendarNotificacaoPush = async (dataHorarioAtendimento: Date, tempoLembreteMinutos: number, nomeCliente: string) => {
    if (!perfil?.email) {
      console.warn("⚠️ Nenhum e-mail de perfil encontrado para agendar a notificação.");
      return;
    }
    
    const dataNotificacao = new Date(dataHorarioAtendimento.getTime() - (tempoLembreteMinutos * 60000));
    
    if (dataNotificacao.getTime() < new Date().getTime()) {
      console.log("Horário de lembrete já passou, notificação não será agendada.");
      return;
    }

    const sendAfterFormatado = formatarDataOneSignal(dataNotificacao);

    // DADOS DO ONESIGNAL
    const ONESIGNAL_APP_ID = "a05664b1-082c-49e7-8348-56f901293513";
    const ONESIGNAL_REST_API_KEY = "os_v2_app_ublgjmiifre6pa2ik34qckjvcnqid2ebfajulu4tyzbsfrh3ufcyazeu4yleaqx4chw4pkntjansh6amhgflaoorw4f2yiboe2cn6ji"; 

    const body = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [perfil?.email] },
      target_channel: "push",
      headings: { en: "Lembrete de Atendimento", pt: "Lembrete de Atendimento" },
      contents: { 
        en: `Você tem um atendimento com ${nomeCliente} em ${tempoLembreteMinutos} minutos!`,
        pt: `Você tem um atendimento com ${nomeCliente} em ${tempoLembreteMinutos} minutos!`
      },
      send_after: sendAfterFormatado 
    };

    try {
      const response = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify(body)
      });
      
      const responseData = await response.json();
      
      if (response.ok) {
        console.log("✅ Push agendado no OneSignal para:", sendAfterFormatado, responseData);
      } else {
        console.error("❌ Falha na API do OneSignal:", responseData);
      }
    } catch (error) {
      console.error("❌ Erro ao agendar Push no OneSignal", error);
    }
  };

  const obterHorariosDisponiveis = () => {
    const todosHorarios = gerarHorarios();
    if (!dataForm || !configHorarios) return todosHorarios;

    if (diasBloqueadosConfig.includes(dataForm)) return []; 

    const [ano, mes, dia] = dataForm.split('-').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    const diaKey = diasDaSemanaKeys[dataObj.getDay()];
    const configDoDia = configHorarios[diaKey];

    if (!configDoDia || !configDoDia.ativo) return [];

    const duracaoAtual = servicosDisponiveis
      .filter(s => servicoIdsSelecionados.includes(s.id))
      .reduce((soma, s) => soma + s.duracaoMinutos, 0) || 30;

    const agendamentosDoDia = agendamentos.filter(a =>
      a.dataHora.startsWith(dataForm) && a.id !== idEmEdicao && a.status === 'pendente'
    );

    const [hInicioConfig, mInicioConfig] = configDoDia.inicio.split(':').map(Number);
    const inicioExpediente = hInicioConfig * 60 + mInicioConfig;

    const [hFimConfig, mFimConfig] = configDoDia.fim.split(':').map(Number);
    const fimExpediente = hFimConfig * 60 + mFimConfig;

    const eHoje = dataForm === dataDeHoje();
    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    return todosHorarios.filter(horario => {
      const [h, m] = horario.split(':').map(Number);
      const inicioDesejado = h * 60 + m; 
      const fimDesejado = inicioDesejado + duracaoAtual;

      if (inicioDesejado < inicioExpediente || fimDesejado > fimExpediente) return false;

      if (eHoje && inicioDesejado <= minutosAtuais) return false;

      const temConfigDeAlmoco = almocoConfig && almocoConfig.inicio && almocoConfig.fim;
      const almocoNaoFoiDesativado = almocoConfig?.ativo !== false && String(almocoConfig?.ativo) !== 'false';
      
      if (temConfigDeAlmoco && almocoNaoFoiDesativado) {
          const [hA, mA] = String(almocoConfig.inicio).split(':').map(Number);
          const iniAlmoco = (hA * 60 + mA) + 1;
          const [hAF, mAF] = String(almocoConfig.fim).split(':').map(Number);
          const fimAlmoco = (hAF * 60 + mAF) - 1;
          
          if (inicioDesejado < fimAlmoco && fimDesejado > iniAlmoco) return false;
      }

      const temConflito = agendamentosDoDia.some(agendamento => {
          const [hAg, mAg] = agendamento.dataHora.split('T')[1].split(':').map(Number);
          const inicioOcupado = hAg * 60 + mAg;
          const duracaoOcupada = agendamento.duracaoMinutos || 30;
          const fimOcupado = inicioOcupado + duracaoOcupada;

          const conflitoTempo = inicioDesejado < fimOcupado && fimDesejado > inicioOcupado;
          const mesmoProfissional = !emailFuncionarioSelecionado || !agendamento.funcionarioEmail || emailFuncionarioSelecionado === agendamento.funcionarioEmail;

          return conflitoTempo && mesmoProfissional;
      });

      return !temConflito;
    });
  };

  const horariosValidos = obterHorariosDisponiveis();

  const obterHorariosEncaixe = () => {
    const todos = gerarHorarios();
    if (dataForm !== dataDeHoje()) return todos;

    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    return todos.filter(horario => {
      const [h, m] = horario.split(':').map(Number);
      return (h * 60 + m) > minutosAtuais;
    });
  };

  const horariosEncaixe = obterHorariosEncaixe();

  useEffect(() => {
    if (idEmEdicao) return; 

    const opcoesDisponiveis = isEncaixeAtivo ? horariosEncaixe : horariosValidos;
    if (opcoesDisponiveis.length > 0 && !opcoesDisponiveis.includes(horaForm)) {
      setHoraForm(opcoesDisponiveis[0]);
    }
  }, [dataForm, servicoIdsSelecionados, emailFuncionarioSelecionado, isEncaixeAtivo, agendamentos, idEmEdicao]);

  const montarTextoLembretePersonalizado = (agenda: Agendamento) => {
    const templatePadrao = `*Lembrete de Agendamento*\n\nOlá, *{primeiroNome}*! Tudo bem? \nPassando aqui para confirmar o seu horário conosco.\n\n*Data:* {data}\n*Horário:* {hora}\n*Serviço:* {servico}\n*Profissional:* {profissional}\n\nSe precisar remarcar, por favor, nos avise com antecedência.\nAté logo!`;
    const textoBase = mensagemLembreteConfig || templatePadrao;

    const primeiroNome = agenda.clienteNome.split(' ')[0];
    const [ano, mes, dia] = agenda.dataHora.split('T')[0].split('-');
    const dataFormatada = `${dia}/${mes}/${ano}`;
    const horaFormatada = agenda.dataHora.split('T')[1];
    const profesionalObj = agenda.funcionarioEmail ? funcionarios.find(f => f.email === agenda.funcionarioEmail) : null;
    const nomeProfissional = profesionalObj ? profesionalObj.nome : 'Não especificado';

    return textoBase
      .replace(/{primeiroNome}/g, primeiroNome)
      .replace(/{data}/g, dataFormatada)
      .replace(/{hora}/g, horaFormatada)
      .replace(/{servico}/g, agenda.servicoNome)
      .replace(/{profissional}/g, nomeProfissional);
  };

  const executarCopiarLembrete = (agenda: Agendamento) => {
    const texto = montarTextoLembretePersonalizado(agenda);
    navigator.clipboard.writeText(texto);
    toast.success("Mensagem de lembrete copiada com sucesso!");
    setAgendaLembreteAlvo(null);
  };

  const executarEnviarLembreteWhatsApp = (agenda: Agendamento) => {
    const texto = montarTextoLembretePersonalizado(agenda);
    const link = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
    window.open(link, '_blank');
    setAgendaLembreteAlvo(null);
  };

  const obterHorariosLivresParaWpp = (dataStr: string) => {
    if (!configHorarios || diasBloqueadosConfig.includes(dataStr)) return [];
    
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

    const eHoje = dataStr === dataDeHoje();
    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    return todosHorarios.filter(horario => {
        const [h, m] = horario.split(':').map(Number);
        const minutosAtual = h * 60 + m;
        
        if (minutosAtual < inicioExpediente || minutosAtual >= fimExpediente) return false;

        if (eHoje && minutosAtual <= minutosAtuais) return false;

        const temConfigDeAlmoco = almocoConfig && almocoConfig.inicio && almocoConfig.fim;
        const almocoNaoFoiDesativado = almocoConfig?.ativo !== false && String(almocoConfig?.ativo) !== 'false';

        if (temConfigDeAlmoco && almocoNaoFoiDesativado) {
          const [hA, mA] = String(almocoConfig.inicio).split(':').map(Number);
          const iniAlmoco = (hA * 60 + mA) + 1; 
          const [hAF, mAF] = String(almocoConfig.fim).split(':').map(Number);
          const fimAlmoco = (hAF * 60 + mAF) - 1; 
          
          if (minutosAtual < fimAlmoco && (minutosAtual + 30) > iniAlmoco) return false;
        }

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
        toast.error("A data de início não pode ser maior que a data final.");
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
          textoFinal += horariosLivres.map(h => `•${h}`).join('\n') + '\n\n';
        }
        
        dataAtual.setDate(dataAtual.getDate() + 1);
    }
    
    if (textoFinal === "Olá! Aqui estão nossos horários disponíveis:\n\n") {
        textoFinal = "Não há horários disponíveis no período selecionado ou a empresa está fechada nesses dias.";
    }

    setTextoWpp(textoFinal);
  };

  const copiarTexto = () => {
      setModalWppAberto(!modalWppAberto);
      navigator.clipboard.writeText(textoWpp);
      toast.success("Mensagem copiada para a área de transferência!");
  };

  const abrirWhatsApp = () => {
      setModalWppAberto(!modalWppAberto);
      if (!textoWpp) return;
      const textoEncoded = encodeURIComponent(textoWpp);
      window.open(`https://wa.me/?text=${textoEncoded}`, '_blank');
  };

  async function lidarComAgendamento(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !dataForm || !horaForm || servicoIdsSelecionados.length === 0 || !perfil?.companyId) {
      toast.error("Preencha todos os campos obrigatórios (incluindo pelo menos um serviço)!");
      return;
    }

    const isEncaixe = !horariosValidos.includes(horaForm);
    if (isEncaixe) {
        const confirmar = window.confirm("⚠️ Atenção: Este horário está fora do seu expediente, em horário de almoço ou já possui outro agendamento neste mesmo período.\n\nDeseja realizar este agendamento forçado como um ENCAIXE?");
        if (!confirmar) return; 
    }

    const listaServicosEscolhidos = servicosDisponiveis.filter(s => servicoIdsSelecionados.includes(s.id));
    const totalPreco = listaServicosEscolhidos.reduce((soma, s) => soma + s.preco, 0);
    const totalDuracao = listaServicosEscolhidos.reduce((soma, s) => soma + s.duracaoMinutos, 0);
    const nomesDosServicos = listaServicosEscolhidos.map(s => s.nome).join(', ');

    const funcEscolhido = funcionarios.find(f => f.email === emailFuncionarioSelecionado);
    const dataHoraIso = `${dataForm}T${horaForm}`;
    const dataHoraAtendimento = new Date(`${dataHoraIso}:00`);

    const tokenGoogle = sessionStorage.getItem('googleToken');
    const start = new Date(`${dataHoraIso}:00`);
    const end = new Date(start.getTime() + (totalDuracao * 60 * 1000));
    
    const eventoGoogle = {
      summary: `${nomesDosServicos} - ${cliente} ${funcEscolhido ? `(Prof: ${funcEscolhido.nome})` : ''}`,
      description: `Serviços: ${nomesDosServicos}\nDuração Total: ${totalDuracao} min\nCliente: ${cliente}${funcEscolhido ? `\nProfissional: ${funcEscolhido.nome}` : ''}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    };

    let googleEventIdSalvar = null;
    let googleSyncPending = false;

    if (idEmEdicao) {
      const agendaAntiga = agendamentos.find(a => a.id === idEmEdicao);
      googleEventIdSalvar = agendaAntiga?.googleEventId || null;

      if (tokenGoogle && googleEventIdSalvar) {
        if (navigator.onLine) {
          try {
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventIdSalvar}?sendUpdates=all`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(eventoGoogle)
            });
            
            if (res.status === 401) { lidarComTokenExpirado(); return; }
            if (!res.ok) googleSyncPending = true;
          } catch (err) {
            googleSyncPending = true;
          }
        } else {
          googleSyncPending = true;
        }
      } else if (!tokenGoogle) {
        googleSyncPending = true; 
      }

      try {
        await updateDoc(doc(db, 'agendamentos', idEmEdicao), {
            clienteNome: cliente, dataHora: dataHoraIso, 
            servicoId: servicoIdsSelecionados[0], 
            servicoNome: nomesDosServicos,
            servicoIds: servicoIdsSelecionados,
            funcionarioEmail: emailFuncionarioSelecionado || null,
            preco: totalPreco, duracaoMinutos: totalDuracao,
            googleSyncPending: googleSyncPending
        });
        
        toast.success("Agendamento atualizado com sucesso!");
        
        await agendarNotificacaoPush(dataHoraAtendimento, tempoLembreteConfig, cliente);
        
      } catch (err) {
        toast.error("Erro ao salvar no banco local.");
      }
      
    } else {
      if (tokenGoogle) {
        if (navigator.onLine) {
          try {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${tokenGoogle}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(eventoGoogle)
            });

            if (res.status === 401) { lidarComTokenExpirado(); return; }
            if (res.ok) {
              const googleData = await res.json();
              googleEventIdSalvar = googleData.id;
            } else {
              googleSyncPending = true;
            }
          } catch (err) {
            googleSyncPending = true;
          }
        } else {
          googleSyncPending = true;
        }
      } else {
          googleSyncPending = true; 
      }

      try {
        await addDoc(collection(db, 'agendamentos'), {
            clienteNome: cliente, dataHora: dataHoraIso, 
            servicoId: servicoIdsSelecionados[0], 
            servicoNome: nomesDosServicos,
            servicoIds: servicoIdsSelecionados,
            funcionarioEmail: emailFuncionarioSelecionado || null,
            preco: totalPreco, duracaoMinutos: totalDuracao,
            companyId: perfil?.companyId, status: 'pendente',
            googleEventId: googleEventIdSalvar,
            googleSyncPending: googleSyncPending
        });
        
        toast.success("Agendamento efetuado!");
        
        await agendarNotificacaoPush(dataHoraAtendimento, tempoLembreteConfig, cliente);
        
      } catch (err) {
        toast.error("Erro ao salvar o agendamento localmente.");
      }
    }

    setCliente(''); setServicoIdsSelecionados([]); setEmailFuncionarioSelecionado(''); setIdEmEdicao(null); setIsEncaixeAtivo(false);
    setDataVisaoDiaria(dataForm); 
    setMostrarFormulario(false);
  }

  function prepararEdicao(agenda: Agendamento) {
    setIdEmEdicao(agenda.id);
    setCliente(agenda.clienteNome);
    setDataForm(agenda.dataHora.split('T')[0]);
    setHoraForm(agenda.dataHora.split('T')[1]);
    
    setServicoIdsSelecionados(agenda.servicoIds || (agenda.servicoId ? [agenda.servicoId] : []));
    setEmailFuncionarioSelecionado(agenda.funcionarioEmail || '');
    setMostrarFormulario(true); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setIdEmEdicao(null); 
    setCliente(''); 
    setServicoIdsSelecionados([]); 
    setIsEncaixeAtivo(false);
    setMostrarFormulario(false);
  }

  async function excluirAgendamento(agenda: Agendamento) {
    if (window.confirm("Tem certeza? O agendamento será excluído do sistema.")) {
      const toastId = toast.loading("Excluindo agendamento...");
      try {
        
        // Se estava concluído, primeiro reverte do caixa e do estoque silenciosamente.
        if (agenda.status === 'concluido') {
            await efetuarReversao(agenda, true);
        }

        await deleteDoc(doc(db, 'agendamentos', agenda.id));
        toast.dismiss(toastId);
        
        const tokenGoogle = sessionStorage.getItem('googleToken');
        if (tokenGoogle && agenda.googleEventId) {
          if (navigator.onLine) {
            try {
              const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${agenda.googleEventId}?sendUpdates=all`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${tokenGoogle}` }
              });
              
              if (res.status === 401) { lidarComTokenExpirado(); }
            } catch (err) {
              armazenarExclusaoPendente(agenda.googleEventId);
            }
          } else {
            armazenarExclusaoPendente(agenda.googleEventId);
          }
        }
        toast.success("Agendamento removido.");
      } catch(e) {
        toast.dismiss(toastId);
        toast.error("Erro ao excluir agendamento.");
      }
    }
  }

  function armazenarExclusaoPendente(eventId: string) {
    const pendentes = JSON.parse(localStorage.getItem('googleDeletionsPending') || '[]');
    if (!pendentes.includes(eventId)) {
      pendentes.push(eventId);
      localStorage.setItem('googleDeletionsPending', JSON.stringify(pendentes));
    }
  }

  async function marcarComoConcluido(agenda: Agendamento) {
    await efetuarConclusao(agenda, false);
  }

  async function reverterConclusao(agenda: Agendamento) {
      const confirmar = window.confirm(`Deseja REVERTER o serviço de ${agenda.clienteNome}? O valor sairá do Caixa e os materiais voltarão ao Estoque.`);
      if (!confirmar) return;
      await efetuarReversao(agenda, false);
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

  const handleToggleServicoCheckbox = (id: string) => {
    if (servicoIdsSelecionados.includes(id)) {
      setServicoIdsSelecionados(servicoIdsSelecionados.filter(sid => sid !== id));
    } else {
      setServicoIdsSelecionados([...servicoIdsSelecionados, id]);
    }
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

  const itemMenuEstilo = {
    padding: '10px 15px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--borda)',
    color: 'var(--text-principal)',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%'
  };

  return (
    <div style={{ position: 'relative', background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', transition: 'all 0.3s', minHeight: '80vh' }}>
      <Toaster richColors position="top-center" />
      
      {mostrarFormulario ? (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
            <button onClick={cancelarEdicao} style={{ background: 'transparent', border: '1px solid var(--borda)', color: 'var(--text-principal)', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              ⬅ Voltar
            </button>
            <h3 style={{ margin: 0, color: idEmEdicao ? '#e67e22' : 'var(--text-principal)' }}>
              {idEmEdicao ? '✏️ Editando Agendamento' : '➕ Novo Agendamento'}
            </h3>
          </div>
          
          <form onSubmit={lidarComAgendamento} style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap', paddingBottom: '20px', borderBottom: '2px dashed var(--borda)' }}>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: '1 1 100%' }}>
                <input type="text" placeholder="Nome do Cliente" value={cliente} onChange={e => setCliente(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px' }} />
                <input type="date" value={dataForm} onChange={e => setDataForm(e.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }} />
                
                <select value={horaForm} onChange={e => setHoraForm(e.target.value)} style={{ ...inputStyle, flex: '1 1 120px' }}>
                  {(isEncaixeAtivo ? horariosEncaixe : horariosValidos).map(h => {
                      const disponivel = horariosValidos.includes(h);
                      return (
                        <option key={h} value={h}>
                          {h} {isEncaixeAtivo && !disponivel ? '(Encaixe/Ocupado)' : ''}
                        </option>
                      )
                  })}
                </select>

                <select value={emailFuncionarioSelecionado} onChange={e => setEmailFuncionarioSelecionado(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px' }}>
                  <option value="">-- Profissional --</option>
                  {funcionarios.map(f => <option key={f.email} value={f.email}>{f.nome}</option>)}
                </select>
            </div>

            <div style={{ flex: '1 1 100%', backgroundColor: 'var(--bg-card-item)', padding: '15px', borderRadius: '6px', border: '1px solid var(--borda)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-principal)' }}>📌 Escolha os Serviços (Selecione um ou mais):</span>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {servicosDisponiveis.map(s => {
                  const estaSelecionado = servicoIdsSelecionados.includes(s.id);
                  return (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: estaSelecionado ? 'rgba(41, 128, 185, 0.15)' : 'var(--bg-input)', padding: '8px 12px', borderRadius: '6px', border: estaSelecionado ? '1px solid #2980b9' : '1px solid var(--borda)', transition: 'all 0.2s', userSelect: 'none' }}>
                      <input 
                        type="checkbox" 
                        checked={estaSelecionado} 
                        onChange={() => handleToggleServicoCheckbox(s.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '14px' }}>
                        {s.nome} (<span style={{ color: '#27ae60', fontWeight: 'bold' }}>R$ {s.preco.toFixed(2)}</span> • 🕒 {s.duracaoMinutos}m)
                      </span>
                    </label>
                  );
                })}
              </div>

              {servicoIdsSelecionados.length > 0 && (
                <div style={{ display: 'flex', gap: '15px', fontSize: '13px', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #2980b9', fontWeight: 'bold', color: 'var(--text-principal)' }}>
                  <span>⏱️ Duração Total: {servicosDisponiveis.filter(s => servicoIdsSelecionados.includes(s.id)).reduce((acc, s) => acc + s.duracaoMinutos, 0)} minutos</span>
                  <span>💰 Valor Total: R$ {servicosDisponiveis.filter(s => servicoIdsSelecionados.includes(s.id)).reduce((acc, s) => acc + s.preco, 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 100%', marginBottom: '10px' }}>
              <input 
                type="checkbox" 
                id="checkboxEncaixe" 
                checked={isEncaixeAtivo} 
                onChange={e => setIsEncaixeAtivo(e.target.checked)} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="checkboxEncaixe" style={{ cursor: 'pointer', color: 'var(--text-principal)', fontSize: '14px', fontWeight: 'bold' }}>
                Liberar todos os horários (Permitir Encaixe / Forçar agendamento)
              </label>
            </div>
            
            <button type="submit" style={{ padding: '12px 20px', backgroundColor: idEmEdicao ? '#e67e22' : '#2980b9', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' }}>
              {idEmEdicao ? 'Atualizar Agendamento' : 'Salvar Agendamento'}
            </button>
            {idEmEdicao && (
              <button type="button" onClick={cancelarEdicao} style={{ padding: '12px 20px', backgroundColor: 'var(--text-secundario)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
            )}
          </form>
        </div>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
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
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secundario)' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '10px' }}>📭</span>
              Nenhum agendamento para este dia.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '80px' }}>
              {agendamentosDoDia.map(agenda => {
                return (
                  <div key={agenda.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid var(--borda)', borderRadius: '8px', borderLeft: agenda.status === 'concluido' ? '5px solid #2ecc71' : '5px solid #f39c12', backgroundColor: 'var(--bg-card-item)', position: 'relative' }}>
                    <div>
                      <h4 style={{ margin: '0 0 5px 0', color: 'var(--text-principal)', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {agenda.dataHora.split('T')[1]} - {agenda.clienteNome.split(' ')[0] + ' ' + agenda.clienteNome.split(' ')[1]}
                        {agenda.googleSyncPending && <span style={{ fontSize: '12px', color: '#e67e22', fontStyle: 'italic', fontWeight: 'normal' }}>(Aguardando...)</span>}
                        {agenda.status === 'concluido' && <span style={{ fontSize: '12px', color: '#27ae60', fontWeight: 'bold' }}>(Atendido)</span>}
                      </h4>
                      <span style={{ fontSize: '14px', color: 'var(--text-secundario)', display: 'block', marginBottom: '3px' }}>
                        {agenda.servicoNome}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secundario)' }}>
                        Prof: {agenda.funcionarioEmail ? (funcionarios.find(f => f.email === agenda.funcionarioEmail)?.nome || 'Não definido') : 'Não definido'}
                      </span>
                    </div>

                    <div style={{ position: 'relative', marginTop: '10px' }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuAbertoId(menuAbertoId === agenda.id ? null : agenda.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--borda)',
                          borderRadius: '6px',
                          color: 'var(--text-principal)',
                          padding: '6px 12px',
                          fontSize: '20px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          lineHeight: '1'
                        }}
                        title="Opções do agendamento"
                      >
                        ⋮
                      </button>

                      {menuAbertoId === agenda.id && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            marginTop: '5px',
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--borda)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                            zIndex: 100,
                            minWidth: '170px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                          }}
                        >
                          {agenda.status === 'pendente' ? (
                            <>
                              <label style={{backgroundColor: 'darkgray', padding: '5px 15px', color: 'black'}} htmlFor="lembrete">{agenda.clienteNome}</label>
                              <button 
                                onClick={() => { setMenuAbertoId(null); setAgendaLembreteAlvo(agenda); }}
                                style={itemMenuEstilo}
                              >
                                💬 Avisar
                              </button>
                              <button 
                                onClick={() => { setMenuAbertoId(null); marcarComoConcluido(agenda); }}
                                style={itemMenuEstilo}
                              >
                                ✅ Concluir
                              </button>
                              <button 
                                onClick={() => { setMenuAbertoId(null); prepararEdicao(agenda); }}
                                style={itemMenuEstilo}
                              >
                                ✏️ Editar
                              </button>
                              <button 
                                onClick={() => { setMenuAbertoId(null); excluirAgendamento(agenda); }}
                                style={{ ...itemMenuEstilo, color: '#e74c3c', borderBottom: 'none' }}
                              >
                                🗑️ Excluir
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                onClick={() => { setMenuAbertoId(null); reverterConclusao(agenda); }}
                                style={itemMenuEstilo}
                              >
                                🔄 Reverter
                              </button>
                              <button 
                                onClick={() => { setMenuAbertoId(null); excluirAgendamento(agenda); }}
                                style={{ ...itemMenuEstilo, color: '#e74c3c', borderBottom: 'none' }}
                              >
                                🗑️ Excluir
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          <button 
            onClick={() => setMostrarFormulario(true)}
            style={{
              position: 'fixed',
              bottom: '30px',
              right: '30px',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#2980b9',
              color: 'white',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '35px',
              fontWeight: 'bold',
              border: 'none',
              boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              zIndex: 1000,
              transition: 'transform 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            title="Novo Agendamento"
          >
            +
          </button>
        </div>
      )}

      {agendaLembreteAlvo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda)', color: 'var(--text-principal)', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
            <h4 style={{ marginTop: 0, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>💬 Lembrete para {agendaLembreteAlvo.clienteNome}</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secundario)', marginBottom: '15px' }}>Pré-visualização da mensagem estruturada com o seu template:</p>
            
            <pre style={{ backgroundColor: 'var(--bg-input)', padding: '12px', borderRadius: '6px', border: '1px solid var(--borda)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', margin: '0 0 20px 0', maxHeight: '200px', overflowY: 'auto' }}>
              {montarTextoLembretePersonalizado(agendaLembreteAlvo)}
            </pre>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => executarCopiarLembrete(agendaLembreteAlvo)}
                style={{ flex: '1 1 130px', padding: '12px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                📋 Copiar Mensagem
              </button>
              <button 
                onClick={() => executarEnviarLembreteWhatsApp(agendaLembreteAlvo)}
                style={{ flex: '1 1 130px', padding: '12px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🚀 Enviar WhatsApp
              </button>
            </div>
            
            <button 
              onClick={() => setAgendaLembreteAlvo(null)}
              style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', color: 'var(--text-secundario)', border: 'none', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
            >
              Cancelar e Fechar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}