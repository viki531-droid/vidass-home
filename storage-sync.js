/**
 * VIDASS Storage & Sync Engine (Client-Side)
 * מנהל סנכרון Offline-First מול localStorage, שרת Flask ו-Firebase Realtime Database לפי קוד בית.
 */

const VIDASS_SYNC_INTERVAL_MS = 2500; // בדיקת עדכונים כל 2.5 שניות
// החלף בכתובת ה-Realtime Database שלך ב-Firebase, למשל:
// "https://vidass-home-default-rtdb.europe-west1.firebasedatabase.app"
const VIDASS_FIREBASE_DB_URL = "";

function getCurrentHouseCode() {
    const urlParams = new URLSearchParams(window.location.search);
    let house = urlParams.get('house') ||
                localStorage.getItem('vidass_current_house_code') ||
                localStorage.getItem('vidass_current_house') ||
                'EILAT-33';

    house = house.trim();
    localStorage.setItem('vidass_current_house_code', house);
    localStorage.setItem('vidass_current_house', house);
    return house;
}

function getCurrentUser() {
    return localStorage.getItem('vidass_current_user') || 'ויקי';
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
    const houseCode = getCurrentHouseCode();
    const storageKey = `vidass_${moduleName}_${houseCode}`;

    try {
        const localData = localStorage.getItem(storageKey);
        if (localData) {
            return JSON.parse(localData);
        }
    } catch (e) {
        console.error(`שגיאה בקריאת נתונים מקומיים עבור ${moduleName}:`, e);
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
    const houseCode = getCurrentHouseCode();
    const storageKey = `vidass_${moduleName}_${houseCode}`;

    // 1. שמירה מיידית ב-localStorage (Offline-first)
    try {
        localStorage.setItem(storageKey, JSON.stringify(dataArray));
    } catch (e) {
        console.error("שגיאה בשמירה ל-localStorage:", e);
    }

    // עדכון מיידי של התצוגה בעמוד הנוכחי
    notifyPageModules(moduleName);

    if (window.location.protocol === 'file:') {
        return;
    }

    // 2. סנכרון ל-Firebase Realtime Database (עובד גם ב-GitHub Pages בין כל המכשירים)
    const fbBase = getFirebaseBaseUrl();
    if (fbBase) {
        try {
            const fbUrl = `${fbBase}/houses/${encodeURIComponent(houseCode)}/${encodeURIComponent(moduleName)}.json`;
            await fetch(fbUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataArray)
            });
        } catch (fbErr) {
            console.warn("שגיאה בסנכרון ל-Firebase:", fbErr);
        }
    }

    // 3. שליחה ברקע לשרת ה-Flask המרכזי (אם קיים)
    try {
        const payload = {
            data: {
                [moduleName]: dataArray
            }
        };

        const response = await fetch(`/api/save/${encodeURIComponent(houseCode)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn("הנתונים נשמרו מקומית, אך השרת החזיר תשובה שגויה בשמירה לענן.");
        }
    } catch (_) {
        // ב-GitHub Pages אין שרת Flask מקומי – זה תקין
    }
}

async function fetchHouseDataFromServer(updateUI = false) {
    if (window.location.protocol === 'file:') {
        return;
    }

    const houseCode = getCurrentHouseCode();
    let anyModuleChanged = false;

    // 1. משיכה מ-Firebase Realtime Database
    const fbBase = getFirebaseBaseUrl();
    if (fbBase) {
        try {
            const fbUrl = `${fbBase}/houses/${encodeURIComponent(houseCode)}.json`;
            const fbRes = await fetch(fbUrl);
            if (fbRes.ok) {
                const houseTree = await fbRes.json();
                if (houseTree && typeof houseTree === 'object') {
                    for (const [modKey, modVal] of Object.entries(houseTree)) {
                        if (modVal === null || modVal === undefined) continue;
                        const key = `vidass_${modKey}_${houseCode}`;
                        const nextJson = JSON.stringify(modVal);
                        const prevJson = localStorage.getItem(key);

                        if (prevJson !== nextJson) {
                            localStorage.setItem(key, nextJson);
                            anyModuleChanged = true;
                        }
                    }
                }
            }
        } catch (_) {
            // מצב לא מקוון - ממשיך לעבוד מול localStorage
        }
    }

    // 2. משיכה משרת Flask (אם זמין)
    try {
        const response = await fetch(`/api/get/${encodeURIComponent(houseCode)}`);
        if (response.ok) {
            const housePackage = await response.json();

            if (housePackage && housePackage.data) {
                for (const [modKey, modVal] of Object.entries(housePackage.data)) {
                    const key = `vidass_${modKey}_${houseCode}`;
                    const nextJson = JSON.stringify(modVal);
                    const prevJson = localStorage.getItem(key);

                    if (prevJson !== nextJson) {
                        localStorage.setItem(key, nextJson);
                        anyModuleChanged = true;
                    }
                }
            }
        }
    } catch (_) {
        // מצב לא מקוון - ממשיך לעבוד מול localStorage
    }

    if (updateUI && anyModuleChanged) {
        notifyPageModules('all');
    }
}

// סנכרון מיידי בין טאבים/חלונות פתוחים באותו דפדפן
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
    }, 300);

    setInterval(() => {
        fetchHouseDataFromServer(true);
    }, VIDASS_SYNC_INTERVAL_MS);
});