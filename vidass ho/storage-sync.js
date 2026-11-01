/**
 * VIDASS Core System - Storage Sync Manager
 * מנהל את הסנכרון והתקשורת המשותפת בין כל הדיירים באותו הבית
 */

// קבלת קוד הבית הפעיל של המשתמש המחובר כרגע
function getCurrentHouseCode() {
    return localStorage.getItem('vidass_current_house') || 'DEFAULT_HOUSE';
}

// קבלת שם המשתמש המחובר כרגע
function getCurrentUser() {
    return localStorage.getItem('vidass_current_user') || 'דייר';
}

// קריאת נתונים משותפים מנוהלים לכל דיירי הבית לפי קוד הבית
function getSharedData(appKey) {
    const houseCode = getCurrentHouseCode();
    let allHouses = JSON.parse(localStorage.getItem('vidass_all_houses')) || {};
    
    // בדיקה אם הבית קיים ויש לו נתונים עבור האפליקציה הזו
    if (allHouses[houseCode] && allHouses[houseCode].data) {
        return allHouses[houseCode].data[appKey] || [];
    }
    
    // גיבוי מקומי במידה ואין עדיין אובייקט מרכזי
    return JSON.parse(localStorage.getItem(`vidass_${houseCode}_${appKey}`)) || [];
}

// שמירת נתונים כך שכל שאר הדיירים המחוברים לאותו בית יראו אותם מיד
function saveSharedData(appKey, dataArray) {
    const houseCode = getCurrentHouseCode();
    let allHouses = JSON.parse(localStorage.getItem('vidass_all_houses')) || {};
    
    // וידוא קיומו של מבנה הבית במערכת
    if (!allHouses[houseCode]) {
        allHouses[houseCode] = {
            admin: getCurrentUser(),
            members: [getCurrentUser()],
            data: {}
        };
    }
    if (!allHouses[houseCode].data) {
        allHouses[houseCode].data = {};
    }
    
    // שמירת המערך המעודכן תחת מפתח האפליקציה של הבית
    allHouses[houseCode].data[appKey] = dataArray;
    localStorage.setItem('vidass_all_houses', JSON.stringify(allHouses));
    
    // שמירת גיבוי מיידי בזיכרון המקומי של המכשיר
    localStorage.setItem(`vidass_${houseCode}_${appKey}`, JSON.stringify(dataArray));
}

// פונקציית עזר להוספת פריט חדש עם תיעוד מי הוסיף אותו
function addSharedItem(appKey, itemObj) {
    let data = getSharedData(appKey);
    itemObj.addedBy = getCurrentUser();
    itemObj.date = new Date().toLocaleDateString('he-IL');
    itemObj.time = new Date().toLocaleTimeString('he-IL');
    data.push(itemObj);
    saveSharedData(appKey, data);
    return data;
}

// פונקציית עזר למחיקת פריט לפי אינדקס
function removeSharedItem(appKey, index) {
    let data = getSharedData(appKey);
    data.splice(index, 1);
    saveSharedData(appKey, data);
    return data;
}