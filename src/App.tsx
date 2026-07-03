// src/App.tsx

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { Login } from './pages/Login';
import { Painel } from './pages/Painel';
import { AgendamentoPublico } from './pages/AgendamentoPublico';

export default function App() {
  // Inicializamos o perfil e o bloqueio buscando do Cache do celular para abrir mais rápido
  const [usuario, setUsuario] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(() => {
    const cache = localStorage.getItem('@App:perfil');
    return cache ? JSON.parse(cache) : null;
  });
  
  const [empresaBloqueada, setEmpresaBloqueada] = useState(() => {
    return localStorage.getItem('@App:bloqueada') === 'true';
  });
  
  // Se já tivermos o perfil no cache, não precisamos mostrar a tela de carregamento!
  const [carregando, setCarregando] = useState(!localStorage.getItem('@App:perfil'));

  useEffect(() => {
    // 1. FORÇAR ATUALIZAÇÃO DO PWA (Bypass no Cache do iOS)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.update(); // Manda o celular buscar o código novo silenciosamente
        }
      });
    }

    // 2. LÓGICA DE AUTENTICAÇÃO COM CACHE
    const desativarAuth = onAuthStateChanged(auth, async (userFirebase) => {
      if (userFirebase) {
        setUsuario(userFirebase);

        try {
          const docRef = doc(db, 'usuarios', userFirebase.email!);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const dadosPerfil = docSnap.data();
            setPerfil(dadosPerfil);
            localStorage.setItem('@App:perfil', JSON.stringify(dadosPerfil)); // Salva no cache

            if (dadosPerfil.role !== 'super_admin' && dadosPerfil.companyId) {
              const empresaRef = doc(db, 'empresas', dadosPerfil.companyId);
              const empresaSnap = await getDoc(empresaRef);
              
              if (empresaSnap.exists()) {
                const bloqueada = empresaSnap.data().statusPgto === 'bloqueado';
                setEmpresaBloqueada(bloqueada);
                localStorage.setItem('@App:bloqueada', bloqueada.toString());
              }
            }
          } else {
            setPerfil(null);
            localStorage.removeItem('@App:perfil');
          }
        } catch (erro) {
          console.error("Erro ao verificar acesso:", erro);
        } finally {
          setCarregando(false);
        }

      } else {
        setUsuario(null);
        setPerfil(null);
        setEmpresaBloqueada(false);
        localStorage.removeItem('@App:perfil');
        localStorage.removeItem('@App:bloqueada');
        setCarregando(false);
      }
    });

    return () => desativarAuth();
  }, []);

  if (carregando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f5f6fa', color: '#2c3e50' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #bdc3c7', borderTop: '4px solid #2980b9', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '15px' }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <strong>Iniciando o Sistema...</strong>
      </div>
    );
  }

  if (empresaBloqueada) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#c0392b', color: 'white', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', margin: '0 0 10px 0' }}>🛑</h1>
        <h2>Acesso Suspenso</h2>
        <p style={{ fontSize: '18px', maxWidth: '500px' }}>
          O acesso da sua empresa à plataforma foi temporariamente bloqueado por pendências financeiras. 
          Por favor, entre em contato com o suporte para regularizar a sua assinatura.
        </p>
        <button 
          onClick={() => signOut(auth)}
          style={{ marginTop: '30px', padding: '10px 20px', backgroundColor: 'transparent', border: '2px solid white', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Sair da Conta
        </button>
      </div>
    );
  }

  if (usuario && !perfil) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <h2>Acesso Negado</h2>
        <p>O seu e-mail não está cadastrado em nenhuma empresa.</p>
        <button onClick={() => signOut(auth)}>Sair</button>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={usuario ? <Navigate to="/painel" /> : <Login />} />
        <Route path="/painel" element={usuario ? <Painel perfil={perfil} /> : <Navigate to="/" />} />
        <Route path="/agendar/:companyId" element={<AgendamentoPublico />} />
      </Routes>
    </BrowserRouter>
  );
}