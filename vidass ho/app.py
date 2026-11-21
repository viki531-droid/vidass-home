from flask import Flask, request, jsonify, send_from_directory, make_response
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "vidass_data.json")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")


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


def default_house_payload():
    return {
        "members": [{"name": "ויקי", "phone": "לא צוין", "role": "מנהל הבית"}],
        "data": {
            "shopping": [],
            "inventory": [],
            "tasks": [],
            "recipes": [],
            "pocket": [],
            "travel": [],
            "weather": [],
            "expenses": [],
            "calendar": [],
            "alerts": [],
            "birthdays": [],
            "events": [],
            "coach": [],
        },
    }


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/", methods=["GET"])
def serve_index():
    for candidate in ("main_hub.html", "index.html", "alerts.html", "expenses.html"):
        if os.path.exists(os.path.join(BASE_DIR, candidate)):
            return send_from_directory(BASE_DIR, candidate)
    return jsonify({"status": "online", "system": "VIDASS Private Cloud Core"})


@app.route("/<path:filename>", methods=["GET"])
def serve_static_file(filename):
    if filename.startswith("api/"):
        return jsonify({"status": "error", "message": "נתיב API לא נמצא"}), 404
    safe_path = os.path.abspath(os.path.join(BASE_DIR, filename))
    if not safe_path.startswith(BASE_DIR + os.sep) and safe_path != BASE_DIR:
        return jsonify({"status": "error", "message": "גישה נדחתה"}), 403
    if os.path.isfile(safe_path):
        return send_from_directory(BASE_DIR, filename)
    return jsonify({"status": "error", "message": "קובץ לא נמצא"}), 404


@app.route("/api/health", methods=["GET", "OPTIONS"])
def health_check():
    if request.method == "OPTIONS":
        return make_response("", 204)
    return jsonify({"status": "online", "system": "VIDASS Private Cloud Core"})


@app.route("/api/get/<house_code>", methods=["GET", "OPTIONS"])
def get_house_data(house_code):
    if request.method == "OPTIONS":
        return make_response("", 204)
    db = load_db()
    house_data = db.get(house_code, default_house_payload())
    return jsonify(house_data)


@app.route("/api/save/<house_code>", methods=["POST", "OPTIONS"])
def save_house_data(house_code):
    if request.method == "OPTIONS":
        return make_response("", 204)

    db = load_db()
    req_data = request.get_json(silent=True) or {}

    if not req_data:
        return jsonify({"status": "error", "message": "לא התקבלו נתונים לשמירה"}), 400

    if house_code not in db:
        db[house_code] = default_house_payload()

    if "members" in req_data:
        db[house_code]["members"] = req_data["members"]

    if "data" in req_data and isinstance(req_data["data"], dict):
        for module_key, module_val in req_data["data"].items():
            db[house_code]["data"][module_key] = module_val

    save_db(db)
    return jsonify({"status": "success", "message": "הנתונים עודכנו בענן הפרטי בהצלחה!"})


if __name__ == "__main__":
    print("🚀 שרת הענן הפרטי של VIDASS רץ כעת ומוכן לחיבור כל מכשירי המשפחה...")
    app.run(host="0.0.0.0", port=5000, debug=True)