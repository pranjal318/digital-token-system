console.log("Smart Queue V2 is running");

const firebaseConfig = {
  apiKey: "AIzaSyBphlSXEJy_YeofeM3WWA-yHm59MqAIvd4",
  authDomain: "digital-token-system-8b988.firebaseapp.com",
  projectId: "digital-token-system-8b988",
  storageBucket: "digital-token-system-8b988.firebasestorage.app",
  messagingSenderId: "767502141766",
  appId: "1:767502141766:web:f4f295f69b3c1944cabd47"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const timestamp = firebase.firestore.FieldValue.serverTimestamp;

const AVG_SERVICE_MINUTES = 2;
const HISTORY_LIMIT = 8;

let alertBefore = 0;
let currentSessionDate = getTodayKey();
let currentLiveData = null;
let liveUnsubscribe = null;
let historyUnsubscribe = null;
let lastAlertKey = "";

const userTokenElement = document.getElementById("userToken");
const userTokenNoteElement = document.getElementById("userTokenNote");
const currentTokenElement = document.getElementById("currentToken");
const waitingElement = document.getElementById("waiting");
const totalTokensElement = document.getElementById("totalTokens");
const crowdStatusElement = document.getElementById("crowdStatus");
const delayElement = document.getElementById("delay");
const queueStatusBadgeElement = document.getElementById("queueStatusBadge");
const sessionDateLabelElement = document.getElementById("sessionDateLabel");
const sessionModeBadgeElement = document.getElementById("sessionModeBadge");
const queueStageElement = document.getElementById("queueStage");
const lastUpdatedElement = document.getElementById("lastUpdated");
const historyListElement = document.getElementById("historyList");
const generateTokenButton = document.getElementById("generateTokenBtn");
const alertBeforeElement = document.getElementById("alertBefore");
const adminStateBadgeElement = document.getElementById("adminStateBadge");
const nextTokenButton = document.getElementById("nextTokenBtn");
const markServedButton = document.getElementById("markServedBtn");
const markMissedButton = document.getElementById("markMissedBtn");
const toggleQueueButton = document.getElementById("toggleQueueBtn");
const closeQueueButton = document.getElementById("closeQueueBtn");
const adminActionButtons = Array.from(document.querySelectorAll("[data-admin-action]"));

alertBeforeElement.addEventListener("input", (event) => {
    alertBefore = parseInt(event.target.value, 10) || 0;
});

generateTokenButton.addEventListener("click", generateToken);
nextTokenButton.addEventListener("click", nextToken);
markServedButton.addEventListener("click", markCurrentTokenServed);
markMissedButton.addEventListener("click", markCurrentTokenMissed);
toggleQueueButton.addEventListener("click", toggleQueueStatus);
closeQueueButton.addEventListener("click", closeQueueForToday);

if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

init().catch(handleAppError);

async function init() {
    await ensureSessionExists(currentSessionDate);
    updateAdminUI();
    subscribeToSession(currentSessionDate);
}

function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

function getSessionRefs(sessionDate) {
    const sessionRef = db.collection("sessions").doc(sessionDate);
    return {
        liveRef: sessionRef.collection("meta").doc("live"),
        tokensRef: sessionRef.collection("tokens")
    };
}

async function ensureSessionExists(sessionDate) {
    const { liveRef } = getSessionRefs(sessionDate);
    const snapshot = await liveRef.get();

    if (!snapshot.exists) {
        await liveRef.set({
            date: sessionDate,
            currentToken: 0,
            totalTokens: 0,
            waitingCount: 0,
            avgServiceMinutes: AVG_SERVICE_MINUTES,
            crowdLevel: "Low",
            queueStatus: "open",
            createdAt: timestamp(),
            lastUpdatedAt: timestamp()
        });
        return;
    }

    const liveData = snapshot.data();
    if ((liveData.queueStatus || "open") === "closed") {
        await liveRef.set({
            queueStatus: "open",
            lastUpdatedAt: timestamp()
        }, { merge: true });
    }
}

function subscribeToSession(sessionDate) {
    const { liveRef, tokensRef } = getSessionRefs(sessionDate);

    if (liveUnsubscribe) liveUnsubscribe();
    if (historyUnsubscribe) historyUnsubscribe();

    liveUnsubscribe = liveRef.onSnapshot((doc) => {
        if (!doc.exists) return;
        currentLiveData = doc.data();
        renderLiveData(currentLiveData);
        notifyIfNearTurn(currentLiveData.currentToken || 0);
    }, handleAppError);

    historyUnsubscribe = tokensRef
        .orderBy("tokenNumber", "desc")
        .limit(HISTORY_LIMIT)
        .onSnapshot((snapshot) => {
            const tokens = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderHistory(tokens);
        }, handleAppError);
}

function renderLiveData(data) {
    const currentToken = data.currentToken || 0;
    const totalTokens = data.totalTokens || 0;
    const waitingCount = data.waitingCount || 0;
    const queueStatus = data.queueStatus || "open";
    const avgServiceMinutes = data.avgServiceMinutes || AVG_SERVICE_MINUTES;
    const crowdLevel = data.crowdLevel || getCrowdLevel(waitingCount);

    currentTokenElement.innerText = currentToken;
    totalTokensElement.innerText = totalTokens;
    waitingElement.innerText = waitingCount;
    crowdStatusElement.innerText = crowdLevel;
    delayElement.innerText = waitingCount * avgServiceMinutes + " mins";

    queueStatusBadgeElement.innerText = "Queue " + queueStatus;
    queueStatusBadgeElement.className = "top-pill" + (queueStatus === "open" ? "" : " muted");

    sessionDateLabelElement.innerText = "Session " + (data.date || currentSessionDate);
    sessionModeBadgeElement.innerText = capitalize(queueStatus);
    sessionModeBadgeElement.className = "panel-badge" + (queueStatus === "open" ? "" : " alt");

    queueStageElement.innerText = getQueueStageLabel(queueStatus);
    lastUpdatedElement.innerText = formatTimestamp(data.lastUpdatedAt);

    if (toggleQueueButton) {
        toggleQueueButton.innerText = queueStatus === "open" ? "Pause Queue" : "Open Queue";
    }

    if (closeQueueButton) {
        closeQueueButton.disabled = queueStatus === "closed";
    }

    generateTokenButton.disabled = queueStatus !== "open";
    userTokenNoteElement.innerText = queueStatus === "open"
        ? "Generate a token and keep this screen open for alerts."
        : "Token generation is unavailable while the queue is " + queueStatus + ".";

    updateAdminButtonsState();
}

function renderHistory(tokens) {
    if (!tokens.length) {
        historyListElement.innerHTML = '<div class="empty-state">No tokens generated yet for today.</div>';
        return;
    }

    historyListElement.innerHTML = tokens.map((token) => `
        <article class="history-item">
            <div class="history-main">
                <span class="meta-label">Token ${token.tokenNumber || "-"}</span>
                <strong>${capitalize(token.status || "waiting")}</strong>
                <p class="meta-note">${getTokenSubtitle(token)}</p>
            </div>
            <div class="history-meta">
                <span class="status-badge ${token.status || "waiting"}">${capitalize(token.status || "waiting")}</span>
            </div>
        </article>
    `).join("");
}

function getTokenSubtitle(token) {
    if (token.servedAt) return "Served at " + formatTimestamp(token.servedAt);
    if (token.missedAt) return "Marked missed at " + formatTimestamp(token.missedAt);
    if (token.calledAt) return "Called at " + formatTimestamp(token.calledAt);
    return "Created at " + formatTimestamp(token.createdAt);
}

function updateAdminUI() {
    adminStateBadgeElement.innerText = "Ready";
    adminStateBadgeElement.className = "panel-badge";
    updateAdminButtonsState();
}

function updateAdminButtonsState() {
    adminActionButtons.forEach((button) => {
        button.disabled = !currentLiveData;
    });

    if (!currentLiveData) {
        return;
    }

    const queueStatus = currentLiveData.queueStatus || "open";
    const currentToken = currentLiveData.currentToken || 0;

    if (nextTokenButton) {
        nextTokenButton.disabled = queueStatus !== "open";
    }

    if (markServedButton) {
        markServedButton.disabled = queueStatus !== "open" || !currentToken;
    }

    if (markMissedButton) {
        markMissedButton.disabled = queueStatus !== "open" || !currentToken;
    }

    if (toggleQueueButton) {
        toggleQueueButton.disabled = false;
    }

    if (closeQueueButton) {
        closeQueueButton.disabled = queueStatus === "closed";
    }
}

function requireAdminAccess() {
    if (!currentLiveData) {
        alert("Queue data is still loading.");
        return false;
    }
    return true;
}

function getCrowdLevel(waitingCount) {
    if (waitingCount > 10) return "High";
    if (waitingCount > 5) return "Medium";
    return "Low";
}

function getQueueStageLabel(queueStatus) {
    if (queueStatus === "paused") return "Queue paused";
    if (queueStatus === "closed") return "Queue closed for today";
    return "Accepting tokens";
}

function formatTimestamp(value) {
    if (!value) return "Updating...";
    if (typeof value.toDate === "function") {
        return value.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return "Updating...";
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function handleAppError(error) {
    console.error(error);
    currentLiveData = null;
    generateTokenButton.disabled = true;
    adminActionButtons.forEach((button) => {
        button.disabled = true;
    });
    userTokenNoteElement.innerText = "Unable to connect to Firebase. Check Firestore rules and reload the app.";
    queueStageElement.innerText = "Connection problem";
    lastUpdatedElement.innerText = "Firebase error";
    historyListElement.innerHTML = '<div class="empty-state">The app could not load queue data. Check Firebase configuration or Firestore permissions.</div>';
}

function notifyIfNearTurn(currentToken) {
    const userToken = parseInt(userTokenElement.innerText, 10);
    if (!userToken || !alertBefore) return;

    if (userToken - currentToken === alertBefore) {
        const alertKey = userToken + ":" + currentToken;
        if (lastAlertKey === alertKey) return;
        lastAlertKey = alertKey;

        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Your turn is near!");
        }

        const message = new SpeechSynthesisUtterance("Your turn is coming soon");
        speechSynthesis.speak(message);
    }
}

async function generateToken() {
    if (!currentLiveData || currentLiveData.queueStatus !== "open") {
        alert("The queue is not open right now.");
        return;
    }

    const { liveRef, tokensRef } = getSessionRefs(currentSessionDate);

    try {
        const newToken = await db.runTransaction(async (transaction) => {
            const liveDoc = await transaction.get(liveRef);
            const liveData = liveDoc.data();

            if (!liveData || liveData.queueStatus !== "open") {
                throw new Error("The queue is not open right now.");
            }

            const tokenNumber = (liveData.totalTokens || 0) + 1;
            const waitingCount = Math.max(tokenNumber - (liveData.currentToken || 0), 0);

            transaction.set(tokensRef.doc("token_" + tokenNumber), {
                tokenNumber,
                status: "waiting",
                createdAt: timestamp(),
                calledAt: null,
                servedAt: null,
                missedAt: null,
                notifyBefore: alertBefore
            });

            transaction.set(liveRef, {
                totalTokens: tokenNumber,
                waitingCount,
                crowdLevel: getCrowdLevel(waitingCount),
                lastUpdatedAt: timestamp()
            }, { merge: true });

            return tokenNumber;
        });

        userTokenElement.innerText = newToken;
        userTokenNoteElement.innerText = "You are in today's queue. Watch for live updates.";
    } catch (error) {
        alert(error.message || "Unable to generate token.");
    }
}

async function nextToken() {
    if (!requireAdminAccess()) return;

    const { liveRef, tokensRef } = getSessionRefs(currentSessionDate);

    try {
        const next = await db.runTransaction(async (transaction) => {
            const liveDoc = await transaction.get(liveRef);
            const liveData = liveDoc.data();

            if (!liveData || liveData.queueStatus !== "open") {
                throw new Error("Open the queue before calling the next token.");
            }

            if ((liveData.totalTokens || 0) <= (liveData.currentToken || 0)) {
                throw new Error("No waiting tokens are left.");
            }

            const nextTokenNumber = (liveData.currentToken || 0) + 1;
            const waitingCount = Math.max((liveData.totalTokens || 0) - nextTokenNumber, 0);

            transaction.set(tokensRef.doc("token_" + nextTokenNumber), {
                tokenNumber: nextTokenNumber,
                status: "called",
                calledAt: timestamp()
            }, { merge: true });

            transaction.set(liveRef, {
                currentToken: nextTokenNumber,
                waitingCount,
                crowdLevel: getCrowdLevel(waitingCount),
                lastUpdatedAt: timestamp()
            }, { merge: true });

            return nextTokenNumber;
        });

        const message = new SpeechSynthesisUtterance("Token " + next + " please come");
        speechSynthesis.speak(message);
    } catch (error) {
        alert(error.message || "Unable to call the next token.");
    }
}

async function updateCurrentTokenStatus(status) {
    if (!requireAdminAccess()) return;

    const currentToken = currentLiveData.currentToken || 0;
    if (!currentToken) {
        alert("No token has been called yet.");
        return;
    }

    const { tokensRef, liveRef } = getSessionRefs(currentSessionDate);
    const timeField = status === "served" ? "servedAt" : "missedAt";

    try {
        await tokensRef.doc("token_" + currentToken).set({
            status,
            [timeField]: timestamp()
        }, { merge: true });

        await liveRef.set({ lastUpdatedAt: timestamp() }, { merge: true });
    } catch (error) {
        alert(error.message || "Unable to update the current token.");
    }
}

function markCurrentTokenServed() {
    updateCurrentTokenStatus("served");
}

function markCurrentTokenMissed() {
    updateCurrentTokenStatus("missed");
}

async function toggleQueueStatus() {
    if (!requireAdminAccess()) return;

    const { liveRef } = getSessionRefs(currentSessionDate);
    const nextStatus = currentLiveData.queueStatus === "open" ? "paused" : "open";

    try {
        await liveRef.set({
            queueStatus: nextStatus,
            lastUpdatedAt: timestamp()
        }, { merge: true });
    } catch (error) {
        alert(error.message || "Unable to change queue status.");
    }
}

async function closeQueueForToday() {
    if (!requireAdminAccess()) return;

    const confirmed = window.confirm("Close today's queue? Token generation and admin actions will stop.");
    if (!confirmed) return;

    const { liveRef } = getSessionRefs(currentSessionDate);

    try {
        await liveRef.set({
            queueStatus: "closed",
            lastUpdatedAt: timestamp()
        }, { merge: true });
    } catch (error) {
        alert(error.message || "Unable to close today's queue.");
    }
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
        .then(() => console.log("Service Worker Registered"));
}

window.generateToken = generateToken;
window.nextToken = nextToken;
window.markCurrentTokenServed = markCurrentTokenServed;
window.markCurrentTokenMissed = markCurrentTokenMissed;
window.toggleQueueStatus = toggleQueueStatus;
window.closeQueueForToday = closeQueueForToday;
