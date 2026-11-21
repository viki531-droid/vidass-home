/**
 * VIDASS Storage & Sync Engine (Client-Side)
 * מנהל את הסנכרון בין ה-localStorage, הדפדפנים השונים ושרת ה-Flask המרכזי.
 */

const VIDASS_SYNC_INTERVAL_MS = 4000; // בדיקת עדכונים מהשרת כל 4 שניות

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

    // 2. שליחה ברקע לשרת ה-Flask המרכזי (רק אם רצים דרך HTTP/HTTPS)
    if (window.location.protocol === 'file:') {
        return;
    }

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
    } catch (err) {
        console.log("שרת הענן אינו זמין כרגע – הנתונים נשמרו ויעבדו בצורה מקומית בדפדפן.");
    }
}

async function fetchHouseDataFromServer(updateUI = false) {
    if (window.location.protocol === 'file:') {
        return;
    }

    const houseCode = getCurrentHouseCode();
    let anyModuleChanged = false;

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

            if (updateUI && anyModuleChanged) {
                notifyPageModules('all');
            }
        }
    } catch (e) {
        // מצב לא מקוון - ממשיך לעבוד מול localStorage
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