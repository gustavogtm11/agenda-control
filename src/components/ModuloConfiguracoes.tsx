// src/components/ModuloConfiguracoes.tsx

import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '../App';

// ==========================================
// FUNÇÕES UTILITÁRIAS
// ==========================================

const converterParaMinutos = (horarioStr: string): number => {
  const [horas, minutos] = horarioStr.split(':').map(Number);
  return horas * 60 + minutos;
};

interface HorarioAlmoco { 
  ativo: boolean; 
  inicio: string; 
  fim: string; 
}

export const verificarInvasaoAlmoco = (inicioServico: string, fimServico: string, almoco: HorarioAlmoco): boolean => {
  if (!almoco.ativo) return false;

  const inicioAgendamento = converterParaMinutos(inicioServico);
  const fimAgendamento = converterParaMinutos(fimServico);
  const inicioAlmocoLogico = converterParaMinutos(almoco.inicio) + 1;
  const fimAlmocoLogico = converterParaMinutos(almoco.fim) - 1;

  return inicioAgendamento < fimAlmocoLogico && fimAgendamento > inicioAlmocoLogico;
};

interface ModuloConfiguracoesProps {
  perfil: { companyId: string } | null;
}

type DiaSemana = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
interface HorarioDia { ativo: boolean; inicio: string; fim: string; }
type HorariosFuncionamento = Record<DiaSemana, HorarioDia>;

