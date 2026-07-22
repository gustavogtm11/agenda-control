// public/firebase-messaging-sw.js

// 1. Carrega os scripts do Firebase via CDN (Compatível com Service Workers)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// 2. Inicializa o Firebase
// ⚠️ ATENÇÃO: Substitua pelos valores reais do seu projeto no Firebase Console!
firebase.initializeApp({
  apiKey: "AIzaSyDz-RJduYdk4pOHCkZEQ-ffLpuWAtxKR34",
  authDomain: "agendamentos-saas.firebaseapp.com",
  projectId: "agendamentos-saas",
  storageBucket: "agendamentos-saas.firebasestorage.app",
  messagingSenderId: "26175655958",
  appId: "1:26175655958:web:b44192eb0718a8ff6fa537",
  measurementId: "G-G9S7Q8XY41"
});

// 3. Inicializa o Messaging
const messaging = firebase.messaging();

// 4. Manipula mensagens recebidas em segundo plano (quando a aba/app está fechado)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notificação recebida em segundo plano:', payload);

  const notificationTitle = payload.notification?.title || 'Nova Notificação';
  const notificationOptions = {
    body: payload.notification?.body || 'Você tem uma nova atualização.',
    icon: '/favicon.png' // Certifique-se de que este ícone existe na pasta public
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});