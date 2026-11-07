from flask import Flask, request, jsonify
import json
import os

app = Flask(__name__)
DB_FILE = "vidass_data.json"

def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"שגיאה בטעינת מסד הנתונים: {e}")
        return {}

def save_db(data):
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"שגיאה בשמירת מסד הנתונים: {e}")

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "online", "system": "VIDASS Private Cloud Core"})

# נקודת קצה חדשה לאימות קוד בית וסיסמה
@app.route('/api/auth', methods=['POST'])
def authenticate_house():
    db = load_db()
    req_data = request.json or {}
    house_code = req_data.get('house_code', '').strip().upper()
    password = req_data.get('password', '').strip()

    if not house_code:
        return jsonify({"status": "error", "message": "נא להזין קוד בית"}), 400

    # אם הבית לא קיים עדיין, ניצור אותו אוטומטית עם סיסמת ברירת מחדל
    if house_code not in db:
        db[house_code] = {
            "password": password if password else "1234",
            "members": [{"name": "ויקי", "phone": "לא צוין", "role": "מנהל הבית"}],
            "data": {
                "shopping": [], "inventory": [], "tasks": [], "recipes": [], 
                "pocket": [], "travel": [], "weather": [], "expenses": [], "calendar": [], "alerts": []
            }
        }
        save_db(db)
        return jsonify({"status": "success", "message": "הבית נוצר בהצלחה והחיבור אושר!"})

    # בדיקת תקינות סיסמה לבית קיים
    stored_password = db[house_code].get("password", "1234")
    if stored_password != password:
        return jsonify({"status": "error", "message": "סיסמת בית שגויה!"}), 401

    return jsonify({"status": "success", "message": "האימות עבר בהצלחה!"})

@app.route('/api/get/<house_code>', methods=['GET'])
def get_house_data(house_code):
    db = load_db()
    house_code = house_code.strip().upper()
    
    if house_code not in db:
        return jsonify({"status": "error", "message": "הבית אינו קיים במערכת"}), 404

    # מחזירים את נתוני הבית (ללא סיסמה מטעמי אבטחה)
    house_package = {
        "members": db[house_code].get("members", []),
        "data": db[house_code].get("data", {})
    }
    return jsonify(house_package)

@app.route('/api/save/<house_code>', methods=['POST'])
def save_house_data(house_code):
    db = load_db()
    house_code = house_code.strip().upper()
    req_data = request.json or {}
    
    if house_code not in db:
        return jsonify({"status": "error", "message": "הבית אינו קיים, נדרש אימות ראשוני"}), 404

    # עדכון רשימת הדיירים אם קיימת בבקשה
    if "members" in req_data:
        db[house_code]["members"] = req_data["members"]
        
    # עדכון המודולים השונים בזמן אמת
    if "data" in req_data:
        for module_key, module_val in req_data["data"].items():
            db[house_code]["data"][module_key] = module_val
        
    save_db(db)
    return jsonify({"status": "success", "message": "הנתונים עודכנו בענן הפרטי בהצלחה!"})

if __name__ == '__main__':
    print("🚀 שרת הענן הפרטי של VIDASS רץ כעת ומוכן עם אבטחת סיסמאות לבתים...")
    app.run(host='0.0.0.0', port=5000, debug=True)