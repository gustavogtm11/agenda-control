// src/components/ModuloAutomacaoWhatsApp.tsx

import { useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '../App';

// A chave da Evolution permanece no proxy/servidor e nunca é enviada ao navegador.
async function evolutionFetch(path: string, method: 'GET' | 'POST', body?: unknown) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Sua sessão expirou. Entre novamente.');
  const token = await usuario.getIdToken();
  const response = await fetch('/api/evolution' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await response.text();
  let data: any = {};
  try { data = texto ? JSON.parse(texto) : {}; } catch { data = { message: texto }; }
  if (!response.ok) throw new Error(data.error || data.message || 'Evolution API respondeu HTTP ' + response.status + '.');
  return data;
}

interface ModuloAutomacaoProps {
  perfil: { companyId: string; role: string } | null;
}
type CamposTexto =
  | 'msgBoasVindas'
  | 'msgMenuPrincipal'
  | 'msgServicos'
  | 'msgData'
  | 'msgHorario'
  | 'msgConfirmacao'
  | 'msgCancelamento'
  | 'msgAtendente'
  | 'msgSemAgendamentos'
  | 'msgConsulta'
  | 'msgSemHorarios';

type ConfigWhatsApp = Record<CamposTexto, string> & { ativo: boolean };

const CONFIG_PADRAO: ConfigWhatsApp = {
  ativo: false,
  msgBoasVindas: 'Olá {primeiroNome}! 👋 Sou o assistente virtual e vou ajudar você por aqui.',
  msgMenuPrincipal: 'Como posso ajudar?\n1 - Agendar horário 📅\n2 - Cancelar agendamento ❌\n3 - Consultar meus horários 📋\n4 - Falar com atendente 👤\n\nDigite apenas o número da opção desejada.',
  msgServicos: 'Ótimo, {primeiroNome}! Qual serviço você deseja realizar? Responda com o número:',
  msgData: 'Para qual dia você deseja agendar {servico}?',
  msgHorario: 'Estes são os horários disponíveis para {servico} em {data}. Escolha um número:',
  msgConfirmacao: 'Agendamento realizado! ✅\n\nServiço: {servico}\nData: {data}\nHorário: {hora}\nValor: {valor}\n\nObrigado, {primeiroNome}! Se precisar, digite MENU.',
  msgCancelamento: 'Pronto, {primeiroNome}! Seu agendamento de {servico}, em {data} às {hora}, foi cancelado.',
  msgAtendente: 'Certo, {primeiroNome}! Registrei seu pedido para falar com um atendente. Nossa equipe continuará por aqui assim que possível. Digite MENU para voltar ao robô.',
  msgSemAgendamentos: 'Não encontrei agendamentos futuros vinculados a este número. Digite 1 para agendar ou MENU para voltar.',
  msgConsulta: 'Estes são seus próximos horários, {primeiroNome}:',
  msgSemHorarios: 'Não encontrei horários disponíveis em {data} para {servico}. Informe outra data no formato DD/MM/AAAA:',
};

const CAMPOS_EDITAVEIS: { campo: CamposTexto; titulo: string; ajuda: string }[] = [
  { campo: 'msgBoasVindas', titulo: 'Boas-vindas', ajuda: 'Enviada ao iniciar ou reiniciar uma conversa. O menu é enviado logo depois.' },
  { campo: 'msgMenuPrincipal', titulo: 'Menu principal', ajuda: 'Use os números 1 a 4 na mesma ordem das opções exibidas.' },
  { campo: 'msgServicos', titulo: 'Escolha do serviço', ajuda: 'A lista de serviços cadastrados é acrescentada automaticamente abaixo deste texto.' },
  { campo: 'msgData', titulo: 'Escolha da data', ajuda: 'A lista de datas disponíveis é acrescentada automaticamente.' },
  { campo: 'msgHorario', titulo: 'Escolha do horário', ajuda: 'A lista de horários disponíveis é acrescentada automaticamente.' },
  { campo: 'msgConfirmacao', titulo: 'Confirmação do agendamento', ajuda: 'Enviada depois de reservar o horário.' },
  { campo: 'msgCancelamento', titulo: 'Confirmação do cancelamento', ajuda: 'Enviada depois que o agendamento é removido.' },
  { campo: 'msgAtendente', titulo: 'Transferência para atendimento humano', ajuda: 'A automação pausa para essa conversa até o cliente digitar MENU.' },
  { campo: 'msgSemAgendamentos', titulo: 'Nenhum agendamento encontrado', ajuda: 'Usada na consulta e no cancelamento quando não há horário futuro vinculado ao telefone.' },
  { campo: 'msgConsulta', titulo: 'Consulta de horários', ajuda: 'O sistema acrescenta a lista dos próximos agendamentos depois deste texto.' },
  { campo: 'msgSemHorarios', titulo: 'Data sem disponibilidade', ajuda: 'O cliente poderá informar outra data.' },
];

const VARIAVEIS_FIXAS = ['{primeiroNome}', '{data}', '{hora}', '{horario}', '{servico}', '{profissional}', '{valor}'];

export function ModuloAutomacaoWhatsApp({ perfil }: ModuloAutomacaoProps) {
  const { showToast } = useToast();
  const [carregando, setCarregando] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [statusConexao, setStatusConexao] = useState<'verificando' | 'desconectado' | 'conectado'>('desconectado');
  const [campoFocado, setCampoFocado] = useState<CamposTexto>('msgBoasVindas');
  const [config, setConfig] = useState<ConfigWhatsApp>(CONFIG_PADRAO);

  useEffect(() => {
    if (perfil?.companyId) void carregarConfiguracoes();
  }, [perfil?.companyId]);

  useEffect(() => {
    if (perfil?.companyId && config.ativo) void verificarStatusConexao();
  }, [perfil?.companyId, config.ativo]);

  const carregarConfiguracoes = async () => {
    if (!perfil?.companyId) return;
    try {
      const snapshot = await getDoc(doc(db, 'configuracoes_whatsapp', perfil.companyId));
      if (snapshot.exists()) {
        const dados = snapshot.data();
        setConfig({ ...CONFIG_PADRAO, ...dados, ativo: dados.ativo === true } as ConfigWhatsApp);
      }
    } catch (error) {
      console.error('[WhatsApp] Erro ao carregar configurações:', error);
      showToast('Não foi possível carregar as configurações do WhatsApp.', 'error');
    }
  };

  const salvarConfiguracoes = async () => {
    if (!perfil?.companyId) {
      showToast('Não foi possível identificar a empresa.', 'error');
      return;
    }
    setCarregando(true);
    try {
      await setDoc(doc(db, 'configuracoes_whatsapp', perfil.companyId), {
        ...config,
        atualizadoEm: new Date().toISOString(),
      }, { merge: true });
      showToast('Configurações do atendimento salvas!', 'success');
    } catch (error) {
      console.error('[WhatsApp] Erro ao salvar configurações:', error);
      showToast('Erro ao salvar configurações. Verifique as permissões do Firestore.', 'error');
    } finally {
      setCarregando(false);
    }
  };

  const verificarStatusConexao = async () => {
    if (!perfil?.companyId) return;
    setStatusConexao('verificando');
    try {
      const data = await evolutionFetch('/instance/connectionState/' + encodeURIComponent(perfil.companyId), 'GET');
      const estado = data?.instance?.state || data?.state || data?.instance?.status;
      setStatusConexao(estado === 'open' || estado === 'connected' ? 'conectado' : 'desconectado');
    } catch (error) {
      console.error('[WhatsApp] Erro ao verificar conexão:', error);
      setStatusConexao('desconectado');
    }
  };

  const gerarQrCode = async () => {
    if (!perfil?.companyId) {
      showToast('Empresa não identificada.', 'error');
      return;
    }
    setCarregando(true);
    setQrCode(null);
    try {
      let data: any;
      try {
        data = await evolutionFetch('/instance/create', 'POST', {
          instanceName: perfil.companyId,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        });
      } catch (erroCriacao) {
        try {
          data = await evolutionFetch('/instance/connect/' + encodeURIComponent(perfil.companyId), 'GET');
        } catch {
          throw erroCriacao;
        }
      }
      const valorQr = data?.qrcode?.base64 || data?.base64 || data?.qr?.base64;
      if (typeof valorQr === 'string' && valorQr) {
        setQrCode(valorQr.startsWith('data:image') ? valorQr : 'data:image/png;base64,' + valorQr);
        showToast('QR Code pronto. Escaneie com o WhatsApp da empresa.', 'success');
        setStatusConexao('desconectado');
      } else {
        const estado = await evolutionFetch('/instance/connectionState/' + encodeURIComponent(perfil.companyId), 'GET').catch(() => null);
        if (estado?.instance?.state === 'open' || estado?.state === 'open') {
          setStatusConexao('conectado');
          showToast('O WhatsApp já está conectado!', 'success');
        } else {
          showToast('A API não retornou o QR Code. Confira os logs da Evolution e tente novamente.', 'error');
        }
      }
    } catch (error) {
      console.error('[WhatsApp] Erro ao gerar QR Code:', error);
      showToast(error instanceof Error ? error.message : 'Erro ao conectar o WhatsApp.', 'error');
    } finally {
      setCarregando(false);
    }
  };

  const registrarWebhook = async () => {
    if (!perfil?.companyId) return;
    setCarregando(true);
    try {
      await evolutionFetch('/webhook/set/' + encodeURIComponent(perfil.companyId), 'POST', {});
      showToast('Webhook sincronizado. O atendimento automático poderá receber mensagens.', 'success');
    } catch (error) {
      console.error('[WhatsApp] Erro ao sincronizar webhook:', error);
      showToast(error instanceof Error ? error.message : 'Erro ao sincronizar webhook.', 'error');
    } finally {
      setCarregando(false);
    }
  };

  const atualizarTexto = (campo: CamposTexto, valor: string) => {
    setConfig((atual) => ({ ...atual, [campo]: valor }));
  };

  const adicionarVariavel = (variavel: string) => {
    setConfig((atual) => ({ ...atual, [campoFocado]: atual[campoFocado] + variavel }));
  };

  const inputStyle = {
    width: '100%',
    minHeight: 78,
    boxSizing: 'border-box' as const,
    padding: 12,
    borderRadius: 9,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#0f172a',
    font: 'inherit',
    lineHeight: 1.5,
    resize: 'vertical' as const,
  };
  const botaoStyle = {
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '9px 12px',
    background: '#fff',
    color: '#334155',
    cursor: 'pointer',
    fontWeight: 700 as const,
  };

  if (!perfil?.companyId) {
    return <div style={{ padding: 24 }}>Não foi possível identificar a empresa deste usuário.</div>;
  }

  return (
    <div style={{ padding: 22, background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(15,23,42,.06)', color: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: '0 0 7px', color: '#0f172a' }}>Atendimento automático pelo WhatsApp</h2>
          <p style={{ margin: 0, color: '#64748b', lineHeight: 1.55, maxWidth: 760 }}>
            Configure o robô, personalize as mensagens e mantenha o agendamento manual funcionando normalmente no sistema.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: config.ativo ? '#ecfdf5' : '#f1f5f9', color: config.ativo ? '#047857' : '#475569', fontWeight: 800, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.ativo} onChange={(e) => setConfig((atual) => ({ ...atual, ativo: e.target.checked }))} style={{ width: 18, height: 18 }} />
          {config.ativo ? 'Robô ativado' : 'Robô desativado'}
        </label>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Conexão</div>
          <div style={{ color: statusConexao === 'conectado' ? '#047857' : statusConexao === 'verificando' ? '#a16207' : '#b91c1c', fontWeight: 700, marginBottom: 12 }}>
            {statusConexao === 'conectado' ? '● WhatsApp conectado' : statusConexao === 'verificando' ? '● Verificando conexão...' : '● WhatsApp desconectado'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={gerarQrCode} disabled={carregando} style={{ ...botaoStyle, background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}>
              {carregando ? 'Aguarde...' : 'Gerar / atualizar QR Code'}
            </button>
            <button type="button" onClick={verificarStatusConexao} disabled={carregando} style={botaoStyle}>Verificar</button>
          </div>
          {qrCode && statusConexao !== 'conectado' && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <img src={qrCode} alt="QR Code de conexão do WhatsApp" style={{ width: 230, maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: 10 }} />
              <p style={{ color: '#64748b', fontSize: 12, marginBottom: 0 }}>WhatsApp → Dispositivos conectados → Conectar dispositivo.</p>
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Recebimento de mensagens</div>
          <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            O webhook precisa apontar para uma URL HTTPS pública. O navegador local não pode receber chamadas diretamente da Evolution.
          </p>
          <button type="button" onClick={registrarWebhook} disabled={carregando || statusConexao !== 'conectado'} style={{ ...botaoStyle, background: '#7c3aed', color: '#fff', borderColor: '#7c3aed', opacity: carregando || statusConexao !== 'conectado' ? .6 : 1 }}>
            {carregando ? 'Sincronizando...' : 'Sincronizar webhook'}
          </button>
          <button type="button" onClick={() => void salvarConfiguracoes()} disabled={carregando} style={{ ...botaoStyle, marginLeft: 8 }}>
            Salvar configuração
          </button>
        </div>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 18, background: '#f8fafc' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Variáveis dinâmicas fixas</h3>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
          Clique em uma variável para inseri-la no campo de texto selecionado. Os nomes das variáveis são fixos; você personaliza apenas as mensagens.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {VARIAVEIS_FIXAS.map((variavel) => (
            <button key={variavel} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adicionarVariavel(variavel)} style={{ ...botaoStyle, background: '#ede9fe', borderColor: '#ddd6fe', color: '#5b21b6' }}>
              {variavel}
            </button>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {CAMPOS_EDITAVEIS.map(({ campo, titulo, ajuda }) => (
          <label key={campo} style={{ display: 'grid', alignContent: 'start', gap: 7, fontWeight: 800, fontSize: 14 }}>
            {titulo}
            <textarea
              value={config[campo]}
              onChange={(e) => atualizarTexto(campo, e.target.value)}
              onFocus={() => setCampoFocado(campo)}
              style={inputStyle}
              aria-label={titulo}
            />
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 400, lineHeight: 1.5 }}>{ajuda}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', marginTop: 22, paddingTop: 18 }}>
        <p style={{ margin: 0, color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
          O fluxo usa os serviços e horários cadastrados da empresa. A opção de agendamento manual continua disponível no módulo Agenda.
        </p>
        <button type="button" onClick={salvarConfiguracoes} disabled={carregando} style={{ ...botaoStyle, padding: '12px 20px', background: '#0f766e', borderColor: '#0f766e', color: '#fff', opacity: carregando ? .65 : 1 }}>
          {carregando ? 'Salvando...' : 'Salvar mensagens e automação'}
        </button>
      </div>
    </div>
  );
}
