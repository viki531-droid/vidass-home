/**
 * VIDASS Storage & Sync Engine (Client-Side Upgraded)
 * סנכרון Offline-First מול localStorage, BroadcastChannel, Firebase Realtime Database ושרת Flask לפי קוד בית.
 */

const VIDASS_SYNC_INTERVAL_MS = 2000;
const VIDASS_FIREBASE_DB_URL = "https://vidass-home-default-rtdb.firebaseio.com";
// אופציונלי: אם פותחים מ-file:// ורוצים לחבר לשרת מקומי, אפשר להגדיר למשל "http://127.0.0.1:5000"
const VIDASS_SERVER_BASE_URL = "";

let vidassLastSyncMode = "local"; // "local" | "cloud" | "server"
let vidassSyncInFlight = false;
const vidassChannel = (typeof BroadcastChannel !== "undefined")
    ? new BroadcastChannel("vidass_house_sync_v1")
    : null;

function sanitizeHouseCode(rawHouse) {
    const cleaned = String(rawHouse || '')
        .trim()
        .replace(/[.#$/[\]]/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 40);

    return cleaned.length >= 3 ? cleaned : 'EILAT-33';
}

function sanitizeModuleName(rawModule) {
    return String(rawModule || '')
        .trim()
        .replace(/[.#$/[\]]/g, '_')
        .slice(0, 40);
}

function getCurrentHouseCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const candidate = urlParams.get('house') ||
                      localStorage.getItem('vidass_current_house_code') ||
                      localStorage.getItem('vidass_current_house') ||
                      'EILAT-33';

    const house = sanitizeHouseCode(candidate);
    localStorage.setItem('vidass_current_house_code', house);
    localStorage.setItem('vidass_current_house', house);
    return house;
}

function getCurrentUser() {
    const user = (localStorage.getItem('vidass_current_user') || 'ויקי').trim();
    return user.slice(0, 50) || 'ויקי';
}

function getServerBaseUrl() {
    const fromStorage = (localStorage.getItem('vidass_server_url') || '').trim().replace(/\/+$/, '');
    if (fromStorage) return fromStorage;
    if (VIDASS_SERVER_BASE_URL) return VIDASS_SERVER_BASE_URL.trim().replace(/\/+$/, '');
    if (window.location.protocol !== 'file:') return '';
    return '';
}

function canAttemptNetworkSync() {
    if (!navigator.onLine) return false;
    if (window.location.protocol !== 'file:') return true;
    return Boolean(getFirebaseBaseUrl() || getServerBaseUrl());
}

function getVidassSyncStatus() {
    if (!canAttemptNetworkSync()) {
        return { mode: "local", online: navigator.onLine };
    }
    return { mode: vidassLastSyncMode, online: true };
}

function getPersonalizedGreeting() {
    const user = getCurrentUser();
    const house = getCurrentHouseCode();
    const hours = new Date().getHours();
    let timeGreeting = "שלום";

    if (hours >= 5 && hours < 12) timeGreeting = "בוקר טוב";
    else if (hours >= 12 && hours < 17) timeGreeting = "צהריים טובים";
    else if (hours >= 17 && hours < 21) timeGreeting = "ערב טוב";
    else timeGreeting = "לילה טוב";

    return `${timeGreeting}, ${user} (בית: ${house})`;
}

function getSharedData(moduleName) {
    const safeModule = sanitizeModuleName(moduleName);
    if (!safeModule) return [];

    const houseCode = getCurrentHouseCode();
    const storageKey = `vidass_${safeModule}_${houseCode}`;

    try {
        const localData = localStorage.getItem(storageKey);
        if (localData) {
            const parsed = JSON.parse(localData);
            return Array.isArray(parsed) || (parsed && typeof parsed === 'object') ? parsed : [];
        }
    } catch (e) {
        console.error(`שגיאה בקריאת נתונים מקומיים עבור ${safeModule}:`, e);
    }

    return [];
}

function notifyPageModules(moduleName) {
    const houseCode = getCurrentHouseCode();
    window.dispatchEvent(new CustomEvent('vidass:data-updated', {
        detail: { module: moduleName, houseCode }
    }));

    if (vidassChannel) {
        try {
            vidassChannel.postMessage({ type: "vidass:data-updated", module: moduleName, houseCode });
        } catch (_) {}
    }

    const refreshers = [
        window.loadAlerts,
        window.loadShoppingList,
        window.loadItems,
        window.loadExpenses,
        window.loadInventory,
        window.loadCalendarEvents,
        window.loadBirthdays,
        window.loadEvents,
        window.loadGoals,
        window.loadTasks,
        window.loadPocketRecords,
        window.loadRecipes,
        window.loadTravels,
        window.loadWeatherNotes,
        window.loadDevices,
        window.loadMembers
    ];

    refreshers.forEach((fn) => {
        if (typeof fn === 'function') {
            try { fn(); } catch (_) {}
        }
    });
}

function getFirebaseBaseUrl() {
    return (VIDASS_FIREBASE_DB_URL || localStorage.getItem('vidass_firebase_db_url') || '')
        .trim()
        .replace(/\/+$/, '');
}

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('vidass_auth_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function getPendingQueueKey(houseCode) {
    return `vidass_pending_sync_${houseCode}`;
}

function enqueuePendingModule(houseCode, moduleName, payload) {
    try {
        const key = getPendingQueueKey(houseCode);
        const raw = localStorage.getItem(key);
        const queue = raw ? JSON.parse(raw) : {};
        queue[moduleName] = {
            payload,
            updatedAt: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(queue));
    } catch (_) {}
}

function clearPendingModule(houseCode, moduleName) {
    try {
        const key = getPendingQueueKey(houseCode);
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (queue && Object.prototype.hasOwnProperty.call(queue, moduleName)) {
            delete queue[moduleName];
            if (Object.keys(queue).length === 0) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(queue));
            }
        }
    } catch (_) {}
}

async function pushModuleToRemote(houseCode, safeModule, safePayload) {
    let pushedToCloud = false;
    let pushedToServer = false;

    const fbBase = getFirebaseBaseUrl();
    if (fbBase) {
        try {
            const fbUrl = `${fbBase}/houses/${encodeURIComponent(houseCode)}/${encodeURIComponent(safeModule)}.json`;
            const res = await fetch(fbUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(safePayload)
            });

            if (res.ok) {
                pushedToCloud = true;
                vidassLastSyncMode = "cloud";
            } else {
                console.warn("Firebase דחה את הכתיבה – בדוק את חוקי האבטחה (Rules).");
            }
        } catch (fbErr) {
            console.warn("שגיאה בסנכרון ל-Firebase:", fbErr);
        }
    }

    const serverPrefix = getServerBaseUrl();
    try {
        const srvRes = await fetch(`${serverPrefix}/api/save/${encodeURIComponent(houseCode)}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ data: { [safeModule]: safePayload } })
        });
        if (srvRes.ok) {
            pushedToServer = true;
            vidassLastSyncMode = "server";
        }
    } catch (_) {}

    if (pushedToCloud || pushedToServer) {
        clearPendingModule(houseCode, safeModule);
        return true;
    }
    return false;
}

async function flushPendingQueue(houseCode) {
    if (!canAttemptNetworkSync()) return;
    try {
        const key = getPendingQueueKey(houseCode);
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (!queue || typeof queue !== 'object') return;

        for (const [modName, entry] of Object.entries(queue)) {
            if (!entry || !Object.prototype.hasOwnProperty.call(entry, 'payload')) continue;
            await pushModuleToRemote(houseCode, sanitizeModuleName(modName), entry.payload);
        }
    } catch (_) {}
}

async function saveSharedData(moduleName, dataArray) {
    const safeModule = sanitizeModuleName(moduleName);
    if (!safeModule) return;

    const houseCode = getCurrentHouseCode();
    const storageKey = `vidass_${safeModule}_${houseCode}`;
    const safePayload = Array.isArray(dataArray) || (dataArray && typeof dataArray === 'object')
        ? dataArray
        : [];

    // 1. שמירה מיידית ב-localStorage (Offline-first)
    try {
        localStorage.setItem(storageKey, JSON.stringify(safePayload));
    } catch (e) {
        console.error("שגיאה בשמירה ל-localStorage:", e);
    }

    // עדכון מיידי של התצוגה בעמוד הנוכחי ושידור לטאבים פתוחים
    notifyPageModules(safeModule);

    if (!canAttemptNetworkSync()) {
        vidassLastSyncMode = "local";
        enqueuePendingModule(houseCode, safeModule, safePayload);
        return;
    }

    const synced = await pushModuleToRemote(houseCode, safeModule, safePayload);
    if (!synced) {
        enqueuePendingModule(houseCode, safeModule, safePayload);
    }
}

function mergeRemoteModuleMap(houseCode, modMap) {
    let changed = false;
    if (!modMap || typeof modMap !== 'object') return false;

    for (const [modKey, modVal] of Object.entries(modMap)) {
        const safeModKey = sanitizeModuleName(modKey);
        if (!safeModKey || modVal === null || modVal === undefined) continue;

        const key = `vidass_${safeModKey}_${houseCode}`;
        const nextJson = JSON.stringify(modVal);
        const prevJson = localStorage.getItem(key);

        if (prevJson !== nextJson) {
            localStorage.setItem(key, nextJson);
            changed = true;
        }
    }
    return changed;
}

async function fetchHouseDataFromServer(updateUI = false) {
    if (!canAttemptNetworkSync()) {
        vidassLastSyncMode = "local";
        return;
    }

    if (vidassSyncInFlight) return;
    vidassSyncInFlight = true;

    const houseCode = getCurrentHouseCode();
    let anyModuleChanged = false;

    try {
        await flushPendingQueue(houseCode);

        const fbBase = getFirebaseBaseUrl();
        if (fbBase) {
            try {
                const fbUrl = `${fbBase}/houses/${encodeURIComponent(houseCode)}.json`;
                const fbRes = await fetch(fbUrl);
                if (fbRes.ok) {
                    vidassLastSyncMode = "cloud";
                    const houseTree = await fbRes.json();
                    if (mergeRemoteModuleMap(houseCode, houseTree)) {
                        anyModuleChanged = true;
                    }
                }
            } catch (_) {}
        }

        const serverPrefix = getServerBaseUrl();
        try {
            const response = await fetch(`${serverPrefix}/api/get/${encodeURIComponent(houseCode)}`, {
                headers: getAuthHeaders()
            });
            if (response.ok) {
                vidassLastSyncMode = "server";
                const housePackage = await response.json();
                if (housePackage && housePackage.data && typeof housePackage.data === 'object') {
                    if (mergeRemoteModuleMap(houseCode, housePackage.data)) {
                        anyModuleChanged = true;
                    }
                }
                if (housePackage && Array.isArray(housePackage.members)) {
                    const membersKey = `vidass_members_${houseCode}`;
                    const nextMembersJson = JSON.stringify(housePackage.members);
                    if (localStorage.getItem(membersKey) !== nextMembersJson) {
                        localStorage.setItem(membersKey, nextMembersJson);
                        anyModuleChanged = true;
                    }
                }
            }
        } catch (_) {}

        if (updateUI && anyModuleChanged) {
            notifyPageModules('all');
        }
    } finally {
        vidassSyncInFlight = false;
    }
}

window.addEventListener("storage", (event) => {
    const houseCode = getCurrentHouseCode();
    if (!event.key || !event.key.startsWith("vidass_") || !event.key.endsWith(`_${houseCode}`)) {
        return;
    }
    const moduleName = event.key.slice("vidass_".length, -(`_${houseCode}`.length));
    notifyPageModules(moduleName);
});

if (vidassChannel) {
    vidassChannel.onmessage = (event) => {
        const msg = event && event.data;
        if (msg && msg.type === "vidass:data-updated" && msg.houseCode === getCurrentHouseCode()) {
            notifyPageModules(msg.module || 'all');
        }
    };
}

window.addEventListener("online", () => {
    fetchHouseDataFromServer(true);
});

document.addEventListener("DOMContentLoaded", () => {
    getCurrentHouseCode();
    setTimeout(() => {
        fetchHouseDataFromServer(true);
    }, 250);

    setInterval(() => {
        if (!document.hidden && navigator.onLine) {
            fetchHouseDataFromServer(true);
        }
    }, VIDASS_SYNC_INTERVAL_MS);
});