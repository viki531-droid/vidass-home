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

@app.route('/api/get/<house_code>', methods=['GET'])
def get_house_data(house_code):
    db = load_db()
    # מבנה נתונים מלא ומוגן לכל בית חדש או קיים
    house_data = db.get(house_code, {
        "members": ["ויקי"],
        "data": {
            "shopping": [],
            "inventory": [],
            "tasks": [],
            "recipes": [],
            "pocket": [],
            "travel": [],
            "weather": [],
            "expenses": [],
            "calendar": []
        }
    })
    return jsonify(house_data)

@app.route('/api/save/<house_code>', methods=['POST'])
def save_house_data(house_code):
    db = load_db()
    req_data = request.json
    
    if not req_data:
        return jsonify({"status": "error", "message": "לא התקבלו נתונים לשמירה"}), 400

    if house_code not in db:
        db[house_code] = {
            "members": ["ויקי"], 
            "data": {
                "shopping": [], "inventory": [], "tasks": [], "recipes": [], 
                "pocket": [], "travel": [], "weather": [], "expenses": [], "calendar": []
            }
        }
    
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
    print("🚀 שרת הענן הפרטי של VIDASS רץ כעת ומוכן לחיבור כל מכשירי המשפחה...")
    app.run(host='0.0.0.0', port=5000, debug=True)