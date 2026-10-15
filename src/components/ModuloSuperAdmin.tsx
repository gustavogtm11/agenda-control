// src/components/ModuloSuperAdmin.tsx

import React, { useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

interface Empresa {
  id: string;
  nome: string;
  statusPgto: 'em_dia' | 'bloqueado';
}

interface DadosQr {
  empresaId: string;
  empresaNome: string;
  base64: string;
  conectado: boolean;
}

const slugEmpresa = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);

async function chamarEvolution(path: string, method: 'GET' | 'POST', body?: unknown) {
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
  try {
    data = texto ? JSON.parse(texto) : {};
  } catch {
    data = { message: texto };
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Evolution API respondeu HTTP ${response.status}.`);
  }
  return data;
}

function extrairQr(data: any): string | null {
  const valor = data?.qrcode?.base64 || data?.base64 || data?.qr?.base64;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  return valor.startsWith('data:image') ? valor : `data:image/png;base64,${valor}`;
}

export function ModuloSuperAdmin() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [idEmpresa, setIdEmpresa] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [emailChefe, setEmailChefe] = useState('');
  const [nomeChefe, setNomeChefe] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [qrDados, setQrDados] = useState<DadosQr | null>(null);
  const [gerandoQr, setGerandoQr] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'empresas'),
      (snapshot) => {
        const lista: Empresa[] = snapshot.docs.map((empresaDoc) => {
          const dados = empresaDoc.data();
          return {
            id: empresaDoc.id,
            nome: String(dados.nome || empresaDoc.id),
            statusPgto: dados.statusPgto === 'bloqueado' || dados.bloqueada === true ? 'bloqueado' : 'em_dia',
          };
        });
        lista.sort((a, b) => a.nome.localeCompare(b.nome));
        setEmpresas(lista);
      },
      (errorSnapshot) => {
        console.error('Erro ao carregar empresas:', errorSnapshot);
        setErro('Não foi possível carregar as empresas. Verifique as permissões do Firebase.');
      },
    );
    return () => unsubscribe();
  }, []);

  async function gerarQrEmpresa(empresaId: string, empresaNome: string) {
    setGerandoQr(true);
    setErro('');
    setMensagem('');
    setQrDados(null);

    try {
      let data: any;
      try {
        data = await chamarEvolution('/instance/create', 'POST', {
          instanceName: empresaId,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        });
      } catch (createError) {
        // Se a instância já existir, solicita um QR/estado de conexão em vez de duplicá-la.
        data = await chamarEvolution(`/instance/connect/${encodeURIComponent(empresaId)}`, 'GET')
          .catch(() => {
            throw createError;
          });
      }

      let base64 = extrairQr(data);
      let conectado = data?.instance?.state === 'open' || data?.state === 'open';

      if (!base64 && !conectado) {
        const estado = await chamarEvolution(
          `/instance/connectionState/${encodeURIComponent(empresaId)}`,
          'GET',
        ).catch(() => null);
        conectado = estado?.instance?.state === 'open' || estado?.state === 'open';
        if (!conectado) {
          const conexao = await chamarEvolution(
            `/instance/connect/${encodeURIComponent(empresaId)}`,
            'GET',
          );
          base64 = extrairQr(conexao);
          conectado = conexao?.instance?.state === 'open' || conexao?.state === 'open';
        }
      }

      let webhookConfigurado = false;
      try {
        await chamarEvolution(`/webhook/instance/update/${encodeURIComponent(empresaId)}`, 'POST', {});
        webhookConfigurado = true;
      } catch (webhookError) {
        // A conexão/QR continua disponível mesmo quando falta configurar a URL pública do webhook.
        console.warn('Não foi possível configurar o webhook automaticamente:', webhookError);
      }

      setQrDados({ empresaId, empresaNome, base64: base64 || '', conectado });
      const avisoWebhook = webhookConfigurado
        ? ' O webhook de mensagens também foi configurado.'
        : ' O QR está pronto, mas o webhook ainda precisa de uma URL HTTPS pública configurada no ambiente.';
      if (conectado) {
        setMensagem(`O WhatsApp de ${empresaNome} já está conectado.${avisoWebhook}`);
      } else if (base64) {
        setMensagem(`Instância de ${empresaNome} pronta. Escaneie o QR Code com o WhatsApp da empresa.${avisoWebhook}`);
      } else {
        setErro('A instância foi consultada, mas a API não retornou QR Code. Tente atualizar em alguns segundos.');
      }
    } catch (error) {
      console.error('Erro ao preparar WhatsApp da empresa:', error);
      setErro(error instanceof Error ? error.message : 'Não foi possível preparar o WhatsApp.');
    } finally {
      setGerandoQr(false);
    }
  }

  async function registrarNovaEmpresa(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro('');
    setMensagem('');

    const idFormatado = slugEmpresa(idEmpresa);
    const email = emailChefe.trim().toLowerCase();
    const nome = nomeEmpresa.trim();
    const nomeResponsavel = nomeChefe.trim();

    if (!idFormatado || !nome || !email || !nomeResponsavel) {
      setErro('Preencha todos os campos. O ID deve conter letras, números, hífen ou sublinhado.');
      return;
    }

    setSalvando(true);
    try {
      const empresaRef = doc(db, 'empresas', idFormatado);
      const existente = await getDoc(empresaRef);
      if (existente.exists()) {
        setErro('Já existe uma empresa com esse ID. Escolha outro identificador.');
        return;
      }

      const batch = writeBatch(db);
      batch.set(empresaRef, {
        nome,
        statusPgto: 'em_dia',
        bloqueada: false,
        criadaEm: new Date().toISOString(),
      });
      batch.set(doc(db, 'usuarios', email), {
        nome: nomeResponsavel,
        email,
        companyId: idFormatado,
        role: 'chefe',
      });
      // A configuração começa desativada. O responsável pode ativá-la após conectar e testar.
      batch.set(doc(db, 'configuracoes_whatsapp', idFormatado), {
        ativo: false,
        empresaId: idFormatado,
        msgBoasVindas: 'Olá! 👋 Sou o assistente virtual. Como posso ajudar?\n1 - Agendar horário\n2 - Falar com atendente',
        msgServicos: 'Qual serviço você deseja realizar? Responda com o número:',
        msgData: 'Para qual dia você deseja agendar?',
        msgHorario: 'Escolha um dos horários disponíveis:',
        msgConfirmacao: 'Agendamento confirmado para {data} às {hora}. Até breve!',
        atualizadoEm: new Date().toISOString(),
      });
      await batch.commit();

      setMensagem(`Empresa ${nome} cadastrada. Agora vamos preparar o QR Code do WhatsApp.`);
      setIdEmpresa('');
      setNomeEmpresa('');
      setEmailChefe('');
      setNomeChefe('');
      await gerarQrEmpresa(idFormatado, nome);
    } catch (error) {
      console.error('Erro ao cadastrar empresa:', error);
      setErro(error instanceof Error ? error.message : 'Erro ao registrar a empresa.');
    } finally {
      setSalvando(false);
    }
  }

  async function alterarStatusPagamento(empresaId: string, statusAtual: string) {
    const novoStatus = statusAtual === 'em_dia' ? 'bloqueado' : 'em_dia';
    if (!window.confirm(`Deseja ${novoStatus === 'bloqueado' ? 'bloquear' : 'desbloquear'} ${empresaId}?`)) return;

    try {
      await updateDoc(doc(db, 'empresas', empresaId), {
        statusPgto: novoStatus,
        bloqueada: novoStatus === 'bloqueado',
      });
      setMensagem(`Status da empresa atualizado para ${novoStatus === 'em_dia' ? 'em dia' : 'bloqueado'}.`);
      setErro('');
    } catch (error) {
      console.error(error);
      setErro('Erro ao alterar o status da empresa.');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 8,
    border: '1px solid #d9e1ea',
    boxSizing: 'border-box',
    fontSize: 14,
    background: '#fff',
  };

  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e4e8ef', boxShadow: '0 8px 28px rgba(30, 41, 59, 0.06)' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: '0 0 6px', color: '#8e44ad', fontWeight: 800, fontSize: 12, letterSpacing: 1.4 }}>PAINEL MASTER</p>
        <h2 style={{ margin: '0 0 8px', color: '#202939' }}>Empresas e conexão WhatsApp</h2>
        <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>Cadastre uma empresa e prepare a conexão do número dela. Cada empresa usa uma instância própria.</p>
      </div>

      {mensagem && <div role="status" style={{ padding: 12, marginBottom: 16, background: '#ecfdf5', color: '#047857', borderRadius: 8, border: '1px solid #a7f3d0' }}>{mensagem}</div>}
      {erro && <div role="alert" style={{ padding: 12, marginBottom: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, border: '1px solid #fecaca' }}>{erro}</div>}

      <form onSubmit={registrarNovaEmpresa} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32, background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: 0, color: '#334155' }}>＋ Nova empresa</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, color: '#475569', fontSize: 13, fontWeight: 700 }}>
            ID exclusivo da empresa
            <input required value={idEmpresa} onChange={(e) => setIdEmpresa(e.target.value)} placeholder="ex.: barbearia_01" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6, color: '#475569', fontSize: 13, fontWeight: 700 }}>
            Nome da empresa
            <input required value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Barbearia do Zé" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6, color: '#475569', fontSize: 13, fontWeight: 700 }}>
            E-mail Google do responsável
            <input required type="email" value={emailChefe} onChange={(e) => setEmailChefe(e.target.value)} placeholder="responsavel@gmail.com" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6, color: '#475569', fontSize: 13, fontWeight: 700 }}>
            Nome do responsável
            <input required value={nomeChefe} onChange={(e) => setNomeChefe(e.target.value)} placeholder="Nome completo" style={inputStyle} />
          </label>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>O cadastro cria o perfil no Firestore. O responsável precisa entrar com esse mesmo e-mail Google para acessar o sistema.</p>
        <button type="submit" disabled={salvando || gerandoQr} style={{ alignSelf: 'flex-start', padding: '12px 18px', background: salvando ? '#94a3b8' : '#7c3aed', color: '#fff', border: 0, borderRadius: 8, cursor: salvando ? 'wait' : 'pointer', fontWeight: 800 }}>
          {salvando ? 'Cadastrando empresa...' : 'Cadastrar empresa e gerar QR Code'}
        </button>
      </form>

      {qrDados && (
        <section aria-label="Conexão WhatsApp" style={{ marginBottom: 28, padding: 20, border: '1px solid #d8b4fe', borderRadius: 12, background: '#faf5ff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: '0 0 6px', color: '#6b21a8' }}>📲 WhatsApp: {qrDados.empresaNome}</h3>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Instância: <strong>{qrDados.empresaId}</strong></p>
            </div>
            <button type="button" onClick={() => gerarQrEmpresa(qrDados.empresaId, qrDados.empresaNome)} disabled={gerandoQr} style={{ padding: '9px 12px', border: '1px solid #c4b5fd', background: '#fff', borderRadius: 8, cursor: 'pointer' }}>
              {gerandoQr ? 'Consultando...' : 'Atualizar QR / conexão'}
            </button>
          </div>
          {gerandoQr ? (
            <p style={{ textAlign: 'center', padding: 18, color: '#6b21a8' }}>Preparando conexão segura...</p>
          ) : qrDados.conectado ? (
            <p style={{ color: '#047857', fontWeight: 800 }}>✅ WhatsApp conectado. O número desta empresa está vinculado à sua instância.</p>
          ) : qrDados.base64 ? (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 10, paddingTop: 18 }}>
              <img src={qrDados.base64} alt={`QR Code do WhatsApp para ${qrDados.empresaNome}`} style={{ width: 260, maxWidth: '100%', background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #e9d5ff' }} />
              <p style={{ margin: 0, maxWidth: 420, textAlign: 'center', color: '#6b21a8', lineHeight: 1.5 }}>No celular da empresa, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e escaneie este código.</p>
            </div>
          ) : (
            <p style={{ color: '#92400e' }}>Nenhum QR Code foi retornado. Clique em “Atualizar QR / conexão” para tentar novamente.</p>
          )}
        </section>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#334155' }}>Empresas cadastradas</h3>
        <span style={{ fontSize: 12, color: '#64748b' }}>{empresas.length} empresa(s)</span>
      </div>

      {empresas.length === 0 ? (
        <p style={{ color: '#64748b' }}>Nenhuma empresa cadastrada ainda.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {empresas.map((empresa) => {
            const bloqueada = empresa.statusPgto === 'bloqueado';
            return (
              <div key={empresa.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: 16, border: '1px solid #e2e8f0', borderRadius: 10, borderLeft: `4px solid ${bloqueada ? '#ef4444' : '#10b981'}` }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 16, color: '#1e293b' }}>{empresa.nome}</strong>
                  <small style={{ color: '#64748b' }}>ID: {empresa.id}</small>
                  <div style={{ marginTop: 5, color: bloqueada ? '#b91c1c' : '#047857', fontSize: 12, fontWeight: 800 }}>{bloqueada ? 'Acesso bloqueado' : 'Assinatura ativa'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => gerarQrEmpresa(empresa.id, empresa.nome)} disabled={gerandoQr} style={{ padding: '9px 12px', background: '#7c3aed', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                    📱 Configurar WhatsApp
                  </button>
                  <button type="button" onClick={() => alterarStatusPagamento(empresa.id, empresa.statusPgto)} style={{ padding: '9px 12px', background: bloqueada ? '#059669' : '#dc2626', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                    {bloqueada ? 'Desbloquear' : 'Bloquear acesso'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
