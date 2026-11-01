/**
 * VIDASS Core System - Firebase Cloud Storage Sync
 * מתחבר למאגר הנתונים בזמן אמת של Firebase ומסנכרן את כל דיירי הבית בלייב
 */

// הגדרות החיבור ל-Firebase (יש לעדכן עם פרטי הפרויקט האמיתיים שלך מתוך קונסולת Firebase)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// אתחול Firebase (במידה וטרם אותר)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// קבלת קוד הבית הפעיל של המשתמש המחובר
function getCurrentHouseCode() {
    return localStorage.getItem('vidass_current_house') || 'DEFAULT_HOUSE';
}

// קבלת שם המשתמש המחובר כרגע
function getCurrentUser() {
    return localStorage.getItem('vidass_current_user') || 'דייר';
}

// קריאת נתונים משותפים בזמן אמת מתוך בסיס הנתונים בענן לפי קוד הבית
function getSharedData(appKey) {
    const houseCode = getCurrentHouseCode();
    
    // אם Firebase זמין, ננסה לשלוף את הנתונים מהענן
    if (typeof firebase !== 'undefined') {
        let cachedData = localStorage.getItem(`vidass_cloud_${houseCode}_${appKey}`);
        return cachedData ? JSON.parse(cachedData) : [];
    }
    
    // גיבוי מקומי במידת הצורך
    return JSON.parse(localStorage.getItem(`vidass_${houseCode}_${appKey}`)) || [];
}

// שמירת נתונים כך שיישלחו מיד לענן וכל שאר דיירי הבית יראו אותם בלייב
function saveSharedData(appKey, dataArray) {
    const houseCode = getCurrentHouseCode();
    
    // שמירה מקומית לגיבוי מהיר
    localStorage.setItem(`vidass_${houseCode}_${appKey}`, JSON.stringify(dataArray));
    localStorage.setItem(`vidass_cloud_${houseCode}_${appKey}`, JSON.stringify(dataArray));

    // שמירה אמיתית בענן של Firebase תחת נתיב הבית
    if (typeof firebase !== 'undefined') {
        const dbRef = firebase.database().ref(`houses/${houseCode}/${appKey}`);
        dbRef.set(dataArray).catch(error => {
            console.error("שגיאה בסנכרון לענן:", error);
        });
    }
}

// האזנה לשינויים בענן בלייב (כדי שדייר אחר שמוסיף משהו יעדכן את המסך אצלך מיד)
function listenToCloudChanges(appKey, callback) {
    const houseCode = getCurrentHouseCode();
    if (typeof firebase !== 'undefined') {
        const dbRef = firebase.database().ref(`houses/${houseCode}/${appKey}`);
        dbRef.on('value', (snapshot) => {
            const data = snapshot.val() || [];
            localStorage.setItem(`vidass_cloud_${houseCode}_${appKey}`, JSON.stringify(data));
            if (callback) callback(data);
        });
    }
}

// פונקציית עזר להוספת פריט חדש
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