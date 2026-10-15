// src/components/ModuloAutomacaoWhatsApp.tsx

import { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '../App';

// A chave da Evolution fica no servidor/proxy, nunca no bundle React.
async function evolutionFetch(path: string, method: 'GET' | 'POST', body?: unknown) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Sua sessão expirou. Entre novamente.');
  const token = await usuario.getIdToken();
  const response = await fetch(`/api/evolution${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await response.text();
  let data: any = {};
  try { data = texto ? JSON.parse(texto) : {}; } catch { data = { message: texto }; }
  if (!response.ok) throw new Error(data.error || data.message || `Evolution API respondeu HTTP ${response.status}.`);
  return data;
}

interface ModuloAutomacaoProps {
  perfil: { companyId: string; role: string } | null;
}

type CamposTexto = 'msgBoasVindas' | 'msgServicos' | 'msgData' | 'msgHorario' | 'msgConfirmacao';

export function ModuloAutomacaoWhatsApp({ perfil }: ModuloAutomacaoProps) {
  const { showToast } = useToast();
  const [carregando, setCarregando] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [statusConexao, setStatusConexao] = useState<'verificando' | 'desconectado' | 'conectado'>('desconectado');
  const [campoFocado, setCampoFocado] = useState<CamposTexto>('msgBoasVindas');

  const variaveis = ['{primeiroNome}', '{data}', '{hora}', '{servico}', '{profissional}'];

  const [config, setConfig] = useState({
    ativo: false,
    msgBoasVindas: 'Olá! Sou o assistente virtual do salão. Como posso te ajudar hoje?\n1 - Agendar horário\n2 - Falar com atendente',
    msgServicos: 'Ótimo! Qual serviço você deseja realizar? Responda com o número:',
    msgData: 'Para qual data deseja agendar? (Ex: 25/10/2023)',
    msgHorario: 'Esses são os horários disponíveis. Escolha um número:',
    msgConfirmacao: 'Perfeito! Seu agendamento está confirmado para {data} às {horario}. Te esperamos!',
  });

  // CORREÇÃO 1: Monitorar apenas o string ID primitivo para evitar loops de recarregamento
  useEffect(() => {
    if (perfil?.companyId) {
      carregarConfiguracoes();
    }
  }, [perfil?.companyId]);

  useEffect(() => {
    if (config.ativo) {
      verificarStatusConexao();
    }
  }, [config.ativo]);

  const carregarConfiguracoes = async () => {
    try {
      const docRef = doc(db, 'configuracoes_whatsapp', perfil!.companyId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setConfig(prev => ({ ...prev, ...docSnap.data() }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const salvarConfiguracoes = async () => {
    setCarregando(true);
    try {
      const docRef = doc(db, 'configuracoes_whatsapp', perfil!.companyId);
      await setDoc(docRef, config, { merge: true });
      showToast('Configurações salvas com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao salvar configurações.', 'error');
    } finally {
      setCarregando(false);
    }
  };

  const registrarWebhook = async () => {
    if (!perfil?.companyId) return;
    setCarregando(true);
    try {
      await evolutionFetch(`/webhook/instance/update/${encodeURIComponent(perfil.companyId)}`, 'POST', {});
      showToast('Webhook sincronizado com sucesso!', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao sincronizar webhook.', 'error');
    } finally {
      setCarregando(false);
    }
  };

  const verificarStatusConexao = async () => {
    if (!perfil?.companyId) return;
    setStatusConexao('verificando');
    try {
      const data = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(perfil.companyId)}`, 'GET');
      setStatusConexao(data?.instance?.state === 'open' || data?.state === 'open' ? 'conectado' : 'desconectado');
    } catch (error) {
      console.error('Erro ao verificar conexão:', error);
      setStatusConexao('desconectado');
    }
  };

  const gerarQrCode = async () => {
    if (!perfil?.companyId) {
      showToast('Erro: Empresa não identificada.', 'error');
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
        data = await evolutionFetch(`/instance/connect/${encodeURIComponent(perfil.companyId)}`, 'GET')
          .catch(() => { throw erroCriacao; });
      }

      const valorQr = data?.qrcode?.base64 || data?.base64 || data?.qr?.base64;
      if (typeof valorQr === 'string' && valorQr) {
        setQrCode(valorQr.startsWith('data:image') ? valorQr : `data:image/png;base64,${valorQr}`);
        showToast('QR Code pronto! Escaneie com o WhatsApp da empresa.', 'success');
      } else if (data?.instance?.state === 'open' || data?.state === 'open') {
        setStatusConexao('conectado');
        showToast('O WhatsApp já está conectado!', 'success');
      } else {
        const estado = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(perfil.companyId)}`, 'GET').catch(() => null);
        if (estado?.instance?.state === 'open' || estado?.state === 'open') {
          setStatusConexao('conectado');
          showToast('O WhatsApp já está conectado!', 'success');
        } else {
          showToast('A API não retornou o QR Code. Tente novamente em alguns segundos.', 'error');
        }
      }
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      showToast(error instanceof Error ? error.message : 'Erro de comunicação com o servidor.', 'error');
    } finally {
      setCarregando(false);
    }
  };

    const adicionarVariavel = (variavel: string) => {
    setConfig(prev => ({
      ...prev,
      [campoFocado]: prev[campoFocado] + ' ' + variavel
    }));
  };

  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '15px' };

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      <h2 style={{ marginBottom: '20px', color: '#2c3e50' }}>🤖 Automação de Agendamento (WhatsApp)</h2>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', padding: '15px', backgroundColor: '#f9fbfd', borderRadius: '8px', border: '1px solid #e1e8ed' }}>
        <input 
          type="checkbox" 
          checked={config.ativo} 
          onChange={(e) => setConfig({ ...config, ativo: e.target.checked })}
          style={{ width: '20px', height: '20px', marginRight: '10px', cursor: 'pointer' }}
        />
        <label style={{ fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', color: '#2c3e50' }} onClick={() => setConfig({ ...config, ativo: !config.ativo })}>
          Ativar Atendimento Automatizado (Robô)
        </label>
      </div>

      {config.ativo && (
        <div style={{ animation: 'fadeIn 0.3s' }}>

          {statusConexao === 'verificando' && (
            <p style={{ textAlign: 'center', color: '#7f8c8d', padding: '20px' }}>⏳ Verificando status de conexão com o WhatsApp...</p>
          )}

          {statusConexao === 'desconectado' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fbfd', padding: '30px', borderRadius: '8px', border: '1px solid #e1e8ed' }}>
              <h3 style={{ color: '#e74c3c', marginBottom: '15px', textAlign: 'center' }}>WhatsApp Desconectado</h3>
              <button onClick={gerarQrCode} disabled={carregando} style={{ padding: '12px 20px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', width: '100%', maxWidth: '300px', marginBottom: '20px' }}>
                {carregando ? '⏳ Carregando...' : '📲 Gerar QR Code'}
              </button>
              {qrCode && (
                <div style={{ textAlign: 'center', padding: '15px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #eee', width: '100%', maxWidth: '300px' }}>
                  <img src={qrCode} alt="QR Code WhatsApp" style={{ width: '100%', height: 'auto', borderRadius: '8px' }} />
                </div>
              )}
            </div>
          )}

          {statusConexao === 'conectado' && (
            <div style={{ backgroundColor: '#f9fbfd', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#27ae60', margin: 0 }}>✅ WhatsApp Conectado</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={registrarWebhook} style={{ background: '#9b59b6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        🔄 Sincronizar Webhook
                    </button>
                    <button onClick={verificarStatusConexao} style={{ background: 'transparent', border: '1px solid #bdc3c7', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        ↻ Atualizar
                    </button>
                </div>
              </div>

              <hr style={{ margin: '20px 0', borderColor: '#ecf0f1' }} />
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {variaveis.map(variavel => (
                  <span 
                    key={variavel} 
                    // CORREÇÃO 2: onMouseDown com preventDefault impede o campo de perder o foco
                    onMouseDown={(e) => {
                      e.preventDefault();
                      adicionarVariavel(variavel);
                    }} 
                    style={{ background: '#ecf0f1', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }} 
                  >
                    {variavel}
                  </span>
                ))}
              </div>

              <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#7f8c8d' }}>Mensagem de Boas-vindas</label>
              <textarea value={config.msgBoasVindas} onChange={e => setConfig({...config, msgBoasVindas: e.target.value})} onFocus={() => setCampoFocado('msgBoasVindas')} style={{...inputStyle, height: '70px', resize: 'none'}} />

              <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#7f8c8d' }}>Pedido de Serviço</label>
              <textarea value={config.msgServicos} onChange={e => setConfig({...config, msgServicos: e.target.value})} onFocus={() => setCampoFocado('msgServicos')} style={{...inputStyle, height: '50px', resize: 'none'}} />

              <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#7f8c8d' }}>Pedido de Data</label>
              <textarea value={config.msgData} onChange={e => setConfig({...config, msgData: e.target.value})} onFocus={() => setCampoFocado('msgData')} style={{...inputStyle, height: '50px', resize: 'none'}} />

              <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#7f8c8d' }}>Pedido de Horário</label>
              <textarea value={config.msgHorario} onChange={e => setConfig({...config, msgHorario: e.target.value})} onFocus={() => setCampoFocado('msgHorario')} style={{...inputStyle, height: '50px', resize: 'none'}} />

              <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#7f8c8d' }}>Confirmação Final</label>
              <textarea value={config.msgConfirmacao} onChange={e => setConfig({...config, msgConfirmacao: e.target.value})} onFocus={() => setCampoFocado('msgConfirmacao')} style={{...inputStyle, height: '70px', resize: 'none'}} />
            </div>
          )}
        </div>
      )}

      {config.ativo && (
        <>
          <hr style={{ margin: '30px 0', borderColor: '#ecf0f1' }} />
          <button 
            onClick={salvarConfiguracoes} 
            disabled={carregando} 
            style={{ padding: '15px 30px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', width: '100%', cursor: 'pointer' }}
          >
            {carregando ? 'Salvando...' : '💾 Salvar Configurações'}
          </button>
        </>
      )}
    </div>
  );
}