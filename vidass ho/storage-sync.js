// ==========================================
// VIDASS - Secure Local & Flask Server Sync Engine
// מנהל את קוד הבית, בידוד הנתונים, האחסון המקומי והסנכרון בין כל בני הבית
// ==========================================

const VIDASS_STORAGE_PREFIX = "vidass_house_";

// כתובת שרת ה-Flask הפרטי (ניתן לעדכן לכתובת ה-IP של השרת שלך ברשת Tailscale)
const getFlaskServerUrl = () => {
    return localStorage.getItem("vidass_flask_server_url") || "http://localhost:5000";
};

// הגדרת כתובת שרת ענן פרטי
function setFlaskServerUrl(url) {
    if (url) {
        localStorage.setItem("vidass_flask_server_url", url.trim());
    }
}

// קבלת קוד הבית הנוכחי (זהה לכל בני הבית שרוצים לראות את אותם נתונים)
function getCurrentHouseCode() {
    let houseCode = localStorage.getItem("vidass_current_house") || localStorage.getItem("vidass_current_house_code");
    if (!houseCode) {
        houseCode = "EILAT-33"; // קוד ברירת מחדל משותף
        localStorage.setItem("vidass_current_house", houseCode);
        localStorage.setItem("vidass_current_house_code", houseCode);
    }
    return houseCode;
}

// הגדרת קוד בית משותף (כאשר מתחברים לבית קיים של המשפחה)
function setCurrentHouseCode(code) {
    if (code && code.trim() !== "") {
        const cleanCode = code.trim();
        localStorage.setItem("vidass_current_house", cleanCode);
        localStorage.setItem("vidass_current_house_code", cleanCode);
        // טעינה מיידית של נתוני הבית החדש מהשרת
        fetchHouseDataFromServer();
    }
}

// קבלת שם המשתמש הנוכחי במכשיר (ויקי, דוד וכו')
function getCurrentUser() {
    return localStorage.getItem("vidass_current_user") || "ויקי";
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem("vidass_current_user", username.trim());
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

// שליפת רשימת הדיירים הרשומים תחת קוד הבית הנוכחי
function getHouseMembers() {
    const houseCode = getCurrentHouseCode();
    const data = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`);
    return data ? JSON.parse(data) : [getCurrentUser(), "דוד"];
}

// שמירת רשימת הדיירים לבית הנוכחי ועדכון השרת
function saveHouseMembers(members) {
    const houseCode = getCurrentHouseCode();
    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(members));
    syncWithFlaskServer({ members: members });
}

// שליפת מידע משותף (קניות, משימות, דמי כיס וכו')
function getSharedData(key) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    const data = localStorage.getItem(fullKey);
    return data ? JSON.parse(data) : [];
}

// שמירת מידע משותף תחת קוד הבית המשותף (מקומי + שרת ענן פרטי)
function saveSharedData(key, data) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    
    // 1. שמירה מקומית מיידית
    localStorage.setItem(fullKey, JSON.stringify(data));

    // 2. שליחה לשרת ה-Flask כדי ששאר הטלפונים בבית יראו מיד את השינוי
    let payload = { data: {} };
    payload.data[key] = data;
    syncWithFlaskServer(payload);
}

// תקשורת עם שרת ה-Flask הפרטי
async function syncWithFlaskServer(payload) {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/save/${houseCode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.warn("התראה: שרת הענן הפרטי לא זמין, עובד על זיכרון מקומי.");
        }
    } catch (error) {
        console.log("מצב לא מקוון (Offline): פועל על אחסון מקומי מאובטח.");
    }
}

// משיכת הנתונים העדכניים ביותר מהשרת עבור קוד הבית
async function fetchHouseDataFromServer() {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/get/${houseCode}`);
        if (response.ok) {
            const serverData = await response.json();
            if (serverData) {
                if (serverData.members) {
                    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(serverData.members));
                }
                if (serverData.data) {
                    for (const [key, val] of Object.entries(serverData.data)) {
                        localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`, JSON.stringify(val));
                    }
                }
                console.log("הנתונים סונכרנו בהצלחה מענן הבית הפרטי!");
            }
        }
    } catch (e) {
        console.log("טוען נתונים מהזיכרון המקומי...");
    }
}

// סנכרון אוטומטי בעליית הדף
window.addEventListener('DOMContentLoaded', () => {
    fetchHouseDataFromServer();
});