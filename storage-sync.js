/**
 * VIDASS Storage & Sync Engine (Client-Side)
 * סנכרון Offline-First מול localStorage, Firebase Realtime Database ושרת Flask לפי קוד בית.
 */

const VIDASS_SYNC_INTERVAL_MS = 2000;
const VIDASS_FIREBASE_DB_URL = "https://vidass-home-default-rtdb.firebaseio.com";

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
    window.dispatchEvent(new CustomEvent('vidass:data-updated', {
        detail: { module: moduleName, houseCode: getCurrentHouseCode() }
    }));

    const refreshers = [
        window.loadAlerts,
        window.loadShoppingList,
        window.loadExpenses,
        window.loadInventory,
        window.loadCalendarEvents,
        window.loadBirthdays,
        window.loadEvents,
        window.loadGoals
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

    // עדכון מיידי של התצוגה בעמוד הנוכחי
    notifyPageModules(safeModule);

    if (window.location.protocol === 'file:') {
        return;
    }

    // 2. סנכרון מאובטח ל-Firebase Realtime Database לפי קוד בית מבודד
    const fbBase = getFirebaseBaseUrl();
    if (fbBase) {
        try {
            const fbUrl = `${fbBase}/houses/${encodeURIComponent(houseCode)}/${encodeURIComponent(safeModule)}.json`;
            const res = await fetch(fbUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(safePayload)
            });

            if (!res.ok) {
                console.warn("Firebase דחה את הכתיבה – בדוק את חוקי האבטחה (Rules).");
            }
        } catch (fbErr) {
            console.warn("שגיאה בסנכרון ל-Firebase:", fbErr);
        }
    }

    // 3. שליחה לשרת Flask מקומי (אם קיים)
    try {
        await fetch(`/api/save/${encodeURIComponent(houseCode)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { [safeModule]: safePayload } })
        });
    } catch (_) {}
}

async function fetchHouseDataFromServer(updateUI = false) {
    if (window.location.protocol === 'file:') {
        return;
    }

    const houseCode = getCurrentHouseCode();
    let anyModuleChanged = false;

    const fbBase = getFirebaseBaseUrl();
    if (fbBase) {
        try {
            const fbUrl = `${fbBase}/houses/${encodeURIComponent(houseCode)}.json`;
            const fbRes = await fetch(fbUrl);
            if (fbRes.ok) {
                const houseTree = await fbRes.json();
                if (houseTree && typeof houseTree === 'object') {
                    for (const [modKey, modVal] of Object.entries(houseTree)) {
                        const safeModKey = sanitizeModuleName(modKey);
                        if (!safeModKey || modVal === null || modVal === undefined) continue;

                        const key = `vidass_${safeModKey}_${houseCode}`;
                        const nextJson = JSON.stringify(modVal);
                        const prevJson = localStorage.getItem(key);

                        if (prevJson !== nextJson) {
                            localStorage.setItem(key, nextJson);
                            anyModuleChanged = true;
                        }
                    }
                }
            }
        } catch (_) {}
    }

    try {
        const response = await fetch(`/api/get/${encodeURIComponent(houseCode)}`);
        if (response.ok) {
            const housePackage = await response.json();
            if (housePackage && housePackage.data && typeof housePackage.data === 'object') {
                for (const [modKey, modVal] of Object.entries(housePackage.data)) {
                    const safeModKey = sanitizeModuleName(modKey);
                    if (!safeModKey || modVal === null || modVal === undefined) continue;

                    const key = `vidass_${safeModKey}_${houseCode}`;
                    const nextJson = JSON.stringify(modVal);
                    const prevJson = localStorage.getItem(key);

                    if (prevJson !== nextJson) {
                        localStorage.setItem(key, nextJson);
                        anyModuleChanged = true;
                    }
                }
            }
        }
    } catch (_) {}

    if (updateUI && anyModuleChanged) {
        notifyPageModules('all');
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

document.addEventListener("DOMContentLoaded", () => {
    getCurrentHouseCode();
    setTimeout(() => {
        fetchHouseDataFromServer(true);
    }, 250);

    setInterval(() => {
        fetchHouseDataFromServer(true);
    }, VIDASS_SYNC_INTERVAL_MS);
});