// ==========================================
// VIDASS - Secure Real-Time House Sync Engine
// מנוע סנכרון חי ואמיתי בין כל מכשירי הבית לשרת ה-Flask הפרטי
// ==========================================

const VIDASS_STORAGE_PREFIX = "vidass_house_";
let syncInterval = null;

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

// הצטרפות לבית קיים (למשל כשדוד מקבל ממך את הקוד ומזין אותו)
function setCurrentHouseCode(code) {
    if (code && code.trim() !== "") {
        const cleanCode = code.trim();
        localStorage.setItem("vidass_current_house", cleanCode);
        localStorage.setItem("vidass_current_house_code", cleanCode);
        // משיכה מיידית של נתוני הבית מהשרת
        fetchHouseDataFromServer(true);
    }
}

// קבלת שם המשתמש הנוכחי במכשיר (ויקי / דוד)
function getCurrentUser() {
    return localStorage.getItem("vidass_current_user") || "ויקי";
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem("vidass_current_user", username.trim());
        // רישום אוטומטי של המשתמש ברשימת הדיירים של הבית
        registerMemberToHouse(username.trim());
    }
}

// רישום דייר חדש לבית כך שכולם יראו מי מחובר
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

// שמירת רשימת הדיירים ועדכון שרת ה-Flask
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

// שמירת מידע משותף (גם מקומית וגם שליחה מיידית לשרת)
function saveSharedData(key, data) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    
    // 1. שמירה מקומית
    localStorage.setItem(fullKey, JSON.stringify(data));

    // 2. שליחה מיידית לשרת ה-Flask כדי שדוד ושאר בני הבית יראו מיד
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
        console.log("מצב לא מקוון (Offline): שרת הענן הפרטי לא זמין כרגע.");
    }
}

// משיכת נתונים עדכניים מהשרת (מופעל אוטומטית כל כמה שניות לסנכרון חי)
async function fetchHouseDataFromServer(forceReload = false) {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/get/${houseCode}`);
        if (response.ok) {
            const serverData = await response.json();
            if (serverData) {
                let hasChanges = false;
                
                // בדיקת דיירים
                if (serverData.members) {
                    const localMembers = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`);
                    const serverMembersStr = JSON.stringify(serverData.members);
                    if (localMembers !== serverMembersStr) {
                        localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, serverMembersStr);
                        hasChanges = true;
                    }
                }

                // בדיקת נתוני המודולים
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

                // אם היו שינויים מהשרת והדף פתוח, נרענן את הנתונים במסך אוטומטית!
                if ((hasChanges || forceReload) && typeof window.loadItems === 'function') window.loadItems();
                if ((hasChanges || forceReload) && typeof window.loadTasks === 'function') window.loadTasks();
                if ((hasChanges || forceReload) && typeof window.loadPocketRecords === 'function') window.loadPocketRecords();
                if ((hasChanges || forceReload) && typeof window.loadTrips === 'function') window.loadTrips();
                if ((hasChanges || forceReload) && typeof window.loadWeatherNotes === 'function') window.loadWeatherNotes();
            }
        }
    } catch (e) {
        // שגיאת רשת שקטה במצב אופליין
    }
}

// הפעלה אוטומטית: משיכה ראשונית והפעלת סנכרון חי ברקע כל 3 שניות!
window.addEventListener('DOMContentLoaded', () => {
    // רישום אוטומטי של המשתמש הנוכחי בבית
    registerMemberToHouse(getCurrentUser());
    
    // טעינה ראשונית
    fetchHouseDataFromServer(true);

    // פעימת לב (Polling) - סנכרון אוטומטי כל 3 שניות בין הטלפונים שלכם!
    if (!syncInterval) {
        syncInterval = setInterval(() => {
            fetchHouseDataFromServer(false);
        }, 3000);
    }
});