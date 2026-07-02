// src/pages/Login.tsx

import { useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
// Trocamos os métodos de redirecionamento pelo método de Pop-up limpo
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const provedorGoogle = new GoogleAuthProvider();
// Mantemos o pedido de permissão para ler e escrever na agenda do usuário
provedorGoogle.addScope('https://www.googleapis.com/auth/calendar.events');

export function Login() {
  const navegar = useNavigate();

  async function fazerLoginComGoogle() {
    try {
      // Forçamos o Google a sempre exibir a tela de escolha de conta e permissão
      provedorGoogle.setCustomParameters({ prompt: 'consent' }); 
      
      // Abre a janela flutuante de login
      const resultado = await signInWithPopup(auth, provedorGoogle);
      
      // Como o pop-up resolve a autenticação na mesma hora, 
      // pegamos o "Crachá" (Token) direto do resultado da promessa
      const credenciais = GoogleAuthProvider.credentialFromResult(resultado);
      const token = credenciais?.accessToken;
      
      if (token) {
        sessionStorage.setItem('googleToken', token);
        console.log("Crachá do Google Calendar capturado com sucesso via Pop-up!");
      }

      // Com o login feito e o token salvo, jogamos o usuário para dentro do painel
      navegar('/painel');

    } catch (erro: any) {
      console.error("Erro ao fazer login com Pop-up:", erro);
      alert("Erro ao fazer login: " + erro.message);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#2c3e50' }}>
      <button 
        onClick={fazerLoginComGoogle}
        style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', borderRadius: '8px', border: 'none', backgroundColor: 'white', color: '#333', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
      >
        Entrar com o Google
      </button>
    </div>
  );
}