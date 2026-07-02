// src/config/firebase.ts

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"; 

// Cole aqui o objeto que você copiou lá do site do Firebase!
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Aqui nós ligamos o Firebase
const app = initializeApp(firebaseConfig);

// Exportamos as ferramentas de Login para usar na nossa tela


export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
    
    export const auth = getAuth(app);

export const provedorGoogle = new GoogleAuthProvider();
provedorGoogle.addScope('https://www.googleapis.com/auth/calendar.events');