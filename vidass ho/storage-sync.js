/**
 * VIDASS Storage & Sync Engine (Client-Side)
 * מנהל את הסנכרון בין ה-localStorage, הדפדפנים השונים ושרת ה-Flask המרכזי.
 */

// זיהוי אוטומטי של קוד הבית מתוך ה-URL, הזיכרון המקומי או ברירת מחדל
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

// זיהוי שם המשתמש הנוכחי
function getCurrentUser() {
    return localStorage.getItem('vidass_current_user') || 'ויקי';
}

// ברכת שלום מותאמת אישית
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

// שליפת נתונים של מודול מסוים (למשל 'shopping', 'tasks', 'alerts')
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

// שמירת נתונים מקומית ושיגורם לשרת ה-Flask בזמן אמת
async function saveSharedData(moduleName, dataArray) {
    const houseCode = getCurrentHouseCode();
    const storageKey = `vidass_${moduleName}_${houseCode}`;

    // 1. שמירה מיידית ב-localStorage לחוויית משתמש חלקה (Offline-first)
    try {
        localStorage.setItem(storageKey, JSON.stringify(dataArray));
    } catch (e) {
        console.error("שגיאה בשמירה ל-localStorage:", e);
    }

    // 2. שליחה ברקע לשרת ה-Flask המרכזי
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
            console.warn("הנתונים נשמרו מקומית, אך השרת החזיק תשובה שגوية בשמירה לענן.");
        }
    } catch (err) {
        console.log("שרת הענן אינו זמין כרגע – הנתונים נשמרו ויעבדו בצורה מקומית בדפדפן.");
    }
}

// פונקציית סנכרון ראשית מול שרת ה-Flask (מושכת את כל נתוני הבית מהשרת)
async function fetchHouseDataFromServer(updateUI = false) {
    const houseCode = getCurrentHouseCode();
    try {
        const response = await fetch(`/api/get/${encodeURIComponent(houseCode)}`);
        if (response.ok) {
            const housePackage = await response.json();
            
            // אם השרת החזיר מבנה נתונים מלא, נעדכן את ה-localStorage עבור כל מודול
            if (housePackage && housePackage.data) {
                for (const [modKey, modVal] of Object.entries(housePackage.data)) {
                    localStorage.setItem(`vidass_${modKey}_${houseCode}`, JSON.stringify(modVal));
                }
            }
            
            console.log("🟢 הנתונים סונכרנו בהצלחה מול שרת הענן עבור בית:", houseCode);
            
            // אם העמוד מבקש רענון תצוגה לאחר טעינה מהענן
            if (updateUI && typeof window.loadAlerts === 'function') {
                window.loadAlerts();
            }
            if (updateUI && typeof window.loadShoppingList === 'function') {
                window.loadShoppingList();
            }
        }
    } catch (e) {
        console.log("מצב לא מקוון (Offline Mode): עובד מול הזיכרון המקומי בדפדפן.");
    }
}

// הפעלה אוטומטית ברגע טעינת כל קובץ במערכת
document.addEventListener("DOMContentLoaded", () => {
    getCurrentHouseCode();
    // ניסיון משיכת נתונים מהענן ברקע בלי לפגוע במהירות הטעינה
    setTimeout(() => {
        fetchHouseDataFromServer(true);
    }, 300);
});