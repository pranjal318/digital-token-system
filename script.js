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
const USER_STATE_STORAGE_KEY = "smartQueueUserState";

let alertBefore = 0;
let currentSessionDate = getTodayKey();
let currentLiveData = null;
let liveUnsubscribe = null;
let historyUnsubscribe = null;
let lastAlertKey = "";
let userState = loadUserState();
let emailJsReady = false;

const userTokenElement = document.getElementById("userToken");
const userTokenNoteElement = document.getElementById("userTokenNote");
const userPositionElement = document.getElementById("userPosition");
const userEtaElement = document.getElementById("userEta");
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
const emailAddressElement = document.getElementById("emailAddress");
const adminStateBadgeElement = document.getElementById("adminStateBadge");
const nextTokenButton = document.getElementById("nextTokenBtn");
const markServedButton = document.getElementById("markServedBtn");
const markMissedButton = document.getElementById("markMissedBtn");
const sendEmailButton = document.getElementById("sendEmailBtn");
const toggleQueueButton = document.getElementById("toggleQueueBtn");
const closeQueueButton = document.getElementById("closeQueueBtn");
const adminActionButtons = Array.from(document.querySelectorAll("[data-admin-action]"));

if (alertBeforeElement) {
    alertBeforeElement.addEventListener("input", (event) => {
        alertBefore = parseInt(event.target.value, 10) || 0;
        if (userState.sessionDate === currentSessionDate && userState.tokenNumber) {
            userState.alertBefore = alertBefore;
            saveUserState();
        }
    });
}

if (generateTokenButton) {
    generateTokenButton.addEventListener("click", generateToken);
}

if (nextTokenButton) {
    nextTokenButton.addEventListener("click", nextToken);
}

if (markServedButton) {
    markServedButton.addEventListener("click", markCurrentTokenServed);
}

if (markMissedButton) {
    markMissedButton.addEventListener("click", markCurrentTokenMissed);
}

if (sendEmailButton) {
    sendEmailButton.addEventListener("click", sendEmailForCurrentToken);
}

if (toggleQueueButton) {
    toggleQueueButton.addEventListener("click", toggleQueueStatus);
}

if (closeQueueButton) {
    closeQueueButton.addEventListener("click", closeQueueForToday);
}

if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

initEmailJs();
init().catch(handleAppError);

