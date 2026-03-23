// Your Firebase config (paste exactly)
console.log("JS is running");
const firebaseConfig = {
  apiKey: "AIzaSyBphlSXEJy_YeofeM3WWA-yHm59MqAIvd4",
  authDomain: "digital-token-system-8b988.firebaseapp.com",
  projectId: "digital-token-system-8b988",
  storageBucket: "digital-token-system-8b988.firebasestorage.app",
  messagingSenderId: "767502141766",
  appId: "1:767502141766:web:f4f295f69b3c1944cabd47"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("Firebase initialized");

// Reference
const tokenRef = db.collection("token").doc("data");

// Create initial data
tokenRef.get().then((doc) => {
    if (!doc.exists) {
        tokenRef.set({ token: 0, current: 0 });
    }
});

// Real-time update
tokenRef.onSnapshot((doc) => {
    let data = doc.data();
    document.getElementById("currentToken").innerText = data.current;
    document.getElementById("waiting").innerText = data.token - data.current;
});

// Generate token
function generateToken() {
    tokenRef.get().then((doc) => {
        let data = doc.data();
        let newToken = data.token + 1;

        tokenRef.update({ token: newToken });
        document.getElementById("userToken").innerText = newToken;
    });
}

// Next token
function nextToken() {
    tokenRef.get().then((doc) => {
        let data = doc.data();
        let newCurrent = data.current + 1;

        tokenRef.update({ current: newCurrent });

        let msg = new SpeechSynthesisUtterance("Token " + newCurrent + " please come");
        speechSynthesis.speak(msg);
    });
    function generateToken() {
    console.log("Button clicked");

    tokenRef.get().then((doc) => {
        let data = doc.data();
        let newToken = data.token + 1;

        tokenRef.update({ token: newToken });
        document.getElementById("userToken").innerText = newToken;
    });
}
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("Service Worker Registered"));
}
}