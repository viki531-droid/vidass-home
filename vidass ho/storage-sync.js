// ==========================================
// VIDASS - Clean & Unified Storage & Sync Engine (Fixed & Robust)
// ==========================================

const VIDASS_STORAGE_PREFIX = "vidass_house_";
let globalSyncInterval = null;

// כתובת שרת ה-Flask (ניתן לשנות לכתובת ה-IP או ה-Tailscale של השרת בבית)
const getFlaskServerUrl = () => {
    return localStorage.getItem("vidass_flask_server_url") || "http://localhost:5000";
};

function setFlaskServerUrl(url) {
    if (url) {
        localStorage.setItem("vidass_flask_server_url", url.trim());
    }
}

// קבלת קוד הבית הנוכחי
function getCurrentHouseCode() {
    let houseCode = localStorage.getItem("vidass_current_house") || localStorage.getItem("vidass_current_house_code");
    if (!houseCode) {
        houseCode = "EILAT-33"; // ברירת מחדל מותאמת
        localStorage.setItem("vidass_current_house", houseCode);
        localStorage.setItem("vidass_current_house_code", houseCode);
    }
    return houseCode;
}

// הגדרת קוד בית חדש (הצטרפות לבית)
function setCurrentHouseCode(code) {
    if (code && code.trim() !== "") {
        const cleanCode = code.trim();
        localStorage.setItem("vidass_current_house", cleanCode);
        localStorage.setItem("vidass_current_house_code", cleanCode);
        fetchHouseDataFromServer(true);
    }
}

// קבלת שם המשתמש הנוכחי במכשיר (ויקי / דוד)
function getCurrentUser() {
    return localStorage.getItem("vidass_current_user") || "ויקי";
}

function setCurrentUser(username) {
    if (username) {
        const cleanName = username.trim();
        localStorage.setItem("vidass_current_user", cleanName);
        registerMemberToHouse(cleanName);
    }
}

// רישום דייר חדש לרשימת הבית וסנכרון מיידי מול השרת
function registerMemberToHouse(userName) {
    let members = getHouseMembers();
    // תמיכה במבנה חדש של אובייקטים או מחרוזות
    const exists = members.some(m => (typeof m === 'object' ? m.name : m) === userName);
    if (!exists) {
        members.push({ name: userName, phone: "לא צוין", role: "דייר" });
        saveHouseMembers(members);
    }
}

// ברכה אישית לפי שעות היום
function getPersonalizedGreeting() {
    const hour = new Date().getHours();
    const user = getCurrentUser();
    if (hour >= 5 && hour < 12) return `בוקר טוב, ${user}`;
    if (hour >= 12 && hour < 17) return `צהריים טובים, ${user}`;
    if (hour >= 17 && hour < 21) return `ערב טוב, ${user}`;
    return `לילה טוב, ${user}`;
}

// שליפת רשימת הדיירים הרשומים תחת קוד הבית
function getHouseMembers() {
    const houseCode = getCurrentHouseCode();
    const data = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`);
    return data ? JSON.parse(data) : [{ name: getCurrentUser(), phone: "לא צוין", role: "מנהל הבית" }];
}

// שמירת רשימת הדיירים ועדכון מיידי של השרת
function saveHouseMembers(members) {
    const houseCode = getCurrentHouseCode();
    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(members));
    
    // שליחה מיידית לשרת כדי שדוד ושאר הטלפונים יראו את הדייר החדש
    syncWithFlaskServer({ members: members });
}

// שליפת מידע משותף (קניות, משימות, מלאי וכו')
function getSharedData(key) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    const data = localStorage.getItem(fullKey);
    return data ? JSON.parse(data) : [];
}

// שמירת מידע משותף (גם מקומית וגם שליחה מיידית לענן הפרטי)
function saveSharedData(key, data) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    
    // 1. שמירה מקומית מיידית
    localStorage.setItem(fullKey, JSON.stringify(data));

    // 2. שליחה לשרת ה-Flask
    let payload = { data: {} };
    payload.data[key] = data;
    syncWithFlaskServer(payload);
}

// שליחת נתונים לשרת ה-Flask
async function syncWithFlaskServer(payload) {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        await fetch(`${serverUrl}/api/save/${houseCode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.log("מצב לא מקוון (Offline Mode): נשמר באחסון המקומי בלבד.");
    }
}

// משיכת נתונים עדכניים מהשרת עבור כל המודולים והדיירים (סנכרון חי)
async function fetchHouseDataFromServer(forceReload = false) {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/get/${houseCode}`);
        if (response.ok) {
            const serverData = await response.json();
            if (serverData) {
                let hasChanges = false;
                
                // עדכון דיירים מהשרת (מיזוג חכם למניעת דריסה)
                if (serverData.members && Array.isArray(serverData.members)) {
                    let localMembers = getHouseMembers();
                    
                    // בדיקת שינויים לפי שמות הדיירים
                    const localStr = JSON.stringify(localMembers);
                    const serverStr = JSON.stringify(serverData.members);
                    
                    if (localStr !== serverStr) {
                        localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, serverStr);
                        hasChanges = true;
                    }
                }

                // עדכון כל מודולי המידע
                if (serverData.data) {
                    for (const [key, val] of Object.entries(serverData.data)) {
                        const localVal = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`);
                        const serverValStr = JSON.stringify(val);
                        if (localVal !== serverValStr) {
                            localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`, serverValStr);
                            hasChanges = true;
                        }
                    }
                }

                // רענון אוטומטי של התצוגה בדפדפן הפעיל אם התקבלו נתונים חדשים
                if (hasChanges || forceReload) {
                    if (typeof window.loadItems === 'function') window.loadItems();
                    if (typeof window.loadTasks === 'function') window.loadTasks();
                    if (typeof window.loadPocketRecords === 'function') window.loadPocketRecords();
                    if (typeof window.loadTrips === 'function') window.loadTrips();
                    if (typeof window.loadWeatherNotes === 'function') window.loadWeatherNotes();
                    if (typeof window.loadMembers === 'function') window.loadMembers();
                    if (typeof window.loadInventory === 'function') window.loadInventory();
                    if (typeof window.loadExpenses === 'function') window.loadExpenses();
                }
            }
        }
    } catch (e) {
        // שגיאת רשת שקטה במצב אופליין
    }
}

// הפעלה אוטומטית עם טעינת כל דפדפן
window.addEventListener('DOMContentLoaded', () => {
    registerMemberToHouse(getCurrentUser());
    fetchHouseDataFromServer(true);

    // מנגנון סנכרון חי שבודק עדכונים מהשרת כל 3 שניות
    if (!globalSyncInterval) {
        globalSyncInterval = setInterval(() => {
            fetchHouseDataFromServer(false);
        }, 3000);
    }
});