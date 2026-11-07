from flask import Flask, request, jsonify
import json
import os

app = Flask(__name__)
DB_FILE = "vidass_data.json"

# טעינת הנתונים מהקובץ המקומי בשרת עם הגנה מפני קבצים ריקים או פגומים
def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"שגיאה בטעינת מסד הנתונים: {e}")
        return {}

# שמירת הנתונים בקובץ המקומי בשרת בצורה מאובטחת
def save_db(data):
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"שגיאה בשמירת מסד הנתונים: {e}")

# נתיב בדיקת תקינות השרת (Health Check)
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "online", "system": "VIDASS Private Cloud Core"})

# נתיב לקבלת כל הנתונים והמודולים של בית מסוים לפי קוד הבית
@app.route('/api/get/<house_code>', methods=['GET'])
def get_house_data(house_code):
    db = load_db()
    # אם קוד הבית קיים, נחזיר אותו. אם לא, נחזיר מבנה ריק ומאובטח לבית חדש
    house_data = db.get(house_code, {
        "admin": "",
        "members": [],
        "data": {
            "inventory": [],
            "shopping": [],
            "tasks": [],
            "recipes": [],
            "expenses": [],
            "calendar": [],
            "birthdays": [],
            "travel": [],
            "weather": [],
            "coach": [],
            "alerts": [],
            "pocket": []
        }
    })
    return jsonify(house_data)

# נתיב לעדכון ושמירת נתונים של הבית בזמן אמת מכל המכשירים של בני הבית
@app.route('/api/save/<house_code>', methods=['POST'])
def save_house_data(house_code):
    db = load_db()
    req_data = request.json
    
    if not req_data:
        return jsonify({"status": "error", "message": "לא התקבלו נתונים לשמירה"}), 400

    if house_code not in db:
        db[house_code] = {
            "members": [], 
            "data": {
                "inventory": [], "shopping": [], "tasks": [], "recipes": [], 
                "expenses": [], "calendar": [], "birthdays": [], "travel": [], 
                "weather": [], "coach": [], "alerts": [], "pocket": []
            }
        }
    
    # עדכון רשימת חברי הבית (הדיירים) אם קיימים בבקשה
    if "members" in req_data:
        db[house_code]["members"] = req_data["members"]
        
    # עדכון או הוספה של מודולים (קניות, משימות, מלאי, דמי כיס וכו')
    if "data" in req_data:
        for module_key, module_val in req_data["data"].items():
            db[house_code]["data"][module_key] = module_val
        
    save_db(db)
    return jsonify({"status": "success", "message": "הנתונים עודכנו בענן הפרטי בהצלחה!"})

if __name__ == '__main__':
    print("🚀 שרת הענן הפרטי של VIDASS מופעל ורץ ברשת המאובטחת...")
    # השרת רץ על פורט 5000 ונגיש לכל מכשירי המשפחה דרך רשת Tailscale
    app.run(host='0.0.0.0', port=5000, debug=True)