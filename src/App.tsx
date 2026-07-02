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
  const [usuario, setUsuario] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  
  // 1. NOVA MEMÓRIA: Guarda se a empresa do usuário está devendo ou não
  const [empresaBloqueada, setEmpresaBloqueada] = useState(false);

  useEffect(() => {
    const desativarAuth = onAuthStateChanged(auth, async (userFirebase) => {
      if (userFirebase) {
        setUsuario(userFirebase);

        // O CINTO DE SEGURANÇA: try...catch garante que a tela nunca fique branca
        try {
          const docRef = doc(db, 'usuarios', userFirebase.email!);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const dadosPerfil = docSnap.data();
            setPerfil(dadosPerfil);

            if (dadosPerfil.role !== 'super_admin' && dadosPerfil.companyId) {
              const empresaRef = doc(db, 'empresas', dadosPerfil.companyId);
              const empresaSnap = await getDoc(empresaRef);
              
              if (empresaSnap.exists()) {
                if (empresaSnap.data().statusPgto === 'bloqueado') {
                  setEmpresaBloqueada(true);
                } else {
                  setEmpresaBloqueada(false);
                }
              }
            }
          } else {
            setPerfil(null);
          }
        } catch (erro) {
          console.error("Erro ao verificar acesso:", erro);
          // Mesmo com erro, não deixamos a empresa bloqueada por acidente
          setEmpresaBloqueada(false); 
        } finally {
          // O finally garante que, dando certo ou errado, a tela de "Carregando" saia
          setCarregando(false);
        }

      } else {
        setUsuario(null);
        setPerfil(null);
        setEmpresaBloqueada(false);
        setCarregando(false);
      }
    });

    return () => desativarAuth();
  }, []);

  if (carregando) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>Carregando sistema...</div>;
  }

  // 2. A TELA DA VERGONHA (Bloqueio por falta de pagamento)
  // Se a armadilha foi ativada, a gente retorna esta tela E PARA O CÓDIGO AQUI. 
  // O usuário nem sequer chega a carregar as rotas do Painel.
  if (empresaBloqueada) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#c0392b', color: 'white', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', margin: '0 0 10px 0' }}>🛑</h1>
        <h2>Acesso Suspenso</h2>
        <p style={{ fontSize: '18px', maxWidth: '500px' }}>
          O acesso da sua empresa à plataforma foi temporariamente bloqueado por pendências financeiras. 
          Por favor, entre em contato com o suporte para regularizar a sua assinatura.
        </p>
        {/* É VITAL ter um botão de Sair aqui, senão o usuário fica preso num limbo eterno e não consegue logar com outra conta! */}
        <button 
          onClick={() => signOut(auth)}
          style={{ marginTop: '30px', padding: '10px 20px', backgroundColor: 'transparent', border: '2px solid white', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Sair da Conta
        </button>
      </div>
    );
  }

  // Se a conta não existir no banco de dados (ex: e-mail de um curioso que tentou logar)
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
        {/* Se o usuário estiver logado, redireciona para o painel. Se não, mostra a tela de Login */}
        <Route path="/" element={usuario ? <Navigate to="/painel" /> : <Login />} />
        
        {/* Se estiver logado, entra no Painel. Se não, volta pro Login */}
        <Route path="/painel" element={usuario ? <Painel perfil={perfil} /> : <Navigate to="/" />} />
        <Route path="/agendar/:companyId" element={<AgendamentoPublico />} />
      </Routes>
    </BrowserRouter>
  );
}