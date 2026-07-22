import { useState, useEffect } from 'react';
import { auth } from '../config/firebase'; 
import { signOut } from 'firebase/auth';
import { useToast } from '../App';

import { ModuloAgenda } from '../components/ModuloAgenda';
import { ModuloCaixa } from '../components/ModuloCaixa';
import { ModuloEstoque } from '../components/ModuloEstoque';
import { ModuloServicos } from '../components/ModuloServicos';
import { ModuloFuncionarios } from '../components/ModuloFuncionarios';
import { ModuloSuperAdmin } from '../components/ModuloSuperAdmin';
import { ModuloConfiguracoes } from '../components/ModuloConfiguracoes';
import { ModuloAutomacaoWhatsApp } from '../components/ModuloAutomacaoWhatsApp';

interface PainelProps {
  perfil: { id?: string; nome: string; companyId: string; role: string; } | null;
}

type AbasType = 'agenda' | 'caixa' | 'estoque' | 'servicos' | 'funcionarios' | 'admin' | 'config' | 'automacao';

export function Painel({ perfil }: PainelProps) {
  const [abaAtiva, setAbaAtiva] = useState<AbasType>('agenda');
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [menuExpandido, setMenuExpandido] = useState(() => {
    const width = window.innerWidth;
    return width >= 1024;
  });

  const { showToast } = useToast();

  // =========================================================================
  // AJUSTES DE LAYOUT E RESPONSIVIDADE
  // =========================================================================
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

  const mudarAba = (aba: AbasType) => {
    setAbaAtiva(aba);
    if (isMobile) setMenuExpandido(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      position: 'fixed',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: '100%', 
      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif", 
      margin: 0, 
      backgroundColor: '#f5f6fa', 
      overflow: 'hidden', 
      boxSizing: 'border-box' 
    }}>
      
      {/* OVERLAY MOBILE */}
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
        height: '100%',
        zIndex: 50, 
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
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
        height: '100%',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        backgroundColor: '#f5f6fa',
        position: 'relative'
      }}>
        
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

        <div style={{ marginTop: isMobile && !menuExpandido ? '60px' : '0', width: '100%', animation: 'fadeInContent 0.4s ease-out' }}>
          {abaAtiva === 'agenda' && perfil?.role !== 'super_admin' && <ModuloAgenda perfil={perfil} />}
          {abaAtiva === 'caixa' && perfil?.role === 'chefe' && <ModuloCaixa perfil={perfil} />}
          {abaAtiva === 'estoque' && perfil?.role === 'chefe' && <ModuloEstoque perfil={perfil} />}
          {abaAtiva === 'servicos' && perfil?.role === 'chefe' && <ModuloServicos perfil={perfil} />}
          {abaAtiva === 'funcionarios' && perfil?.role === 'chefe' && <ModuloFuncionarios perfil={perfil} />}
          {abaAtiva === 'admin' && perfil?.role === 'super_admin' && <ModuloSuperAdmin />}
          {abaAtiva === 'config' && perfil?.role === 'chefe' && <ModuloConfiguracoes perfil={perfil} />}
          {abaAtiva === 'automacao' && perfil?.role === 'chefe' && <ModuloAutomacaoWhatsApp perfil={perfil} />}
        </div>
      </main>
    </div>
  );
}