async function init() {
    await ensureSessionExists(currentSessionDate);
    restoreUserStateForToday();
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

    if (historyListElement) {
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
}

function renderLiveData(data) {
    const currentToken = data.currentToken || 0;
    const totalTokens = data.totalTokens || 0;
    const waitingCount = data.waitingCount || 0;
    const queueStatus = data.queueStatus || "open";
    const avgServiceMinutes = data.avgServiceMinutes || AVG_SERVICE_MINUTES;
    const crowdLevel = data.crowdLevel || getCrowdLevel(waitingCount);

    setText(currentTokenElement, currentToken);
    setText(totalTokensElement, totalTokens);
    setText(waitingElement, waitingCount);
    setText(crowdStatusElement, crowdLevel);
    setText(delayElement, waitingCount * avgServiceMinutes + " mins");

    setText(queueStatusBadgeElement, "Queue " + queueStatus);
    setClassName(queueStatusBadgeElement, "top-pill" + (queueStatus === "open" ? "" : " muted"));

    setText(sessionDateLabelElement, "Session " + (data.date || currentSessionDate));
    setText(sessionModeBadgeElement, capitalize(queueStatus));
    setClassName(sessionModeBadgeElement, "panel-badge" + (queueStatus === "open" ? "" : " alt"));

    setText(queueStageElement, getQueueStageLabel(queueStatus));
    setText(lastUpdatedElement, formatTimestamp(data.lastUpdatedAt));

    if (toggleQueueButton) {
        toggleQueueButton.innerText = queueStatus === "open" ? "Pause Queue" : "Open Queue";
    }

    if (closeQueueButton) {
        closeQueueButton.disabled = queueStatus === "closed";
    }

    if (generateTokenButton) {
        generateTokenButton.disabled = queueStatus !== "open";
    }

    if (userTokenNoteElement && !getUserTokenNumber()) {
        userTokenNoteElement.innerText = queueStatus === "open"
            ? "Generate a token and keep this screen open for alerts."
            : "Token generation is unavailable while the queue is " + queueStatus + ".";
    }

    renderUserQueueInsights();
    updateAdminButtonsState();
}

function renderHistory(tokens) {
    if (!historyListElement) {
        return;
    }

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
                <p class="meta-note">${getEmailLabel(token.emailAddress)}</p>
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

function getEmailLabel(value) {
    return value ? "Email: " + value : "Email: not provided";
}

function updateAdminUI() {
    setText(adminStateBadgeElement, "Ready");
    setClassName(adminStateBadgeElement, "panel-badge");
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

    if (sendEmailButton) {
        sendEmailButton.disabled = !currentToken;
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

function initEmailJs() {
    if (!window.emailjs || !window.EMAILJS_CONFIG || !window.EMAILJS_CONFIG.publicKey) {
        return;
    }

    if (window.EMAILJS_CONFIG.publicKey === "PASTE_EMAILJS_PUBLIC_KEY") {
        return;
    }

    window.emailjs.init({
        publicKey: window.EMAILJS_CONFIG.publicKey
    });
    emailJsReady = true;
}

function sanitizeEmail(value) {
    return (value || "").trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildEmailSubject(tokenNumber) {
    return "Smart Queue update for token " + tokenNumber;
}

function buildEmailBody(tokenNumber) {
    const queueLabel = currentLiveData && currentLiveData.queueStatus
        ? capitalize(currentLiveData.queueStatus)
        : "Open";
    return [
        "Hello,",
        "",
        "This is an update for your Smart Queue token " + tokenNumber + ".",
        "Current queue status: " + queueLabel + ".",
        "Please be ready for your turn.",
        "",
        "Thank you."
    ].join("\n");
}

function buildEmailTemplateParams(tokenNumber, emailAddress) {
    const queueStatus = currentLiveData && currentLiveData.queueStatus
        ? capitalize(currentLiveData.queueStatus)
        : "Open";

    return {
        to_email: emailAddress,
        token_number: String(tokenNumber),
        session_date: currentSessionDate,
        queue_status: queueStatus,
        message_title: buildEmailSubject(tokenNumber),
        message_body: buildEmailBody(tokenNumber)
    };
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

    if (generateTokenButton) {
        generateTokenButton.disabled = true;
    }

    adminActionButtons.forEach((button) => {
        button.disabled = true;
    });

    setText(userTokenNoteElement, "Unable to connect to Firebase. Check Firestore rules and reload the app.");
    setText(userPositionElement, "-");
    setText(userEtaElement, "-");
    setText(queueStageElement, "Connection problem");
    setText(lastUpdatedElement, "Firebase error");

    if (historyListElement) {
        historyListElement.innerHTML = '<div class="empty-state">The app could not load queue data. Check Firebase configuration or Firestore permissions.</div>';
    }
}

function loadUserState() {
    try {
        const rawValue = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
        if (!rawValue) {
            return createEmptyUserState();
        }

        const parsedValue = JSON.parse(rawValue);
        return {
            sessionDate: parsedValue.sessionDate || "",
            tokenNumber: parsedValue.tokenNumber || null,
            alertBefore: parsedValue.alertBefore || 0,
            emailAddress: parsedValue.emailAddress || ""
        };
    } catch (error) {
        console.warn("Unable to load saved user state", error);
        return createEmptyUserState();
    }
}

function createEmptyUserState() {
    return {
        sessionDate: "",
        tokenNumber: null,
        alertBefore: 0,
        emailAddress: ""
    };
}

function saveUserState() {
    window.localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(userState));
}

function clearUserState() {
    userState = createEmptyUserState();
    window.localStorage.removeItem(USER_STATE_STORAGE_KEY);
}

function restoreUserStateForToday() {
    if (userState.sessionDate !== currentSessionDate || !userState.tokenNumber) {
        clearRenderedUserState();
        if (userState.sessionDate !== currentSessionDate) {
            clearUserState();
        }
        return;
    }

    setText(userTokenElement, userState.tokenNumber);
    alertBefore = userState.alertBefore || 0;

    if (alertBeforeElement) {
        alertBeforeElement.value = alertBefore ? alertBefore : "";
    }

    if (emailAddressElement) {
        emailAddressElement.value = userState.emailAddress || "";
    }

    setText(userTokenNoteElement, "Your token was restored for today. Watch for live updates.");
    renderUserQueueInsights();
}

function clearRenderedUserState() {
    setText(userTokenElement, "-");
    setText(userTokenNoteElement, "Generate a token and keep this screen open for alerts.");
    setText(userPositionElement, "-");
    setText(userEtaElement, "-");

    if (alertBeforeElement && !userState.tokenNumber) {
        alertBeforeElement.value = "";
    }

    if (emailAddressElement && !userState.tokenNumber) {
        emailAddressElement.value = "";
    }
}

function renderUserQueueInsights() {
    const userToken = getUserTokenNumber();

    if (!userPositionElement || !userEtaElement) {
        return;
    }

    if (!userToken || !currentLiveData) {
        userPositionElement.innerText = "-";
        userEtaElement.innerText = "-";
        return;
    }

    const currentToken = currentLiveData.currentToken || 0;
    const avgServiceMinutes = currentLiveData.avgServiceMinutes || AVG_SERVICE_MINUTES;
    const tokensAhead = Math.max(userToken - currentToken - 1, 0);

    userPositionElement.innerText = tokensAhead === 0 ? "Next / now" : String(tokensAhead);

    if (userToken <= currentToken) {
        userEtaElement.innerText = "Now";
        if (userTokenNoteElement && currentLiveData.queueStatus === "open") {
            userTokenNoteElement.innerText = "Your token is active or has already been called. Please check the desk.";
        }
        return;
    }

    const etaMinutes = tokensAhead * avgServiceMinutes;
    userEtaElement.innerText = etaMinutes <= 1 ? "Under 1 min" : etaMinutes + " mins";

    if (!userTokenNoteElement) {
        return;
    }

    if (currentLiveData.queueStatus === "paused") {
        userTokenNoteElement.innerText = "Your token is saved. The queue is paused right now.";
    } else if (currentLiveData.queueStatus === "closed") {
        userTokenNoteElement.innerText = "Your token is saved, but today's queue is now closed.";
    } else {
        userTokenNoteElement.innerText = "You have " + tokensAhead + " people ahead of you. Stay ready for your turn.";
    }
}

function getUserTokenNumber() {
    return userTokenElement ? parseInt(userTokenElement.innerText, 10) : 0;
}

function notifyIfNearTurn(currentToken) {
    const userToken = getUserTokenNumber();
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

    const emailAddress = sanitizeEmail(emailAddressElement ? emailAddressElement.value : "");
    if (emailAddress && !isValidEmail(emailAddress)) {
        alert("Enter a valid email address.");
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
                notifyBefore: alertBefore,
                emailAddress
            });

            transaction.set(liveRef, {
                totalTokens: tokenNumber,
                waitingCount,
                crowdLevel: getCrowdLevel(waitingCount),
                lastUpdatedAt: timestamp()
            }, { merge: true });

            return tokenNumber;
        });

        userState = {
            sessionDate: currentSessionDate,
            tokenNumber: newToken,
            alertBefore,
            emailAddress
        };
        saveUserState();

        setText(userTokenElement, newToken);
        renderUserQueueInsights();
        setText(
            userTokenNoteElement,
            emailAddress
                ? "You are in today's queue. Your email was saved for automatic updates."
                : "You are in today's queue. Watch for live updates."
        );
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

        try {
            await sendEmailForToken(next, { silent: true });
        } catch (emailError) {
            console.error("Automatic email failed", emailError);
            alert("Token called successfully, but the email could not be sent. Check EmailJS settings.");
        }
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

async function sendEmailForCurrentToken() {
    if (!requireAdminAccess()) return;

    const currentToken = currentLiveData.currentToken || 0;
    if (!currentToken) {
        alert("No token has been called yet.");
        return;
    }

    try {
        await sendEmailForToken(currentToken, { silent: false });
    } catch (error) {
        alert(error.message || "Unable to send the email.");
    }
}

async function sendEmailForToken(tokenNumber, options = {}) {
    const { silent = false } = options;

    if (!emailJsReady) {
        throw new Error("EmailJS is not configured yet. Update emailjs-config.js first.");
    }

    const config = window.EMAILJS_CONFIG || {};
    if (!config.serviceId || !config.templateId) {
        throw new Error("EmailJS service or template ID is missing.");
    }

    if (config.serviceId === "PASTE_EMAILJS_SERVICE_ID" || config.templateId === "PASTE_EMAILJS_TEMPLATE_ID") {
        throw new Error("EmailJS service or template ID is still using the placeholder value.");
    }

    const { tokensRef } = getSessionRefs(currentSessionDate);
    const tokenDoc = await tokensRef.doc("token_" + tokenNumber).get();
    const tokenData = tokenDoc.data();
    const emailAddress = sanitizeEmail(tokenData && tokenData.emailAddress);

    if (!emailAddress || !isValidEmail(emailAddress)) {
        throw new Error("This token does not have a valid email address.");
    }

    await window.emailjs.send(
        config.serviceId,
        config.templateId,
        buildEmailTemplateParams(tokenNumber, emailAddress)
    );

    if (!silent) {
        alert("Email sent successfully.");
    }
}

function setText(element, value) {
    if (element) {
        element.innerText = value;
    }
}

function setClassName(element, value) {
    if (element) {
        element.className = value;
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
window.sendEmailForCurrentToken = sendEmailForCurrentToken;
window.toggleQueueStatus = toggleQueueStatus;
window.closeQueueForToday = closeQueueForToday;
