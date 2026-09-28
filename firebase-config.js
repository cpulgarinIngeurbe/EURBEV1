// Configuracion web de Firebase. Es publica por diseño: la seguridad la ponen
// las reglas de Firestore y el inicio de sesion.
// En localhost se usa el proyecto de pruebas 'demo-eurbe', que solo existe en
// los emuladores (nube.js se conecta a ellos): las pruebas nunca tocan datos reales.
window.EURBE_FIREBASE_CONFIG = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? { apiKey: 'demo-key', authDomain: 'demo-eurbe.firebaseapp.com', projectId: 'demo-eurbe' }
  : {
      apiKey: 'AIzaSyCcBj2MzswlcQze6FuEMDyQmSPWy29JU_8',
      authDomain: 'eurbe-piloto.firebaseapp.com',
      projectId: 'eurbe-piloto',
      storageBucket: 'eurbe-piloto.firebasestorage.app',
      messagingSenderId: '115891677618',
      appId: '1:115891677618:web:b9ab77e7c5c844073a5cab',
    };
// Version del SDK compat cargado desde gstatic en index.html
window.EURBE_FIREBASE_SDK = '12.19.0';
