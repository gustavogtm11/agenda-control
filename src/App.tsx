// src/App.tsx

import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// IMPORTAÇÃO NOVA PARA O PWA
import { useRegisterSW } from 'virtual:pwa-register/react';

import { Login } from './pages/Login';
import { Painel } from './pages/Painel';
import { AgendamentoPublico } from './pages/AgendamentoPublico';

// ============================================================================
// TOAST CONTEXT PARA SUBSTITUIR ALERT() GLOBALMENTE
// ============================================================================
type ToastType = 'success' | 'error' | 'info';

interface ToastContextProps {
  showToast: (msg: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextProps>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  const showToast = (msg: string, type: ToastType = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div style={{
          position: 'fixed', 
          bottom: '20px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? '#e74c3c' : toast.type === 'success' ? '#2ecc71' : '#34495e',
          color: 'white', 
          padding: '12px 24px', 
          borderRadius: '8px', 
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', 
          transition: 'all 0.3s ease',
          fontWeight: 'bold', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontFamily: 'sans-serif'
        }}>
          {toast.type === 'error' ? '❌' : toast.type === 'success' ? '✅' : 'ℹ️'}
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ============================================================================
// COMPONENTE DE PROMPT DE INSTALAÇÃO PWA
// ============================================================================
function PwaPrompt({ promptEvent, onDismiss }: { promptEvent: any, onDismiss: () => void }) {
  if (!promptEvent) return null;

  const handleInstall = () => {
    promptEvent.prompt();
    promptEvent.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('Usuário aceitou a instalação do PWA.');
      }
      onDismiss();
    });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', zIndex: 10000, padding: '20px', fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: 'white', padding: '30px', borderRadius: '12px',
        maxWidth: '400px', width: '100%', textAlign: 'center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50', fontSize: '22px' }}>Instalar Aplicativo 📱</h3>
        <p style={{ color: '#7f8c8d', marginBottom: '25px', lineHeight: '1.5' }}>
          Adicione nosso sistema à sua tela inicial para uma experiência mais rápida, em tela cheia e com acesso otimizado!
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onDismiss} style={{
            padding: '12px 20px', border: '1px solid #bdc3c7', background: 'transparent',
            borderRadius: '6px', cursor: 'pointer', color: '#7f8c8d', fontWeight: 'bold', flex: 1,
            transition: 'background 0.2s'
          }}>
            Agora não
          </button>
          <button onClick={handleInstall} style={{
            padding: '12px 20px', border: 'none', background: '#3498db',
            borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', flex: 1,
            transition: 'background 0.2s', boxShadow: '0 2px 6px rgba(52, 152, 219, 0.4)'
          }}>
            Instalar
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

// ============================================================================
// APP PRINCIPAL
// ============================================================================
export default function App() {
  const [usuario, setUsuario] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(() => {
    const cache = localStorage.getItem('@App:perfil');
    return cache ? JSON.parse(cache) : null;
  });
  
  const [empresaBloqueada, setEmpresaBloqueada] = useState(() => {
    return localStorage.getItem('@App:bloqueada') === 'true';
  });
  
  const [authLoading, setAuthLoading] = useState(true);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);

  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showPwaPrompt, setShowPwaPrompt] = useState(false);

  // 1. GERENCIAMENTO OFICIAL DO PWA (Substitui o registo manual que causava o erro)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Erro ao registrar SW:', error);
    },
  });

  // Mostra o alerta para recarregar se houver atualização (Substitui o evento updatefound)
  useEffect(() => {
    if (needRefresh) {
      if (window.confirm("Uma nova versão do sistema acabou de ser publicada! O aplicativo será recarregado para atualizar.")) {
        updateServiceWorker(true);
      } else {
        setNeedRefresh(false);
      }
    }
  }, [needRefresh, updateServiceWorker, setNeedRefresh]);

  useEffect(() => {
    // 2. CAPTURAR EVENTO DE INSTALAÇÃO DO APP NATIVO (Mantém-se igual)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!sessionStorage.getItem('@App:pwaPromptDismissed')) {
         setShowPwaPrompt(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUsuario(user);
        
        if (!perfil) setCarregandoPerfil(true);

        try {
          const docRef = doc(db, 'usuarios', user.email || '');
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const dadosPerfil = docSnap.data();
            setPerfil(dadosPerfil);
            localStorage.setItem('@App:perfil', JSON.stringify(dadosPerfil));
            
            if (dadosPerfil.companyId) {
              const empresaRef = doc(db, 'empresas', dadosPerfil.companyId);
              const empresaSnap = await getDoc(empresaRef);
              if (empresaSnap.exists()) {
                const bloqueada = empresaSnap.data().bloqueada === true;
                setEmpresaBloqueada(bloqueada);
                localStorage.setItem('@App:bloqueada', String(bloqueada));
              }
            }
          } else {
            setPerfil(null);
            localStorage.removeItem('@App:perfil');
          }
        } catch (error) {
          console.error("Erro ao buscar perfil:", error);
        } finally {
          setCarregandoPerfil(false);
          setAuthLoading(false);
        }
      } else {
        setUsuario(null);
        setPerfil(null);
        localStorage.removeItem('@App:perfil');
        localStorage.removeItem('@App:bloqueada');
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, [perfil]);

  const dismissPwaPrompt = () => {
    setShowPwaPrompt(false);
    sessionStorage.setItem('@App:pwaPromptDismissed', 'true');
  };

  if (authLoading || carregandoPerfil) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f5f6fa' }}>
        <div style={{ width: '60px', height: '60px', border: '4px solid #e1e8ed', borderTop: '4px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#7f8c8d', fontWeight: 'bold', fontFamily: 'sans-serif', fontSize: '16px' }}>Autenticando...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (empresaBloqueada) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#e74c3c', color: 'white', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '64px', margin: '0 0 15px 0' }}>🛑</h1>
        <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>Acesso Suspenso</h2>
        <p style={{ fontSize: '18px', maxWidth: '500px', lineHeight: '1.6' }}>
          O acesso da sua empresa à plataforma foi temporariamente bloqueado por pendências financeiras. 
          Por favor, entre em contato com o suporte para regularizar a sua assinatura.
        </p>
        <button 
          onClick={() => signOut(auth)}
          style={{ marginTop: '35px', padding: '12px 24px', backgroundColor: 'transparent', border: '2px solid white', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', transition: 'background 0.2s' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          Sair da Conta
        </button>
      </div>
    );
  }

  if (usuario && !perfil) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f5f6fa', textAlign: 'center', padding: '20px' }}>
        <h2 style={{ color: '#2c3e50', marginBottom: '15px' }}>Acesso Negado 🚫</h2>
        <p style={{ color: '#7f8c8d', fontSize: '16px', marginBottom: '25px', maxWidth: '400px' }}>
          O seu e-mail não está cadastrado ou vinculado a nenhuma empresa no sistema.
        </p>
        <button 
          onClick={() => signOut(auth)} 
          style={{ padding: '12px 30px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 2px 6px rgba(231, 76, 60, 0.4)' }}
        >
          Voltar ao Login
        </button>
      </div>
    );
  }

  return (
    <ToastProvider>
      {showPwaPrompt && <PwaPrompt promptEvent={installPrompt} onDismiss={dismissPwaPrompt} />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={usuario ? <Navigate to="/painel" /> : <Login />} />
          <Route path="/painel" element={usuario ? <Painel perfil={perfil} /> : <Navigate to="/" />} />
          <Route path="/agendar/:companyId" element={<AgendamentoPublico />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}