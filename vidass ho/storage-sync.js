// ==========================================
// VIDASS - Unified Secure Real-Time House Sync Engine
// מנוע סנכרון מאוחד ואחיד לכל דפדפני הבית מול שרת הענן הפרטי
// ==========================================

const VIDASS_STORAGE_PREFIX = "vidass_house_";
let globalSyncInterval = null;

// כתובת שרת ה-Flask הפרטי (ניתן לעדכן לכתובת ה-IP של השרת ברשת Tailscale)
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
        houseCode = "EILAT-33"; // קוד ברירת מחדל משותף
        localStorage.setItem("vidass_current_house", houseCode);
        localStorage.setItem("vidass_current_house_code", houseCode);
    }
    return houseCode;
}

// הצטרפות לבית קיים (כאשר דייר מזין קוד בית)
function setCurrentHouseCode(code) {
    if (code && code.trim() !== "") {
        const cleanCode = code.trim();
        localStorage.setItem("vidass_current_house", cleanCode);
        localStorage.setItem("vidass_current_house_code", cleanCode);
        fetchHouseDataFromServer(true);
    }
}

// קבלת שם המשתמש הנוכחי במכשיר (למשל: ויקי או דוד)
function getCurrentUser() {
    return localStorage.getItem("vidass_current_user") || "ויקי";
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem("vidass_current_user", username.trim());
        registerMemberToHouse(username.trim());
    }
}

// רישום דייר חדש לרשימת הבית
function registerMemberToHouse(userName) {
    let members = getHouseMembers();
    if (!members.includes(userName)) {
        members.push(userName);
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
    return data ? JSON.parse(data) : [getCurrentUser()];
}

// שמירת רשימת הדיירים ועדכון השרת
function saveHouseMembers(members) {
    const houseCode = getCurrentHouseCode();
    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(members));
    syncWithFlaskServer({ members: members });
}

// שליפת מידע משותף מכל מודול (קניות, מלאי, משימות, דמי כיס וכו')
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
    
    // 1. שמירה מקומית מיידית לתגובה חלקה
    localStorage.setItem(fullKey, JSON.stringify(data));

    // 2. שליחה לשרת ה-Flask כדי ששאר בני הבית יראו מיד את השינוי
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

// משיכת נתונים עדכניים מהשרת עבור כל המודולים (סנכרון חי)
async function fetchHouseDataFromServer(forceReload = false) {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/get/${houseCode}`);
        if (response.ok) {
            const serverData = await response.json();
            if (serverData) {
                let hasChanges = false;
                
                // עדכון דיירים
                if (serverData.members) {
                    const localMembers = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`);
                    const serverMembersStr = JSON.stringify(serverData.members);
                    if (localMembers !== serverMembersStr) {
                        localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, serverMembersStr);
                        hasChanges = true;
                    }
                }

                // עדכון כל מודולי המידע (קניות, מלאי, משימות, דמי כיס, טיולים, מזג אוויר וכו')
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

                // רענון אוטומטי של התצוגה בדפדפן הפעיל אם התקבלו נתונים חדשים משאר בני הבית
                if (hasChanges || forceReload) {
                    if (typeof window.loadItems === 'function') window.loadItems();
                    if (typeof window.loadTasks === 'function') window.loadTasks();
                    if (typeof window.loadPocketRecords === 'function') window.loadPocketRecords();
                    if (typeof window.loadTrips === 'function') window.loadTrips();
                    if (typeof window.loadWeatherNotes === 'function') window.loadWeatherNotes();
                    if (typeof window.loadMembers === 'function') window.loadMembers();
                }
            }
        }
    } catch (e) {
        // שגיאת רשת שקטה
    }
}

// הפעלה אוטומטית עם טעינת כל דפדפן
window.addEventListener('DOMContentLoaded', () => {
    registerMemberToHouse(getCurrentUser());
    fetchHouseDataFromServer(true);

    // מנגנון סנכרון חי (Polling) שבודק עדכונים מהשרת כל 3 שניות
    if (!globalSyncInterval) {
        globalSyncInterval = setInterval(() => {
            fetchHouseDataFromServer(false);
        }, 3000);
    }
});