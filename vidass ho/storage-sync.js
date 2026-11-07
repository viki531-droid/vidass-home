// VIDASS - Secure Local & Router Sync Engine
// מנהל את קוד הבית, בידוד הנתונים והסנכרון המקומי

const VIDASS_STORAGE_PREFIX = "vidass_house_";

// קבלת קוד הבית הנוכחי (ברירת מחדל לבית לדוגמה אם לא הוגדר)
function getCurrentHouseCode() {
    let houseCode = localStorage.getItem("vidass_current_house_code");
    if (!houseCode) {
        houseCode = "10000"; // ברירת מחדל להתחלה
        localStorage.setItem("vidass_current_house_code", houseCode);
    }
    return houseCode;
}

// הגדרת קוד בית חדש למערכת
function setCurrentHouseCode(code) {
    if (code && code.trim() !== "") {
        localStorage.setItem("vidass_current_house_code", code.trim());
    }
}

// קבלת שם המשתמש הנוכחי במערכת
function getCurrentUser() {
    return localStorage.getItem("vidass_current_user") || "משתמש אנונימי";
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem("vidass_current_user", username.trim());
    }
}

// שליפת רשימת הדיירים הרשומים תחת קוד הבית הנוכחי
function getHouseMembers() {
    const houseCode = getCurrentHouseCode();
    const data = localStorage.getItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`);
    return data ? JSON.parse(data) : ["ויקי", "דוד"]; // ברירת מחדל ראשונית
}

// שמירת רשימת הדיירים לבית הנוכחי
function saveHouseMembers(members) {
    const houseCode = getCurrentHouseCode();
    localStorage.setItem(`${VIDASS_STORAGE_PREFIX}${houseCode}_members`, JSON.stringify(members));
}

// שליפת מידע משותף כללי (כמו הודעות לוח בית, קניות, משימות)
function getSharedData(key) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    const data = localStorage.getItem(fullKey);
    return data ? JSON.parse(data) : [];
}

// שמירת מידע משותף תחת קוד הבית
function saveSharedData(key, data) {
    const houseCode = getCurrentHouseCode();
    const fullKey = `${VIDASS_STORAGE_PREFIX}${houseCode}_${key}`;
    localStorage.setItem(fullKey, JSON.stringify(data));
}