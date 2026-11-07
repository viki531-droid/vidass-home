from flask import Flask, request, jsonify
import json
import os

app = Flask(__name__)
DB_FILE = "vidass_data.json"

# טעינת הנתונים מהקובץ המקומי בשרת
def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    with open(DB_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except:
            return {}

# שמירת הנתונים בקובץ המקומי בשרת
def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

# נתיב לקבלת כל הנתונים של בית מסוים לפי קוד הבית
@app.route('/api/get/<house_code>', methods=['GET'])
def get_house_data(house_code):
    db = load_db()
    house_data = db.get(house_code, {"members": [], "data": {}})
    return jsonify(house_data)

# נתיב לעדכון ושמירת נתונים של הבית בזמן אמת
@app.route('/api/save/<house_code>', methods=['POST'])
def save_house_data(house_code):
    db = load_db()
    req_data = request.json
    
    if house_code not in db:
        db[house_code] = {"members": [], "data": {}}
    
    # עדכון הנתונים או המודולים (כמו קניות, משימות, דיירים)
    if "members" in req_data:
        db[house_code]["members"] = req_data["members"]
    if "data" in req_data:
        db[house_code]["data"].update(req_data["data"])
        
    save_db(db)
    return jsonify({"status": "success", "message": "הנתונים עודכנו בענן הפרטי בהצלחה!"})

if __name__ == '__main__':
    # השרת ירוץ על פורט 5000 ויהיה זמין בתוך רשת ה-Tailscale הביתית
    app.run(host='0.0.0.0', port=5000)