const diasDaSemana: { key: DiaSemana; label: string }[] = [
  { key: 'segunda', label: 'Segunda-feira' }, { key: 'terca', label: 'Terça-feira' },
  { key: 'quarta', label: 'Quarta-feira' }, { key: 'quinta', label: 'Quinta-feira' },
  { key: 'sexta', label: 'Sexta-feira' }, { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

const horariosPadrao: HorariosFuncionamento = {
  domingo: { ativo: false, inicio: '08:00', fim: '12:00' },
  segunda: { ativo: true, inicio: '08:00', fim: '17:00' },
  terca: { ativo: true, inicio: '08:00', fim: '17:00' },
  quarta: { ativo: true, inicio: '08:00', fim: '17:00' },
  quinta: { ativo: true, inicio: '08:00', fim: '17:00' },
  sexta: { ativo: true, inicio: '08:00', fim: '17:00' },
  sabado: { ativo: true, inicio: '08:00', fim: '12:00' },
};

const mensagemPadrao = `*Lembrete de Agendamento*\n\nOlá, *{primeiroNome}*! Tudo bem? \nPassando aqui para confirmar o seu horário conosco.\n\n*Data:* {data}\n*Horário:* {hora}\n*Serviço:* {servico}\n*Profissional:* {profissional}\n\nSe precisar remarcar, por favor, nos avise com antecedência.\nAté logo!`;

export function ModuloConfiguracoes({ perfil }: ModuloConfiguracoesProps) {
  const [abaAtiva, setAbaAtiva] = useState<'expediente' | 'bloqueios' | 'mensagens' | 'notificacoes'>('expediente');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const { showToast } = useToast();

  const [horarios, setHorarios] = useState<HorariosFuncionamento>(horariosPadrao);
  const [almoco, setAlmoco] = useState<HorarioAlmoco>({ ativo: true, inicio: '12:00', fim: '13:00' });
  const [diasBloqueados, setDiasBloqueados] = useState<string[]>([]);
  const [novoDiaBloqueado, setNovoDiaBloqueado] = useState('');
  const [mensagemLembrete, setMensagemLembrete] = useState(mensagemPadrao);
  
  // CORREÇÃO: Verificação segura para evitar crash em dispositivos sem suporte a notificações
  const [permissaoNotificacao, setPermissaoNotificacao] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );
  
  const [notificacaoAgendaAtiva, setNotificacaoAgendaAtiva] = useState(true);
  const [minutosAvisoPrevioAgenda, setMinutosAvisoPrevioAgenda] = useState<number>(30); 
  const [notificacaoCaixaAtiva, setNotificacaoCaixaAtiva] = useState(true);
  const [horarioFechamentoCaixa, setHorarioFechamentoCaixa] = useState('18:00');
  const [notificacaoDividasAtiva, setNotificacaoDividasAtiva] = useState(true);
  const [qtdLembretesDivida, setQtdLembretesDivida] = useState(1);
  const [horariosLembreteDivida, setHorariosLembreteDivida] = useState<string[]>(['08:00']);
  
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!perfil) return;
    const companyId = perfil.companyId;

    async function carregarConfiguracoes() {
      try {
        const empresaRef = doc(db, "empresas", companyId);
        const empresaSnap = await getDoc(empresaRef);

        if (empresaSnap.exists() && empresaSnap.data().configuracoesGlobais) {
          const dados = empresaSnap.data().configuracoesGlobais;
          if (dados.horariosFuncionamento) setHorarios(dados.horariosFuncionamento);
          if (dados.horarioAlmoco) setAlmoco(dados.horarioAlmoco);
          if (dados.diasBloqueados) setDiasBloqueados(dados.diasBloqueados);
          if (dados.mensagemLembrete) setMensagemLembrete(dados.mensagemLembrete);
          if (dados.notificacaoAgendaAtiva !== undefined) setNotificacaoAgendaAtiva(dados.notificacaoAgendaAtiva);
          if (dados.minutosAvisoPrevioAgenda !== undefined) setMinutosAvisoPrevioAgenda(dados.minutosAvisoPrevioAgenda);
          if (dados.notificacaoCaixaAtiva !== undefined) setNotificacaoCaixaAtiva(dados.notificacaoCaixaAtiva);
          if (dados.horarioFechamentoCaixa) setHorarioFechamentoCaixa(dados.horarioFechamentoCaixa);
          if (dados.notificacaoDividasAtiva !== undefined) setNotificacaoDividasAtiva(dados.notificacaoDividasAtiva);
          if (dados.qtdLembretesDivida !== undefined) setQtdLembretesDivida(dados.qtdLembretesDivida);
          if (dados.horariosLembreteDivida) setHorariosLembreteDivida(dados.horariosLembreteDivida);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
      }
    }
    carregarConfiguracoes();
  }, [perfil?.companyId]);

  const solicitarPermissaoNotificacao = async () => {
    if (!("Notification" in window)) {
      showToast("Este navegador não suporta notificações de desktop/mobile.", 'error');
      return;
    }
    const permissao = await Notification.requestPermission();
    setPermissaoNotificacao(permissao);
    if (permissao === 'granted') {
        new Notification("Tudo certo!", { body: "As notificações do sistema estão ativadas." });
        showToast("Notificações ativadas com sucesso!", 'success');
    } else if (permissao === 'denied') {
        showToast("Você bloqueou as notificações. Para ativar, altere as permissões do navegador.", 'error');
    }
  };

  const handleChange = (dia: DiaSemana, campo: keyof HorarioDia, valor: any) => {
    setHorarios(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor } }));
  };

  const copiarParaTodos = (diaAtual: DiaSemana) => {
    const { inicio, fim } = horarios[diaAtual];
    const novosHorarios = { ...horarios };
    diasDaSemana.forEach(d => {
        if (d.key !== diaAtual) novosHorarios[d.key] = { ...novosHorarios[d.key], inicio, fim };
    });
    setHorarios(novosHorarios);
    showToast('Horário copiado para todos os dias da semana!', 'success');
  };

  const adicionarDiaBloqueado = () => {
    if (!novoDiaBloqueado) return;
    if (diasBloqueados.includes(novoDiaBloqueado)) { 
      showToast("Este dia já está bloqueado.", 'info'); 
      return; 
    }
    setDiasBloqueados([...diasBloqueados, novoDiaBloqueado].sort());
    setNovoDiaBloqueado('');
  };

  const removerDiaBloqueado = (diaRemover: string) => {
    setDiasBloqueados(diasBloqueados.filter(d => d !== diaRemover));
  };

  const handleQtdLembretesChange = (novaQtd: number) => {
    setQtdLembretesDivida(novaQtd);
    const novosHorarios = [...horariosLembreteDivida];
    while (novosHorarios.length < novaQtd) {
        novosHorarios.push('12:00'); 
    }
    setHorariosLembreteDivida(novosHorarios.slice(0, novaQtd));
  };

  const atualizarHorarioDivida = (index: number, valor: string) => {
    const novos = [...horariosLembreteDivida];
    novos[index] = valor;
    setHorariosLembreteDivida(novos);
  };

  async function salvarConfiguracoes(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil) {
        showToast("Não foi possível identificar sua empresa. Faça login novamente.", "error");
        return;
    }
    setSalvando(true);
    try {
        const dadosConfig = {
            horariosFuncionamento: horarios,
            horarioAlmoco: almoco,
            diasBloqueados,
            mensagemLembrete,
            notificacaoAgendaAtiva,
            minutosAvisoPrevioAgenda,
            notificacaoCaixaAtiva,
            horarioFechamentoCaixa,
            notificacaoDividasAtiva,
            qtdLembretesDivida,
            horariosLembreteDivida,
        };
        const empresaRef = doc(db, "empresas", perfil.companyId);
        await setDoc(empresaRef, { configuracoesGlobais: dadosConfig }, { merge: true });
        showToast("Configurações da empresa salvas com sucesso!", "success");
    } catch (error: any) {
        showToast("Erro ao salvar configurações: " + error.message, "error");
    } finally {
        setSalvando(false);
    }
  }

  const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7', backgroundColor: '#ffffff', color: '#2c3e50', fontSize: '15px', outline: 'none', transition: 'border 0.2s', width: '100%', boxSizing: 'border-box' as const };
  const tabStyle = (aba: string) => ({
    padding: '12px 20px', cursor: 'pointer', border: 'none',
    borderBottom: abaAtiva === aba ? '3px solid #3498db' : '3px solid transparent',
    backgroundColor: 'transparent', color: abaAtiva === aba ? '#3498db' : '#7f8c8d',
    fontWeight: 'bold', fontSize: '15px', flex: '1 1 auto', textAlign: 'center' as const, transition: 'all 0.2s'
  });

  return (
    <div style={{ background: '#ffffff', padding: '25px', borderRadius: '12px', border: '1px solid #ecf0f1', color: '#2c3e50', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', animation: 'fadeIn 0.4s ease' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '22px', borderBottom: '1px solid #ecf0f1', paddingBottom: '15px' }}>⚙️ Configurações do Sistema</h3>
        
        {isMobile ? (
          <div style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '8px' }}>Módulo de Configuração:</label>
            <select 
              value={abaAtiva} 
              onChange={(e) => setAbaAtiva(e.target.value as any)}
              style={{ ...inputStyle, padding: '12px', fontSize: '16px', backgroundColor: '#f8f9fa', borderColor: '#dcdde1', fontWeight: 'bold', cursor: 'pointer' }}
            >
              <option value="expediente">🕒 Expediente</option>
              <option value="bloqueios">🔒 Dias Fechados</option>
              <option value="mensagens">💬 Mensagens</option>
              <option value="notificacoes">🔔 Notificações</option>
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', borderBottom: '1px solid #ecf0f1', marginBottom: '25px', overflowX: 'auto', flexWrap: 'nowrap' }}>
              <button type="button" onClick={() => setAbaAtiva('expediente')} style={tabStyle('expediente')}>🕒 Expediente</button>
              <button type="button" onClick={() => setAbaAtiva('bloqueios')} style={tabStyle('bloqueios')}>🔒 Dias Fechados</button>
              <button type="button" onClick={() => setAbaAtiva('mensagens')} style={tabStyle('mensagens')}>💬 Mensagens</button>
              <button type="button" onClick={() => setAbaAtiva('notificacoes')} style={tabStyle('notificacoes')}>🔔 Notificações</button>
          </div>
        )}

        <form onSubmit={salvarConfiguracoes}>
            {abaAtiva === 'expediente' && ( /* ... restante do seu formulário ... */
               <div style={{ animation: 'fadeIn 0.3s' }}>
                    <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#34495e' }}>🕒 Horários de Atendimento</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {diasDaSemana.map(({ key, label }) => {
                            const configDia = horarios[key];
                            return (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', paddingBottom: '15px', borderBottom: '1px dashed #e1e8ed' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minWidth: '150px', fontWeight: configDia.ativo ? 'bold' : 'normal', color: configDia.ativo ? '#2c3e50' : '#95a5a6' }}>
                                <input type="checkbox" checked={configDia.ativo} onChange={(e) => handleChange(key, 'ativo', e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }}/>{label}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: configDia.ativo ? 1 : 0.4, pointerEvents: configDia.ativo ? 'auto' : 'none', flexWrap: 'wrap' }}>
                                <input type="time" value={configDia.inicio} onChange={(e) => handleChange(key, 'inicio', e.target.value)} style={{...inputStyle, width: 'auto'}} required={configDia.ativo}/>
                                <span style={{ color: '#7f8c8d', fontWeight: 'bold' }}>até</span>
                                <input type="time" value={configDia.fim} onChange={(e) => handleChange(key, 'fim', e.target.value)} style={{...inputStyle, width: 'auto'}} required={configDia.ativo}/>
                                <button type="button" onClick={() => copiarParaTodos(key)} style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 15px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#2980b9'} onMouseOut={e => e.currentTarget.style.backgroundColor = '#3498db'}>Copiar p/ Todos</button>
                                </div>
                            </div>
                            );
                        })}
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#34495e' }}>🍽️ Horário de Almoço (Pausa Global)</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                            <input type="checkbox" checked={almoco.ativo} onChange={(e) => setAlmoco({ ...almoco, ativo: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} /> Habilitar Pausa
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: almoco.ativo ? 1 : 0.4, pointerEvents: almoco.ativo ? 'auto' : 'none' }}>
                            <input type="time" value={almoco.inicio} onChange={(e) => setAlmoco({ ...almoco, inicio: e.target.value })} style={{...inputStyle, width: 'auto'}} />
                            <span style={{ fontWeight: 'bold', color: '#7f8c8d' }}>até</span>
                            <input type="time" value={almoco.fim} onChange={(e) => setAlmoco({ ...almoco, fim: e.target.value })} style={{...inputStyle, width: 'auto'}} />
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {abaAtiva === 'bloqueios' && (
                <div style={{ backgroundColor: '#fff8e1', padding: '25px', borderRadius: '8px', border: '1px solid #ffe082', marginBottom: '20px', color: '#d35400', animation: 'fadeIn 0.3s' }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#e67e22' }}>🔒 Trancar Dias Específicos</h4>
                <p style={{ fontSize: '13px', color: '#c0392b', marginBottom: '15px' }}>Impeça novos agendamentos para datas específicas (como feriados ou folgas extras).</p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <input type="date" value={novoDiaBloqueado} onChange={(e) => setNovoDiaBloqueado(e.target.value)} style={{ ...inputStyle, borderColor: '#ffe082', width: 'auto' }} />
                    <button type="button" onClick={adicionarDiaBloqueado} style={{ background: '#e67e22', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#d35400'} onMouseOut={e => e.currentTarget.style.backgroundColor = '#e67e22'}>+ Bloquear Dia</button>
                </div>
                {diasBloqueados.length > 0 && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {diasBloqueados.map(dia => (
                        <div key={dia} style={{ background: '#e74c3c', color: 'white', padding: '8px 12px', borderRadius: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 5px rgba(231,76,60,0.3)' }}>
                        {dia.split('-').reverse().join('/')}
                        <button type="button" onClick={() => removerDiaBloqueado(dia)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                    ))}
                    </div>
                )}
                </div>
            )}

            {abaAtiva === 'mensagens' && (
                <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginBottom: '20px', animation: 'fadeIn 0.3s' }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#34495e' }}>💬 Personalizar Mensagem de Lembrete</h4>
                <p style={{ fontSize: '13px', color: '#7f8c8d', marginBottom: '15px' }}>Clique nas tags abaixo para adicioná-las ao seu texto de forma automática.</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                    {['{primeiroNome}', '{data}', '{hora}', '{servico}', '{profissional}'].map(variavel => (
                    <span key={variavel} onClick={() => setMensagemLembrete(prev => prev + ' ' + variavel)} style={{ background: '#ecf0f1', border: '1px solid #bdc3c7', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#dfe6e9'} onMouseOut={e => e.currentTarget.style.backgroundColor = '#ecf0f1'}>{variavel}</span>
                    ))}
                </div>
                <textarea value={mensagemLembrete} onChange={(e) => setMensagemLembrete(e.target.value)} style={{ ...inputStyle, height: '250px', resize: 'vertical', fontFamily: 'monospace', lineHeight: '1.5', padding: '15px' }} />
                </div>
            )}

            {abaAtiva === 'notificacoes' && (
                <div style={{ animation: 'fadeIn 0.3s' }}>
                    <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#34495e' }}>📱 Permissão do Dispositivo</h4>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', background: '#ffffff', borderRadius: '8px', border: '1px solid #bdc3c7', flexWrap: 'wrap', gap: '15px' }}>
                            <div>
                                <strong style={{ color: permissaoNotificacao === 'granted' ? '#27ae60' : '#e74c3c', fontSize: '15px', display: 'block', marginBottom: '5px' }}>
                                    Status Atual: {permissaoNotificacao === 'granted' ? 'Autorizado ✅' : permissaoNotificacao === 'denied' ? 'Bloqueado ❌' : 'Não Solicitado ⚠️'}
                                </strong>
                                <p style={{ margin: '0', fontSize: '13px', color: '#7f8c8d' }}>
                                    *No iPhone/iPad, você deve adicionar o site à "Tela de Início" antes de permitir.
                                </p>
                            </div>
                            <button 
                                type="button" 
                                onClick={solicitarPermissaoNotificacao} 
                                disabled={permissaoNotificacao === 'granted'}
                                style={{ padding: '12px 20px', backgroundColor: permissaoNotificacao === 'granted' ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '6px', cursor: permissaoNotificacao === 'granted' ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'opacity 0.2s' }}
                            >
                                {permissaoNotificacao === 'granted' ? 'Já Ativado' : 'Ativar Alertas'}
                            </button>
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#34495e' }}>📅 Alertas de Próximo Atendimento</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50' }}>
                                <input type="checkbox" checked={notificacaoAgendaAtiva} onChange={(e) => setNotificacaoAgendaAtiva(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} /> 
                                Avisar antes do cliente chegar
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: notificacaoAgendaAtiva ? 1 : 0.4, pointerEvents: notificacaoAgendaAtiva ? 'auto' : 'none' }}>
                                <span style={{ fontSize: '14px', color: '#7f8c8d' }}>Antecedência:</span>
                                <select 
                                    value={minutosAvisoPrevioAgenda} 
                                    onChange={(e) => setMinutosAvisoPrevioAgenda(Number(e.target.value))} 
                                    style={{...inputStyle, padding: '8px', width: 'auto', cursor: 'pointer'}}
                                >
                                    <option value={15}>15 Minutos antes</option>
                                    <option value={30}>30 Minutos antes</option>
                                    <option value={60}>1 Hora antes</option>
                                    <option value={120}>2 Horas antes</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#34495e' }}>💰 Alerta de Fechamento de Caixa</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50' }}>
                                <input type="checkbox" checked={notificacaoCaixaAtiva} onChange={(e) => setNotificacaoCaixaAtiva(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} /> 
                                Lembrete diário para fechar o caixa
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: notificacaoCaixaAtiva ? 1 : 0.4, pointerEvents: notificacaoCaixaAtiva ? 'auto' : 'none' }}>
                                <span style={{ fontSize: '14px', color: '#7f8c8d' }}>Horário do lembrete:</span>
                                <input type="time" value={horarioFechamentoCaixa} onChange={(e) => setHorarioFechamentoCaixa(e.target.value)} style={{...inputStyle, padding: '8px', width: 'auto'}} />
                            </div>
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#fdf4f4', padding: '20px', borderRadius: '8px', border: '1px solid #f5b7b1', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#c0392b' }}>🔴 Lembretes de Dívidas (Contas a Pagar)</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: '#2c3e50' }}>
                                <input type="checkbox" checked={notificacaoDividasAtiva} onChange={(e) => setNotificacaoDividasAtiva(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} /> 
                                Avisar sobre contas vencendo ou atrasadas
                            </label>
                            
                            <div style={{ opacity: notificacaoDividasAtiva ? 1 : 0.4, pointerEvents: notificacaoDividasAtiva ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <span style={{ fontSize: '14px', color: '#7f8c8d', display: 'block', marginBottom: '8px' }}>Quantas vezes notificar ao dia?</span>
                                    <select value={qtdLembretesDivida} onChange={(e) => handleQtdLembretesChange(Number(e.target.value))} style={{...inputStyle, width: '150px', padding: '10px', cursor: 'pointer'}}>
                                        <option value={1}>1 vez</option>
                                        <option value={2}>2 vezes</option>
                                        <option value={3}>3 vezes</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                                    {horariosLembreteDivida.map((horario, index) => (
                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #bdc3c7' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Horário {index + 1}:</span>
                                            <input type="time" value={horario} onChange={(e) => atualizarHorarioDivida(index, e.target.value)} style={{...inputStyle, padding: '6px', width: 'auto', border: 'none', background: 'transparent', boxShadow: 'none'}} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <button type="submit" disabled={salvando} style={{ padding: '16px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', width: '100%', marginTop: '20px', boxShadow: '0 4px 15px rgba(46, 204, 113, 0.4)', transition: 'background 0.2s, transform 0.1s' }} onMouseOver={e => !salvando && (e.currentTarget.style.backgroundColor = '#27ae60')} onMouseOut={e => !salvando && (e.currentTarget.style.backgroundColor = '#2ecc71')} onMouseDown={e => !salvando && (e.currentTarget.style.transform = 'scale(0.98)')} onMouseUp={e => !salvando && (e.currentTarget.style.transform = 'scale(1)')}>
                {salvando ? 'Salvando...' : '💾 Salvar Configurações'}
            </button>
        </form>
    </div>
  );
}