// src/config/firebase.ts

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; 

// Cole aqui o objeto que você copiou lá do site do Firebase!
const firebaseConfig = {
  apiKey: "AIzaSyDz-RJduYdk4pOHCkZEQ-ffLpuWAtxKR34",
  authDomain: "agendamentos-saas.firebaseapp.com",
  projectId: "agendamentos-saas",
  storageBucket: "agendamentos-saas.firebasestorage.app",
  messagingSenderId: "26175655958",
  appId: "1:26175655958:web:b44192eb0718a8ff6fa537"
};

// Aqui nós ligamos o Firebase
const app = initializeApp(firebaseConfig);

// Exportamos as ferramentas de Login para usar na nossa tela
export const auth = getAuth(app);
export const db = getFirestore(app);


// enableIndexedDbPersistence(db).catch((err) => {
//     if (err.code == 'failed-precondition') {
//         console.warn("Múltiplas abas abertas, persistência só funciona em uma.");
//     } else if (err.code == 'unimplemented') {
//         console.warn("Browser não suporta persistência.");
//     }
// });


export const provedorGoogle = new GoogleAuthProvider();
provedorGoogle.addScope('https://www.googleapis.com/auth/calendar.events');