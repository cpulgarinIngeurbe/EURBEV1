// Configuracion web de Firebase. Es publica por diseño: la seguridad la ponen
// las reglas de Firestore y el inicio de sesion. Los valores reales se ponen al
// crear el proyecto (Task 13). Con 'demo-eurbe' solo funciona contra emuladores.
window.EURBE_FIREBASE_CONFIG = {
  apiKey: 'demo-key',
  authDomain: 'demo-eurbe.firebaseapp.com',
  projectId: 'demo-eurbe',
};
// Version del SDK compat cargado desde gstatic en index.html
window.EURBE_FIREBASE_SDK = '12.19.0';
