// ==========================================
// VIDASS - Secure Local & Flask Server Sync Engine
// מנהל את קוד הבית, בידוד הנתונים, האחסון המקומי והסנכרון מול שרת הענן הפרטי
// ==========================================

const VIDASS_STORAGE_PREFIX = "vidass_house_";

// כתובת שרת ה-Flask הפרטי (ניתן לשנות לכתובת ה-Tailscale או ה-IP של השרת התידעי בבית)
// אם משתמשים בלוקאל-הוסט או בשרת פנימי, הכתובת מתעדכנת אוטומטית
const getFlaskServerUrl = () => {
    // ניתן להגדיר כתובת IP קבועה של שרת ה-Tailscale הביתי שלך, למשל: "http://100.x.x.x:5000"
    // כברירת מחדל מתחבר לשרת המקומי באותו מארח או לשרת ה-Flask שלך:
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
        houseCode = "EILAT-33"; // ברירת מחדל מותאמת אישית לבית
        localStorage.setItem("vidass_current_house", houseCode);
    }
    return houseCode;
}

// הגדרת קוד בית חדש למערכת
function setCurrentHouseCode(code) {
    if (code && code.trim() !== "") {
        localStorage.setItem("vidass_current_house", code.trim());
        localStorage.setItem("vidass_current_house_code", code.trim());
    }
}

// קבלת שם המשתמש הנוכחי במערכת (למשל: ויקי או דוד)
function getCurrentUser() {
    return localStorage.getItem("vidass_current_user") || "ויקי";
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem("vidass_current_user", username.trim());
    }
}

// ברכה אישית לפי שעות היום המותאמת אישית
function getPersonalizedGreeting() {
    const hour = new Date().getHours();
    const user = getCurrentUser();
    if (hour >= 5 && hour < 12) {
        return `בוקר טוב, ${user}`;
    } else if (hour >= 12 && hour < 17) {
        return `צהריים טובים, ${user}`;
    } else if (hour >= 17 && hour < 21) {
        return `ערב טוב, ${user}`;
    } else {
        return `לילה טוב, ${user}`;
    }
}

// שליפת רשימת הדיירים הרשומים תחת קוד הבית הנוכחי
function getHouseMembers() {
    const houseCode = getCurrentHouseCode();
    const data = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`);
    return data ? JSON.parse(data) : ["ויקי", "דוד"];
}

// שמירת רשימת הדיירים לבית הנוכחי
function saveHouseMembers(members) {
    const houseCode = getCurrentHouseCode();
    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(members));
    
    // סנכרון רקע מול שרת ה-Flask אם קיים
    syncWithFlaskServer({ members: members });
}

// שליפת מידע משותף כללי (כמו קניות, משימות, מלאי, דמי כיס וכו')
function getSharedData(key) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    const data = localStorage.getItem(fullKey);
    return data ? JSON.parse(data) : [];
}

// שמירת מידע משותף תחת קוד הבית (גם מקומית וגם בשרת ה-Flask הפרטי)
function saveSharedData(key, data) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    
    // 1. שמירה מיידית בזיכרון המקומי (Local Storage) לגיבוי מהיר
    localStorage.setItem(fullKey, JSON.stringify(data));

    // 2. שליחה ברקע לשרת ה-Flask הפרטי כדי ששאר 8 הטלפונים בבית יראו את העדכון
    let payload = {
        data: {}
    };
    payload.data[key] = data;
    syncWithFlaskServer(payload);
}

// פונקציית תקשורת אסינכרונית עם שרת ה-Flask של הענן הפרטי
async function syncWithFlaskServer(payload) {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/save/${houseCode}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            console.warn("התראה: שרת הענן הפרטי לא הגיב כמצופה, הנתונים נשמרו בגיבוי המקומי.");
        }
    } catch (error) {
        // שגיאת תקשורת שקטה (כשהשרת כבוי, המערכת ממשיכה לעבוד חלק מקומית)
        console.log("מצב לא מקוון (Offline Mode): פועל על אחסון מקומי מאובטח.");
    }
}

// פונקציית טעינה ראשונית מהשרת בעת הפעלת המערכת
async function fetchHouseDataFromServer() {
    const houseCode = getCurrentHouseCode();
    const serverUrl = getFlaskServerUrl();

    try {
        const response = await fetch(`${serverUrl}/api/get/${houseCode}`);
        if (response.ok) {
            const serverData = await response.json();
            if (serverData && serverData.data) {
                // עדכון האחסון המקומי בנתונים החדשים מהשרת
                if (serverData.members) {
                    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(serverData.members));
                }
                for (const [key, val] of Object.entries(serverData.data)) {
                    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`, JSON.stringify(val));
                }
                console.log("הנתונים סונכרנו בהצלחה מענן הבית הפרטי!");
            }
        }
    } catch (e) {
        console.log("טוען נתונים מהזיכרון המקומי...");
    }
}

// הפעלה אוטומטית של בדיקת סנכרון עם טעינת הדף
window.addEventListener('DOMContentLoaded', () => {
    fetchHouseDataFromServer();
});