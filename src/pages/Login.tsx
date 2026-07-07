// src/pages/Login.tsx

import { useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useToast } from '../App';

const provedorGoogle = new GoogleAuthProvider();
// Mantemos o pedido de permissão para ler e escrever na agenda do usuário
provedorGoogle.addScope('https://www.googleapis.com/auth/calendar.events');

export function Login() {
  const navegar = useNavigate();
  const { showToast } = useToast();

  async function fazerLoginComGoogle() {
    try {
      // Forçamos o Google a sempre exibir a tela de escolha de conta e permissão
      provedorGoogle.setCustomParameters({ prompt: 'consent' }); 
      
      // Abre a janela flutuante de login
      const resultado = await signInWithPopup(auth, provedorGoogle);
      
      // Pegamos o "Crachá" (Token) direto do resultado da promessa
      const credenciais = GoogleAuthProvider.credentialFromResult(resultado);
      const token = credenciais?.accessToken;
      
      if (token) {
        sessionStorage.setItem('googleToken', token);
      }

      // Com o login feito e o token salvo, jogamos o usuário para dentro do painel
      navegar('/painel');

    } catch (erro: any) {
      console.error("Erro ao fazer login com Pop-up:", erro);
      // Substituição do alert() antigo pelo novo sistema de Toast
      showToast("Falha na autenticação: " + erro.message, 'error');
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      {/* Estilos CSS embutidos para hover e animações sem poluir a aplicação global */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 14px 20px;
          font-size: 16px;
          font-weight: 600;
          color: #3c4043;
          background-color: #ffffff;
          border: 1px solid #dadce0;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s, box-shadow 0.2s;
        }
        .login-btn:hover {
          background-color: #f8f9fa;
          box-shadow: 0 1px 3px rgba(60,64,67,0.3);
        }
        .login-btn:active {
          background-color: #f1f3f4;
        }
      `}</style>

      <div style={{
        backgroundColor: '#ffffff',
        padding: '50px 40px',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        animation: 'fadeInUp 0.6s ease-out'
      }}>
        
        {/* LOGO SIMBÓLICA / TÍTULO */}
        <div style={{
          width: '64px',
          height: '64px',
          background: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto',
          color: 'white',
          fontSize: '32px',
          boxShadow: '0 4px 15px rgba(52, 152, 219, 0.4)'
        }}>
          🗓️
        </div>

        <h1 style={{ 
          margin: '0 0 10px 0', 
          color: '#2c3e50', 
          fontSize: '28px', 
          fontWeight: 'bold' 
        }}>
          Gestão Inteligente
        </h1>
        
        <p style={{ 
          margin: '0 0 35px 0', 
          color: '#7f8c8d', 
          fontSize: '15px', 
          lineHeight: '1.5' 
        }}>
          Acesse o seu painel de controle e gerencie sua empresa com facilidade.
        </p>

        {/* BOTÃO GOOGLE */}
        <button onClick={fazerLoginComGoogle} className="login-btn">
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            <path fill="none" d="M0 0h48v48H0z"></path>
          </svg>
          Continuar com o Google
        </button>

        <div style={{ marginTop: '25px', color: '#bdc3c7', fontSize: '13px' }}>
          Ambiente seguro e monitorado 🔒
        </div>
      </div>
    </div>
  );
}