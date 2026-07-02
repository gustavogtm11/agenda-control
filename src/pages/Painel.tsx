// src/pages/Painel.tsx

import { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

import { ModuloAgenda } from '../components/ModuloAgenda';
import { ModuloCaixa } from '../components/ModuloCaixa';
import { ModuloEstoque } from '../components/ModuloEstoque';
import { ModuloServicos } from '../components/ModuloServicos';
import { ModuloFuncionarios } from '../components/ModuloFuncionarios';
import { ModuloSuperAdmin } from '../components/ModuloSuperAdmin';

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

  // Força o navegador a bloquear totalmente qualquer tentativa de scroll lateral (eixo X)
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

  function fazerLogout() { 
    signOut(auth); 
  }

  const estiloBotaoMenu = (aba: string) => ({
    width: '100%', 
    padding: '12px', 
    marginBottom: '10px',
    backgroundColor: abaAtiva === aba ? '#34495e' : 'transparent',
    color: 'white', 
    border: 'none', 
    borderRadius: '6px',
    textAlign: menuExpandido ? 'left' as const : 'center' as const,
    cursor: 'pointer', 
    fontSize: '16px', 
    fontWeight: abaAtiva === aba ? 'bold' : 'normal',
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: menuExpandido ? 'flex-start' : 'center', 
    gap: '10px',
    boxSizing: 'border-box' as const,
    transition: 'background-color 0.2s'
  });

  const mudarAba = (aba: any) => {
    setAbaAtiva(aba);
    if (isMobile) setMenuExpandido(false);
  };

  return (
    // Trocado width: '100vw' para '100%' para evitar estouro matemático da barra vertical
    <div style={{ display: 'flex', height: '100vh', width: '100%', fontFamily: 'sans-serif', margin: 0, backgroundColor: '#f5f6fa', overflow: 'hidden', boxSizing: 'border-box' }}>
      
      {isMobile && menuExpandido && (
        <div 
          onClick={() => setMenuExpandido(false)} 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} 
        />
      )}

      {/* MENU LATERAL */}
      <aside style={{ 
        width: menuExpandido ? '260px' : (isMobile ? '0px' : '70px'),
        backgroundColor: '#2c3e50', 
        color: 'white', 
        padding: menuExpandido || !isMobile ? '20px 12px' : '0px', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between',
        transition: 'all 0.3s ease-in-out',
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        height: '100vh', 
        zIndex: 50, 
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: menuExpandido ? 'space-between' : 'center', marginBottom: '30px', padding: '0 5px' }}>
            {menuExpandido && (
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: perfil?.role === 'super_admin' ? '#9b59b6' : '#fff', whiteSpace: 'nowrap' }}>
                {perfil?.role === 'super_admin' ? 'Master Admin' : 'Painel Gestor'}
              </h2>
            )}
            <button 
              onClick={() => setMenuExpandido(!menuExpandido)} 
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '22px', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isMobile && menuExpandido ? '✕' : '☰'}
            </button>
          </div>

          {perfil?.role !== 'super_admin' && (
            <nav style={{ display: 'flex', flexDirection: 'column' }}>
              <button style={estiloBotaoMenu('agenda')} onClick={() => mudarAba('agenda')}>
                <span>📅</span> {menuExpandido && <span>Agenda</span>}
              </button>
              {perfil?.role === 'chefe' && (
                <>
                  <button style={estiloBotaoMenu('caixa')} onClick={() => mudarAba('caixa')}>
                    <span>💰</span> {menuExpandido && <span>Caixa</span>}
                  </button>
                  <button style={estiloBotaoMenu('estoque')} onClick={() => mudarAba('estoque')}>
                    <span>📦</span> {menuExpandido && <span>Estoque</span>}
                  </button>
                  <button style={estiloBotaoMenu('servicos')} onClick={() => mudarAba('servicos')}>
                    <span>🛠️</span> {menuExpandido && <span>Serviços</span>}
                  </button>
                  <button style={estiloBotaoMenu('funcionarios')} onClick={() => mudarAba('funcionarios')}>
                    <span>👥</span> {menuExpandido && <span>Equipe</span>}
                  </button>
                  <button style={estiloBotaoMenu('config')} onClick={() => mudarAba('config')}>
                    <span>⚙️</span> {menuExpandido && <span>Configurações</span>}
                  </button>
                </>
              )}
            </nav>
          )}

          {perfil?.role === 'super_admin' && menuExpandido && (
            <div style={{ padding: '12px', background: '#34495e', borderRadius: '6px', textAlign: 'center', fontSize: '14px', color: '#9b59b6', fontWeight: 'bold' }}>
              👑 Controle Global
            </div>
          )}
        </div>

        {(menuExpandido || !isMobile) && (
          <div style={{ borderTop: '1px solid #34495e', paddingTop: '15px', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuExpandido && (
              <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#ecf0f1', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                👤 {perfil?.nome}
              </p>
            )}
            <button 
              onClick={fazerLogout} 
              style={{ width: '100%', padding: '12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {menuExpandido ? 'Desconectar' : '🚪'}
            </button>
          </div>
        )}
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      {/* Aplicado overflowX: 'hidden' aqui também para anular qualquer vazamento dos formulários */}
      <main style={{ 
        flex: 1, 
        padding: isMobile ? '15px' : '30px', 
        overflowY: 'auto', 
        overflowX: 'hidden', 
        height: '100vh',
        boxSizing: 'border-box',
        backgroundColor: '#f5f6fa'
      }}>
        
        {isMobile && !menuExpandido && (
          <button 
            onClick={() => setMenuExpandido(true)}
            style={{ position: 'fixed', top: '15px', left: '15px', zIndex: 30, background: '#2c3e50', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 15px', fontSize: '18px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
          >
            ☰ Menu
          </button>
        )}

        <div style={{ marginTop: isMobile && !menuExpandido ? '50px' : '0', width: '100%' }}>
          {abaAtiva === 'agenda' && perfil?.role !== 'super_admin' && <ModuloAgenda perfil={perfil} />}
          {abaAtiva === 'caixa' && perfil?.role === 'chefe' && <ModuloCaixa perfil={perfil} />}
          {abaAtiva === 'estoque' && perfil?.role === 'chefe' && <ModuloEstoque perfil={perfil} />}
          {abaAtiva === 'servicos' && perfil?.role === 'chefe' && <ModuloServicos perfil={perfil} />}
          {abaAtiva === 'funcionarios' && perfil?.role === 'chefe' && <ModuloFuncionarios perfil={perfil} />}
          {abaAtiva === 'admin' && perfil?.role === 'super_admin' && <ModuloSuperAdmin />}
        </div>
      </main>
    </div>
  );
}