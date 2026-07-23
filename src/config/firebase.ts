import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"; 
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Aqui nós ligamos o Firebase
const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
    
export const auth = getAuth(app);

// 💡 CORREÇÃO AQUI: Força o navegador a lembrar do login mesmo se a aba ou o Chrome forem fechados
setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.error("Erro ao definir persistência de login:", error));

export const provedorGoogle = new GoogleAuthProvider();
provedorGoogle.addScope('https://www.googleapis.com/auth/calendar.events');
export const messaging = getMessaging(app);