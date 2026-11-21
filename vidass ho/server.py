from flask import Flask, request, jsonify, send_from_directory
import hashlib
import hmac
import json
import os
import secrets
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "vidass_data.json")
_db_lock = threading.Lock()

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

DEFAULT_MODULES = {
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
    "iot_devices": [],
    "events": [],
    "birthdays": [],
    "coach": [],
    "where_is_child": [],
}


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(stored_value: str, candidate: str) -> bool:
    if not stored_value:
        return candidate == ""
    if stored_value.startswith("pbkdf2_sha256$"):
        parts = stored_value.split("$", 2)
        if len(parts) != 3:
            return False
        _, salt, expected_hex = parts
        actual_hex = hashlib.pbkdf2_hmac(
            "sha256", candidate.encode("utf-8"), salt.encode("utf-8"), 100_000
        ).hex()
        return hmac.compare_digest(actual_hex, expected_hex)
    return hmac.compare_digest(stored_value, candidate)


def make_new_house_record(password: str = "1234") -> dict:
    effective_password = password.strip() if password and password.strip() else "1234"
    return {
        "password_hash": hash_password(effective_password),
        "members": [{"name": "ויקי", "phone": "לא צוין", "role": "מנהל הבית"}],
        "data": {k: list(v) for k, v in DEFAULT_MODULES.items()},
    }


def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"שגיאה בטעינת מסד הנתונים: {e}")
        return {}


def save_db(data):
    temp_file = f"{DB_FILE}.tmp"
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        os.replace(temp_file, DB_FILE)
    except Exception as e:
        print(f"שגיאה בשמירת מסד הנתונים: {e}")
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/", methods=["GET"])
def serve_root():
    for candidate in ("index.html", "login.html"):
        if os.path.exists(os.path.join(BASE_DIR, candidate)):
            return send_from_directory(BASE_DIR, candidate)
    return jsonify({"status": "online", "system": "VIDASS Private Cloud Core"})


@app.route("/<path:filename>", methods=["GET"])
def serve_static(filename):
    if filename.startswith("api/"):
        return jsonify({"status": "error", "message": "נתיב API לא נמצא"}), 404
    safe_path = os.path.abspath(os.path.join(BASE_DIR, filename))
    if not safe_path.startswith(BASE_DIR + os.sep) and safe_path != BASE_DIR:
        return jsonify({"status": "error", "message": "גישה נדחתה"}), 403
    if os.path.isfile(safe_path):
        return send_from_directory(BASE_DIR, filename)
    return jsonify({"status": "error", "message": "קובץ לא נמצא"}), 404


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "online", "system": "VIDASS Private Cloud Core"})


@app.route("/api/auth", methods=["POST", "OPTIONS"])
def authenticate_house():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    req_data = request.get_json(silent=True) or {}
    house_code = str(req_data.get("house_code", "")).strip().upper()
    password = str(req_data.get("password", ""))

    if not house_code:
        return jsonify({"status": "error", "message": "נא להזין קוד בית"}), 400

    with _db_lock:
        db = load_db()

        if house_code not in db:
            db[house_code] = make_new_house_record(password)
            save_db(db)
            token = secrets.token_urlsafe(24)
            return jsonify({
                "status": "success",
                "message": "הבית נוצר בהצלחה והחיבור אושר!",
                "token": token,
            })

        house_record = db[house_code]
        stored_secret = house_record.get("password_hash")
        if stored_secret is None:
            stored_secret = house_record.get("password", "1234")
            house_record["password_hash"] = hash_password(str(stored_secret))
            house_record.pop("password", None)
            save_db(db)

        if not verify_password(str(stored_secret), password):
            return jsonify({"status": "error", "message": "סיסמת בית שגויה!"}), 401

        token = secrets.token_urlsafe(24)
        return jsonify({
            "status": "success",
            "message": "האימות עבר בהצלחה!",
            "token": token,
        })


@app.route("/api/get/<house_code>", methods=["GET"])
def get_house_data(house_code):
    clean_code = str(house_code or "").strip().upper()
    with _db_lock:
        db = load_db()

    if clean_code not in db:
        return jsonify({"status": "error", "message": "הבית אינו קיים במערכת"}), 404

    record = db[clean_code]
    merged_data = {k: list(v) for k, v in DEFAULT_MODULES.items()}
    if isinstance(record.get("data"), dict):
        merged_data.update(record["data"])

    return jsonify({
        "members": record.get("members", []),
        "data": merged_data,
    })


@app.route("/api/save/<house_code>", methods=["POST", "OPTIONS"])
def save_house_data(house_code):
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    clean_code = str(house_code or "").strip().upper()
    if not clean_code:
        return jsonify({"status": "error", "message": "קוד בית חסר"}), 400

    req_data = request.get_json(silent=True) or {}

    with _db_lock:
        db = load_db()
        if clean_code not in db:
            db[clean_code] = make_new_house_record("1234")

        house_record = db[clean_code]
        house_record.setdefault("data", {})

        if "members" in req_data and isinstance(req_data["members"], list):
            house_record["members"] = req_data["members"]

        if "data" in req_data and isinstance(req_data["data"], dict):
            for module_key, module_val in req_data["data"].items():
                house_record["data"][module_key] = module_val

        save_db(db)

    return jsonify({"status": "success", "message": "הנתונים עודכנו בענן הפרטי בהצלחה!"})


if __name__ == "__main__":
    print("🚀 שרת הענן הפרטי של VIDASS רץ כעת ומוכן עם אבטחת סיסמאות לבתים...")
    app.run(host="0.0.0.0", port=5000, debug=True)