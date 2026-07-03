// src/components/ModuloConfiguracoes.tsx

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface ModuloConfiguracoesProps {
  perfil: { companyId: string } | null;
}

type DiaSemana = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';

interface HorarioDia { ativo: boolean; inicio: string; fim: string; }
interface HorarioAlmoco { ativo: boolean; inicio: string; fim: string; }
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

  const [horarios, setHorarios] = useState<HorariosFuncionamento>(horariosPadrao);
  const [almoco, setAlmoco] = useState<HorarioAlmoco>({ ativo: true, inicio: '12:00', fim: '13:00' });
  const [diasBloqueados, setDiasBloqueados] = useState<string[]>([]);
  const [novoDiaBloqueado, setNovoDiaBloqueado] = useState('');
  const [mensagemLembrete, setMensagemLembrete] = useState(mensagemPadrao);
  
  // Controle de Notificação Local
  const [permissaoNotificacao, setPermissaoNotificacao] = useState<string>(Notification.permission);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!perfil?.companyId) return;
    async function carregarConfiguracoes() {
        try {
            const empresaRef = doc(db, 'empresas', perfil!.companyId);
            const empresaSnap = await getDoc(empresaRef);
            if (empresaSnap.exists()) {
                const dados = empresaSnap.data();
                if (dados.horariosFuncionamento) setHorarios(dados.horariosFuncionamento);
                if (dados.horarioAlmoco) setAlmoco(dados.horarioAlmoco);
                if (dados.diasBloqueados) setDiasBloqueados(dados.diasBloqueados);
                if (dados.mensagemLembrete) setMensagemLembrete(dados.mensagemLembrete);
            }
        } catch (error) {
            console.error("Erro ao carregar configurações:", error);
        }
    }
    carregarConfiguracoes();
  }, [perfil?.companyId]);

  const solicitarPermissaoNotificacao = async () => {
    if (!("Notification" in window)) {
      alert("Este navegador não suporta notificações de desktop/mobile.");
      return;
    }
    const permissao = await Notification.requestPermission();
    setPermissaoNotificacao(permissao);
    if (permissao === 'granted') {
        new Notification("Tudo certo!", { body: "As notificações do sistema estão ativadas." });
    } else if (permissao === 'denied') {
        alert("Você bloqueou as notificações. Para ativar, clique no ícone de cadeado na barra de endereços do navegador e permita as notificações.");
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
    alert('Horário copiado para todos os dias da semana!');
  };

  const adicionarDiaBloqueado = () => {
    if (!novoDiaBloqueado) return;
    if (diasBloqueados.includes(novoDiaBloqueado)) { alert("Este dia já está bloqueado."); return; }
    setDiasBloqueados([...diasBloqueados, novoDiaBloqueado].sort());
    setNovoDiaBloqueado('');
  };

  const removerDiaBloqueado = (diaRemover: string) => {
    setDiasBloqueados(diasBloqueados.filter(d => d !== diaRemover));
  };

  async function salvarConfiguracoes(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil?.companyId) return;
    setSalvando(true);
    try {
        const empresaRef = doc(db, 'empresas', perfil.companyId);
        await setDoc(empresaRef, { 
            horariosFuncionamento: horarios,
            horarioAlmoco: almoco,
            diasBloqueados: diasBloqueados,
            mensagemLembrete: mensagemLembrete
        }, { merge: true });
        alert("Configurações salvas com sucesso!");
    } catch (error) {
        alert("Erro ao salvar configurações.");
    } finally {
        setSalvando(false);
    }
  }

  const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid var(--borda)', backgroundColor: 'var(--bg-input)', color: 'var(--text-principal)', fontSize: '16px', outline: 'none' };

  const tabStyle = (aba: string) => ({
    padding: '12px 20px', cursor: 'pointer', border: 'none',
    borderBottom: abaAtiva === aba ? '3px solid #2980b9' : '3px solid transparent',
    backgroundColor: 'transparent', color: abaAtiva === aba ? '#2980b9' : 'var(--text-secundario)',
    fontWeight: 'bold', fontSize: '15px', flex: '1 1 auto', textAlign: 'center' as const, transition: 'all 0.2s'
  });

  return (
    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', color: 'var(--text-principal)', marginTop: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>⚙️ Configurações do Sistema</h3>
        
        <div style={{ display: 'flex', borderBottom: '1px solid var(--borda)', marginBottom: '25px', overflowX: 'auto', flexWrap: 'nowrap' }}>
            <button type="button" onClick={() => setAbaAtiva('expediente')} style={tabStyle('expediente')}>🕒 Expediente</button>
            <button type="button" onClick={() => setAbaAtiva('bloqueios')} style={tabStyle('bloqueios')}>🔒 Dias Fechados</button>
            <button type="button" onClick={() => setAbaAtiva('mensagens')} style={tabStyle('mensagens')}>💬 Mensagens</button>
            <button type="button" onClick={() => setAbaAtiva('notificacoes')} style={tabStyle('notificacoes')}>🔔 Notificações</button>
        </div>

        <form onSubmit={salvarConfiguracoes}>
            {abaAtiva === 'expediente' && (
                <div style={{ animation: 'fadeIn 0.3s' }}>
                    {/* ... (Todo o conteúdo original da aba expediente) ... */}
                    <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0' }}>🕒 Horários de Atendimento</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {diasDaSemana.map(({ key, label }) => {
                            const configDia = horarios[key];
                            return (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', paddingBottom: '15px', borderBottom: '1px dashed var(--borda)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minWidth: '150px', fontWeight: configDia.ativo ? 'bold' : 'normal', color: configDia.ativo ? 'var(--text-principal)' : 'var(--text-secundario)' }}>
                                <input type="checkbox" checked={configDia.ativo} onChange={(e) => handleChange(key, 'ativo', e.target.checked)} style={{ width: '18px', height: '18px' }}/>{label}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: configDia.ativo ? 1 : 0.4, pointerEvents: configDia.ativo ? 'auto' : 'none' }}>
                                <input type="time" value={configDia.inicio} onChange={(e) => handleChange(key, 'inicio', e.target.value)} style={inputStyle} required={configDia.ativo}/>
                                <span style={{ color: 'var(--text-secundario)', fontWeight: 'bold' }}>até</span>
                                <input type="time" value={configDia.fim} onChange={(e) => handleChange(key, 'fim', e.target.value)} style={inputStyle} required={configDia.ativo}/>
                                <button type="button" onClick={() => copiarParaTodos(key)} style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', padding: '10px 15px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Copiar p/ Todos</button>
                                </div>
                            </div>
                            );
                        })}
                        </div>
                    </div>
                    <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 15px 0' }}>🍽️ Horário de Almoço (Pausa Global)</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                            <input type="checkbox" checked={almoco.ativo} onChange={(e) => setAlmoco({ ...almoco, ativo: e.target.checked })} style={{ width: '18px', height: '18px' }} /> Habilitar Pausa
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: almoco.ativo ? 1 : 0.4, pointerEvents: almoco.ativo ? 'auto' : 'none' }}>
                            <input type="time" value={almoco.inicio} onChange={(e) => setAlmoco({ ...almoco, inicio: e.target.value })} style={inputStyle} />
                            <span style={{ fontWeight: 'bold' }}>até</span>
                            <input type="time" value={almoco.fim} onChange={(e) => setAlmoco({ ...almoco, fim: e.target.value })} style={inputStyle} />
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {abaAtiva === 'bloqueios' && (
                <div style={{ backgroundColor: '#fff3e0', padding: '20px', borderRadius: '8px', border: '1px solid #ffcc80', marginBottom: '20px', color: '#d35400', animation: 'fadeIn 0.3s' }}>
                <h4 style={{ margin: '0 0 15px 0' }}>🔒 Trancar Dias Específicos</h4>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                    <input type="date" value={novoDiaBloqueado} onChange={(e) => setNovoDiaBloqueado(e.target.value)} style={{ ...inputStyle, borderColor: '#ffcc80' }} />
                    <button type="button" onClick={adicionarDiaBloqueado} style={{ background: '#e67e22', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}>+ Bloquear Dia</button>
                </div>
                {diasBloqueados.length > 0 && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {diasBloqueados.map(dia => (
                        <div key={dia} style={{ background: '#e74c3c', color: 'white', padding: '5px 10px', borderRadius: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {dia.split('-').reverse().join('/')}
                        <button type="button" onClick={() => removerDiaBloqueado(dia)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        </div>
                    ))}
                    </div>
                )}
                </div>
            )}

            {abaAtiva === 'mensagens' && (
                <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginBottom: '20px', animation: 'fadeIn 0.3s' }}>
                <h4 style={{ margin: '0 0 15px 0' }}>💬 Personalizar Mensagem de Lembrete</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                    {['{primeiroNome}', '{data}', '{hora}', '{servico}', '{profissional}'].map(variavel => (
                    <span key={variavel} onClick={() => setMensagemLembrete(prev => prev + ' ' + variavel)} style={{ background: 'var(--bg-input)', border: '1px solid var(--borda)', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>{variavel}</span>
                    ))}
                </div>
                <textarea value={mensagemLembrete} onChange={(e) => setMensagemLembrete(e.target.value)} style={{ ...inputStyle, width: '100%', height: '250px', resize: 'vertical', fontFamily: 'monospace' }} />
                </div>
            )}

            {/* ABA: NOTIFICAÇÕES (NOVA) */}
            {abaAtiva === 'notificacoes' && (
                <div style={{ backgroundColor: 'var(--bg-card-item)', padding: '20px', borderRadius: '8px', border: '1px solid var(--borda)', marginBottom: '20px', animation: 'fadeIn 0.3s' }}>
                    <h4 style={{ margin: '0 0 15px 0' }}>🔔 Alertas de Contas a Pagar</h4>
                    <p style={{ fontSize: '14px', color: 'var(--text-secundario)', marginBottom: '20px' }}>
                        Permita que o navegador envie alertas quando você tiver contas fixas ou avulsas vencendo hoje ou em atraso ao abrir o sistema.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', background: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--borda)' }}>
                        <div>
                            <strong style={{ display: 'block', fontSize: '16px' }}>Permissão do Navegador</strong>
                            <small style={{ color: permissaoNotificacao === 'granted' ? '#27ae60' : '#e74c3c', fontWeight: 'bold' }}>
                                Status Atual: {permissaoNotificacao === 'granted' ? 'Autorizado ✅' : permissaoNotificacao === 'denied' ? 'Bloqueado ❌' : 'Não Solicitado ⚠️'}
                            </small>
                            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'var(--text-secundario)' }}>
                                *No iPhone/iPad, você deve adicionar o site à "Tela de Início" antes de permitir.
                            </p>
                        </div>
                        <button 
                            type="button" 
                            onClick={solicitarPermissaoNotificacao} 
                            disabled={permissaoNotificacao === 'granted'}
                            style={{ padding: '10px 15px', backgroundColor: permissaoNotificacao === 'granted' ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '4px', cursor: permissaoNotificacao === 'granted' ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                        >
                            {permissaoNotificacao === 'granted' ? 'Já Ativado' : 'Ativar Alertas'}
                        </button>
                    </div>
                </div>
            )}

            <button type="submit" disabled={salvando} style={{ padding: '12px 24px', backgroundColor: '#2980b9', color: 'white', border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', width: '100%' }}>
                {salvando ? 'Salvando...' : 'Salvar Configurações'}
            </button>
        </form>
    </div>
  );
}