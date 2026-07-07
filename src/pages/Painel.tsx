// src/pages/Painel.tsx

import  { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase'; 
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore'; 
import { useToast } from '../App';

import { ModuloAgenda } from '../components/ModuloAgenda';
import { ModuloCaixa } from '../components/ModuloCaixa';
import { ModuloEstoque } from '../components/ModuloEstoque';
import { ModuloServicos } from '../components/ModuloServicos';
import { ModuloFuncionarios } from '../components/ModuloFuncionarios';
import { ModuloSuperAdmin } from '../components/ModuloSuperAdmin';
import { ModuloConfiguracoes } from '../components/ModuloConfiguracoes';

interface PainelProps {
  perfil: { nome: string; companyId: string; role: string; } | null;
}

export function Painel({ perfil }: PainelProps) {
  const [abaAtiva, setAbaAtiva] = useState<'agenda' | 'caixa' | 'estoque' | 'servicos' | 'funcionarios' | 'admin' | 'config'>('agenda');
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [menuExpandido, setMenuExpandido] = useState(() => {
    const width = window.innerWidth;
    return width >= 1024;
  });

  const { showToast } = useToast();

  // ESTADOS DO MOTOR DE NOTIFICAÇÕES (Background) e BADGES
  const [configuracoesGlobais, setConfiguracoesGlobais] = useState<any>(null);
  const [agendamentosHoje, setAgendamentosHoje] = useState<any[]>([]);
  const [contasVencidas, setContasVencidas] = useState<any[]>([]); // Adicionado estado para dívidas

  // 1. CARREGA AS CONFIGURAÇÕES, AGENDA DO DIA E CONTAS PARA O MOTOR DE NOTIFICAÇÕES
  useEffect(() => {
    if (!perfil?.companyId || perfil?.role === 'super_admin') return;

    // Escuta a configuração
    const unsubConfig = onSnapshot(doc(db, 'empresas', perfil.companyId), (docSnap) => {
      if (docSnap.exists()) {
        setConfiguracoesGlobais(docSnap.data());
      }
    });

    const hoje = new Date();
    const tzoffset = hoje.getTimezoneOffset() * 60000;
    const dataStr = new Date(hoje.getTime() - tzoffset).toISOString().split('T')[0];

    // Escuta a agenda do dia atual
    const qAgenda = query(
      collection(db, 'agendamentos'),
      where('companyId', '==', perfil.companyId),
      where('status', '==', 'pendente')
    );

    const unsubAgendamentos = onSnapshot(qAgenda, (snap) => {
      const lista: any[] = [];
      snap.forEach(d => {
         const dados = d.data();
         if (dados.dataHora && dados.dataHora.startsWith(dataStr)) {
            lista.push({ id: d.id, ...dados });
         }
      });
      setAgendamentosHoje(lista);
    });

    // Escuta as contas a pagar (Dívidas)
    const qContas = query(
      collection(db, 'contas_pagar'),
      where('companyId', '==', perfil.companyId),
      where('status', '==', 'pendente')
    );

    const unsubContas = onSnapshot(qContas, (snap) => {
      const listaContas: any[] = [];
      snap.forEach(d => {
        const conta = d.data();
        // Só joga pro estado se estiver vencendo hoje ou se já estiver atrasada
        if (conta.vencimento <= dataStr) {
          listaContas.push({ id: d.id, ...conta });
        }
      });
      setContasVencidas(listaContas);
    });

    return () => { unsubConfig(); unsubAgendamentos(); unsubContas(); };
  }, [perfil?.companyId, perfil?.role]);

  // 2. O RELÓGIO (MOTOR DE NOTIFICAÇÕES)
  useEffect(() => {
    if (!configuracoesGlobais || Notification.permission !== 'granted') return;

    const intervalo = setInterval(() => {
        const agora = new Date();
        const hora = agora.getHours().toString().padStart(2, '0');
        const minuto = agora.getMinutes().toString().padStart(2, '0');
        const horaAtual = `${hora}:${minuto}`;
        const dataHoje = agora.toISOString().split('T')[0]; 

        // NOTIFICAÇÃO 1: CAIXA
        if (configuracoesGlobais.notificacaoCaixaAtiva && configuracoesGlobais.horarioFechamentoCaixa === horaAtual) {
           const chaveCaixa = `@NotificacaoCaixa_${dataHoje}`;
           if (!localStorage.getItem(chaveCaixa)) {
              new Notification("💰 Fechamento de Caixa", { body: "Chegou a hora de conferir e fechar o caixa do dia!" });
              localStorage.setItem(chaveCaixa, 'true');
           }
        }

        // NOTIFICAÇÃO 2: PRÓXIMO ATENDIMENTO DA AGENDA
        if (configuracoesGlobais.notificacaoAgendaAtiva && configuracoesGlobais.minutosAvisoPrevioAgenda) {
           const minutosAviso = Number(configuracoesGlobais.minutosAvisoPrevioAgenda);

           agendamentosHoje.forEach(ag => {
              const horaAgendamento = new Date(ag.dataHora);
              const diferencaMs = horaAgendamento.getTime() - agora.getTime();
              const diffMinutos = Math.round(diferencaMs / 60000); 

              if (diffMinutos === minutosAviso || diffMinutos === (minutosAviso - 1)) {
                 const chaveAgenda = `@NotificacaoAgenda_${ag.id}`;
                 if (!localStorage.getItem(chaveAgenda)) {
                    new Notification(`Próximo Atendimento: ${ag.clienteNome}`, {
                       body: `Serviço: ${ag.servicoNome}\nProfissional: ${ag.funcionarioEmail || 'Não Atribuído'}\nHorário: ${ag.dataHora.split('T')[1]}`
                    });
                    localStorage.setItem(chaveAgenda, 'true');
                 }
              }
           });
        }

        // NOTIFICAÇÃO 3: DÍVIDAS / CONTAS A PAGAR
        if (configuracoesGlobais.notificacaoDividasAtiva && configuracoesGlobais.horariosLembreteDivida && contasVencidas.length > 0) {
          const horariosLembrete: string[] = configuracoesGlobais.horariosLembreteDivida;
          
          if (horariosLembrete.includes(horaAtual)) {
            // Chave única para não disparar 2x no mesmo minuto
            const chaveDivida = `@NotificacaoDivida_${dataHoje}_${horaAtual}`;
            if (!localStorage.getItem(chaveDivida)) {
              new Notification("🔴 Lembrete de Contas a Pagar", {
                 body: `Você possui ${contasVencidas.length} conta(s) vencendo hoje ou atrasadas. Verifique o seu Caixa!`
              });
              localStorage.setItem(chaveDivida, 'true');
            }
          }
        }

    }, 30000); 

    return () => clearInterval(intervalo);
  }, [configuracoesGlobais, agendamentosHoje, contasVencidas]);

  useEffect(() => {
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.style.maxWidth = '100%';
      rootElement.style.width = '100%';
      rootElement.style.margin = '0';
      rootElement.style.padding = '0';
      rootElement.style.overflowX = 'hidden';
    }
    if (document.body) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100%';
      document.body.style.overflowX = 'hidden';
    }
    if (document.documentElement) {
      document.documentElement.style.overflowX = 'hidden';
    }
  }, []);

  useEffect(() => {
    const lidarComRedimensionamento = () => {
      const largura = window.innerWidth;
      const mobile = largura < 768;
      setIsMobile(mobile);
      
      if (mobile) {
        setMenuExpandido(false);
      } else if (largura >= 768 && largura < 1024) {
        setMenuExpandido(false);
      } else {
        setMenuExpandido(true);
      }
    };

    window.addEventListener('resize', lidarComRedimensionamento);
    return () => window.removeEventListener('resize', lidarComRedimensionamento);
  }, []);

  useEffect(() => {
    if (perfil?.role === 'super_admin') setAbaAtiva('admin');
  }, [perfil]);

  async function fazerLogout() {
    try {
      await signOut(auth);
      showToast('Sessão encerrada com sucesso', 'success');
    } catch (error: any) {
      showToast('Erro ao encerrar sessão: ' + error.message, 'error');
    }
  }

  const estiloBotaoMenu = (aba: string) => ({
    width: '100%', 
    padding: '12px', 
    marginBottom: '10px',
    backgroundColor: abaAtiva === aba ? '#34495e' : 'transparent',
    color: 'white', 
    border: 'none', 
    borderRadius: '8px',
    textAlign: menuExpandido ? 'left' as const : 'center' as const,
    cursor: 'pointer', 
    fontSize: '16px', 
    fontWeight: abaAtiva === aba ? 'bold' : 'normal',
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: menuExpandido ? 'flex-start' : 'center', 
    gap: '10px',
    boxSizing: 'border-box' as const,
    transition: 'all 0.2s ease',
    position: 'relative' as const
  });

  const mudarAba = (aba: any) => {
    setAbaAtiva(aba);
    if (isMobile) setMenuExpandido(false);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, backgroundColor: '#f5f6fa', overflow: 'hidden', boxSizing: 'border-box' }}>
      
      {/* OVERLAY MOBILE: Fundo escurecido ao abrir o menu em telas pequenas */}
      {isMobile && menuExpandido && (
        <div 
          onClick={() => setMenuExpandido(false)} 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40, animation: 'fadeIn 0.3s ease' }} 
        />
      )}

      {/* MENU LATERAL */}
      <aside style={{ 
        width: menuExpandido ? '260px' : (isMobile ? '0px' : '75px'),
        backgroundColor: '#2c3e50', 
        color: 'white', 
        padding: menuExpandido || !isMobile ? '20px 12px' : '0px', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        height: '100vh', 
        zIndex: 50, 
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        boxShadow: isMobile ? '4px 0 15px rgba(0,0,0,0.3)' : 'none'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: menuExpandido ? 'space-between' : 'center', marginBottom: '30px', padding: '0 5px' }}>
            {menuExpandido && (
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: perfil?.role === 'super_admin' ? '#9b59b6' : '#fff', whiteSpace: 'nowrap', animation: 'fadeIn 0.3s ease' }}>
                {perfil?.role === 'super_admin' ? 'Master Admin' : 'Painel Gestor'}
              </h2>
            )}
            <button 
              onClick={() => setMenuExpandido(!menuExpandido)} 
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '22px', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {isMobile && menuExpandido ? '✕' : '☰'}
            </button>
          </div>

          {perfil?.role !== 'super_admin' && (
            <nav style={{ display: 'flex', flexDirection: 'column' }}>
              <button 
                style={estiloBotaoMenu('agenda')} 
                onClick={() => mudarAba('agenda')}
                onMouseOver={(e) => abaAtiva !== 'agenda' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                onMouseOut={(e) => abaAtiva !== 'agenda' && (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>📅</span> {menuExpandido && <span style={{ animation: 'fadeIn 0.2s ease' }}>Agenda</span>}
              </button>
              
              {perfil?.role === 'chefe' && (
                <>
                  <button 
                    style={estiloBotaoMenu('caixa')} 
                    onClick={() => mudarAba('caixa')}
                    onMouseOver={(e) => abaAtiva !== 'caixa' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                    onMouseOut={(e) => abaAtiva !== 'caixa' && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>💰</span> {menuExpandido && <span style={{ animation: 'fadeIn 0.2s ease' }}>Caixa</span>}
                    {/* BOLINHA VERMELHA (Só mostra se tem dívida E a aba não é o caixa) */}
                    {contasVencidas.length > 0 && abaAtiva !== 'caixa' && (
                      <span style={{ position: 'absolute', top: '8px', right: '8px', width: '10px', height: '10px', backgroundColor: '#e74c3c', borderRadius: '50%', boxShadow: '0 0 5px rgba(231, 76, 60, 0.8)' }} title="Contas Pendentes!" />
                    )}
                  </button>
                  <button 
                    style={estiloBotaoMenu('estoque')} 
                    onClick={() => mudarAba('estoque')}
                    onMouseOver={(e) => abaAtiva !== 'estoque' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                    onMouseOut={(e) => abaAtiva !== 'estoque' && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>📦</span> {menuExpandido && <span style={{ animation: 'fadeIn 0.2s ease' }}>Estoque</span>}
                  </button>
                  <button 
                    style={estiloBotaoMenu('servicos')} 
                    onClick={() => mudarAba('servicos')}
                    onMouseOver={(e) => abaAtiva !== 'servicos' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                    onMouseOut={(e) => abaAtiva !== 'servicos' && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>🛠️</span> {menuExpandido && <span style={{ animation: 'fadeIn 0.2s ease' }}>Serviços</span>}
                  </button>
                  <button 
                    style={estiloBotaoMenu('funcionarios')} 
                    onClick={() => mudarAba('funcionarios')}
                    onMouseOver={(e) => abaAtiva !== 'funcionarios' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                    onMouseOut={(e) => abaAtiva !== 'funcionarios' && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>👥</span> {menuExpandido && <span style={{ animation: 'fadeIn 0.2s ease' }}>Equipe</span>}
                  </button>
                  <button 
                    style={estiloBotaoMenu('config')} 
                    onClick={() => mudarAba('config')}
                    onMouseOver={(e) => abaAtiva !== 'config' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                    onMouseOut={(e) => abaAtiva !== 'config' && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>⚙️</span> {menuExpandido && <span style={{ animation: 'fadeIn 0.2s ease' }}>Configurações</span>}
                  </button>
                </>
              )}
            </nav>
          )}

          {perfil?.role === 'super_admin' && menuExpandido && (
            <div style={{ padding: '12px', background: '#34495e', borderRadius: '6px', textAlign: 'center', fontSize: '14px', color: '#9b59b6', fontWeight: 'bold', animation: 'fadeIn 0.3s ease' }}>
              👑 Controle Global
            </div>
          )}
        </div>

        {(menuExpandido || !isMobile) && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuExpandido && (
              <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#ecf0f1', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', animation: 'fadeIn 0.3s ease' }}>
                👤 {perfil?.nome}
              </p>
            )}
            <button 
              onClick={fazerLogout} 
              style={{ width: '100%', padding: '12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c0392b'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e74c3c'}
            >
              {menuExpandido ? 'Desconectar' : '🚪'}
            </button>
          </div>
        )}
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main style={{ 
        flex: 1, 
        padding: isMobile ? '15px' : '30px', 
        overflowY: 'auto', 
        overflowX: 'hidden', 
        height: '100vh',
        boxSizing: 'border-box',
        backgroundColor: '#f5f6fa',
        position: 'relative'
      }}>
        
        {/* Estilos Globais de Animação para este componente */}
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes fadeInContent { 
            from { opacity: 0; transform: translateY(10px); } 
            to { opacity: 1; transform: translateY(0); } 
          }
        `}</style>

        {isMobile && !menuExpandido && (
          <button 
            onClick={() => setMenuExpandido(true)}
            style={{ position: 'fixed', top: '15px', left: '15px', zIndex: 30, background: '#ffffff', color: '#2c3e50', border: '1px solid #dfe6e9', borderRadius: '8px', padding: '10px 15px', fontSize: '18px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
          >
            ☰ <span>Menu</span>
          </button>
        )}

        <div style={{ marginTop: isMobile && !menuExpandido ? '60px' : '0', width:  '100%', animation: 'fadeInContent 0.4s ease-out' }}>
          {abaAtiva === 'agenda' && perfil?.role !== 'super_admin' && <ModuloAgenda perfil={perfil} />}
          {abaAtiva === 'caixa' && perfil?.role === 'chefe' && <ModuloCaixa perfil={perfil} />}
          {abaAtiva === 'estoque' && perfil?.role === 'chefe' && <ModuloEstoque perfil={perfil} />}
          {abaAtiva === 'servicos' && perfil?.role === 'chefe' && <ModuloServicos perfil={perfil} />}
          {abaAtiva === 'funcionarios' && perfil?.role === 'chefe' && <ModuloFuncionarios perfil={perfil} />}
          {abaAtiva === 'admin' && perfil?.role === 'super_admin' && <ModuloSuperAdmin />}
          {abaAtiva === 'config' && perfil?.role === 'chefe' && <ModuloConfiguracoes perfil={perfil} />}
        </div>
      </main>
    </div>
  );
}