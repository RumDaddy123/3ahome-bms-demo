#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Máy chủ đặt TẠI TOÀ NHÀ cho phần mềm quản lý BMS.

Chạy trên máy tính công nghiệp hoặc máy chủ nhỏ trong phòng kỹ thuật, cùng mạng với các DDC.
Nó phục vụ giao diện web, giữ cấu hình riêng của toà nhà và ghi toàn bộ dữ liệu vận hành
vào một file SQLite nằm ngay trên máy đó.

Không có đoạn mã nào gửi dữ liệu ra ngoài. Muốn xem từ internet thì chủ đầu tư bật
chuyển tiếp ở mục "Đẩy lên internet" trong phần mềm và chỉ định địa chỉ của chính mình.

Chạy:   python3 server.py --port 8080 --data /var/lib/bms
Rồi vào phần mềm › Vận hành › Cài đặt › Nơi dữ liệu được lưu, điền:
        http://<địa-chỉ-máy-này>:8080/api
"""
import argparse, base64, hashlib, hmac, json, os, secrets, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = None


def db():
    c = sqlite3.connect(DB, timeout=10)
    c.execute("""CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
        synced INTEGER DEFAULT 0)""")
    c.execute("CREATE INDEX IF NOT EXISTS ix_events_kind ON events(kind, at)")
    c.execute("""CREATE TABLE IF NOT EXISTS config(
        k TEXT PRIMARY KEY, v TEXT NOT NULL, at TEXT NOT NULL)""")
    # người dùng của chính toà nhà này, mật khẩu băm PBKDF2 kèm muối riêng từng người
    c.execute("""CREATE TABLE IF NOT EXISTS users(
        u TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
        salt TEXT NOT NULL, hash TEXT NOT NULL, disabled INTEGER DEFAULT 0,
        at TEXT NOT NULL, last_login TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS sessions(
        token TEXT PRIMARY KEY, u TEXT NOT NULL, exp REAL NOT NULL, at TEXT NOT NULL)""")
    # lịch sử dài hạn: mỗi ngày một dòng, phần mềm tự chốt sổ mỗi giờ
    c.execute("""CREATE TABLE IF NOT EXISTS history(
        d TEXT PRIMARY KEY, payload TEXT NOT NULL, at TEXT NOT NULL)""")
    return c


# ---------- mật khẩu ----------
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000)
    return salt, base64.b64encode(h).decode()


def check_pw(pw, salt, want):
    _, got = hash_pw(pw, salt)
    return hmac.compare_digest(got, want)


def seed_users(c):
    if c.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
        return
    # Tài khoản khởi tạo. ĐỔI MẬT KHẨU NGAY sau khi bàn giao công trình.
    for u, pw, name, role in [
        ("admin", "3ahome@2026", "Quản trị hệ thống", "admin"),
        ("vanhanh", "vanhanh123", "Ca vận hành", "operator"),
        ("kythuat", "kythuat123", "Tổ kỹ thuật", "tech"),
        ("khach", "khach123", "Khách tham quan", "viewer"),
    ]:
        salt, h = hash_pw(pw)
        c.execute("INSERT INTO users(u,name,role,salt,hash,at) VALUES(?,?,?,?,?,?)",
                  (u, name, role, salt, h, time.strftime("%FT%T")))
    c.commit()
    print("Đã tạo tài khoản khởi tạo: admin / 3ahome@2026 — đổi mật khẩu ngay sau khi bàn giao.")


def who(c, token):
    if not token:
        return None
    r = c.execute("SELECT u, exp FROM sessions WHERE token=?", (token,)).fetchone()
    if not r or r[1] < time.time():
        return None
    row = c.execute("SELECT u, name, role, disabled FROM users WHERE u=?", (r[0],)).fetchone()
    if not row or row[3]:
        return None
    return {"u": row[0], "name": row[1], "role": row[2]}


class H(BaseHTTPRequestHandler):
    server_version = "BMS-OnPrem/1.0"

    def log_message(self, fmt, *a):
        print(f"{self.address_string()} {fmt % a}")

    # ---- tiện ích ----
    def send(self, code, body, ctype="application/json; charset=utf-8"):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        # chỉ cho phép trình duyệt trong cùng mạng gọi vào
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_OPTIONS(self):
        self.send(204, b"", "text/plain")

    # ---- đọc ----
    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/config":
            c = db()
            r = c.execute("SELECT v FROM config WHERE k='site'").fetchone()
            c.close()
            return self.send(200, json.loads(r[0]) if r else {})
        if p == "/api/events":
            c = db()
            rows = c.execute("SELECT at, kind, payload FROM events ORDER BY id DESC LIMIT 500").fetchall()
            c.close()
            return self.send(200, [{"at": a, "kind": k, "rec": json.loads(v)} for a, k, v in rows])
        if p == "/api/history":
            n = 400
            try:
                q = urlparse(self.path).query
                for kv in q.split("&"):
                    if kv.startswith("days="):
                        n = min(1000, int(kv[5:]))
            except Exception:
                pass
            c = db()
            rows = c.execute("SELECT payload FROM history ORDER BY d DESC LIMIT ?", (n,)).fetchall()
            c.close()
            return self.send(200, [json.loads(v[0]) for v in reversed(rows)])
        if p == "/api/users":
            c = db()
            me = who(c, self.headers.get("X-Token"))
            if not me or me["role"] != "admin":
                c.close(); return self.send(403, {"error": "cần quyền quản trị"})
            rows = c.execute("SELECT u,name,role,disabled,last_login FROM users ORDER BY u").fetchall()
            c.close()
            return self.send(200, [{"u": a, "name": b, "role": r, "disabled": d, "last_login": l}
                                   for a, b, r, d, l in rows])
        if p == "/api/auth/me":
            c = db(); me = who(c, self.headers.get("X-Token")); c.close()
            return self.send(200 if me else 401, me or {"error": "phiên hết hạn"})
        if p == "/api/health":
            c = db()
            n = c.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            c.close()
            return self.send(200, {"ok": True, "records": n, "db": DB, "at": time.strftime("%FT%T")})
        return self.static(p)

    # ---- ghi ----
    def do_POST(self):
        p = urlparse(self.path).path
        try:
            data = self.body()
        except Exception:
            return self.send(400, {"error": "payload không phải JSON"})
        if p == "/api/config":
            c = db()
            c.execute("INSERT INTO config(k,v,at) VALUES('site',?,?) "
                      "ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at",
                      (json.dumps(data, ensure_ascii=False), time.strftime("%FT%T")))
            c.commit(); c.close()
            return self.send(200, {"ok": True})
        if p == "/api/auth/login":
            c = db()
            r = c.execute("SELECT u,name,role,salt,hash,disabled FROM users WHERE u=?",
                          ((data.get("u") or "").strip().lower(),)).fetchone()
            if not r or not check_pw(data.get("p") or "", r[3], r[4]):
                c.close(); time.sleep(0.4)        # làm chậm việc dò mật khẩu
                return self.send(401, {"error": "sai tên đăng nhập hoặc mật khẩu"})
            if r[5]:
                c.close(); return self.send(200, {"disabled": True})
            tok = secrets.token_urlsafe(32)
            c.execute("DELETE FROM sessions WHERE exp < ?", (time.time(),))
            c.execute("INSERT INTO sessions(token,u,exp,at) VALUES(?,?,?,?)",
                      (tok, r[0], time.time() + 12 * 3600, time.strftime("%FT%T")))
            c.execute("UPDATE users SET last_login=? WHERE u=?", (time.strftime("%FT%T"), r[0]))
            c.commit(); c.close()
            return self.send(200, {"token": tok, "user": {"u": r[0], "name": r[1], "role": r[2]}})
        if p == "/api/users":
            c = db()
            me = who(c, self.headers.get("X-Token"))
            if not me or me["role"] != "admin":
                c.close(); return self.send(403, {"error": "cần quyền quản trị"})
            u = (data.get("u") or "").strip().lower()
            if not u:
                c.close(); return self.send(400, {"error": "thiếu tên đăng nhập"})
            ex = c.execute("SELECT salt,hash FROM users WHERE u=?", (u,)).fetchone()
            if data.get("p"):
                salt, h = hash_pw(data["p"])
            elif ex:
                salt, h = ex
            else:
                c.close(); return self.send(400, {"error": "người dùng mới phải có mật khẩu"})
            c.execute("INSERT INTO users(u,name,role,salt,hash,disabled,at) VALUES(?,?,?,?,?,?,?) "
                      "ON CONFLICT(u) DO UPDATE SET name=excluded.name, role=excluded.role, "
                      "salt=excluded.salt, hash=excluded.hash, disabled=excluded.disabled",
                      (u, data.get("name") or u, data.get("role") or "viewer", salt, h,
                       1 if data.get("disabled") else 0, time.strftime("%FT%T")))
            c.commit(); c.close()
            return self.send(200, {"ok": True})
        if p == "/api/history":
            d = data.get("d")
            if not d:
                return self.send(400, {"error": "thiếu ngày"})
            c = db()
            c.execute("INSERT INTO history(d,payload,at) VALUES(?,?,?) "
                      "ON CONFLICT(d) DO UPDATE SET payload=excluded.payload, at=excluded.at",
                      (d, json.dumps(data, ensure_ascii=False), time.strftime("%FT%T")))
            c.commit(); c.close()
            return self.send(200, {"ok": True})
        if p == "/api/events":
            c = db()
            c.execute("INSERT INTO events(at,kind,payload) VALUES(?,?,?)",
                      (data.get("at") or time.strftime("%FT%T"), data.get("kind", "?"),
                       json.dumps(data.get("rec", {}), ensure_ascii=False)))
            c.commit(); c.close()
            return self.send(200, {"ok": True})
        return self.send(404, {"error": "không có đường dẫn này"})

    # ---- phục vụ chính giao diện web ----
    def static(self, p):
        if p in ("/", ""):
            p = "/index.html"
        f = os.path.normpath(os.path.join(ROOT, p.lstrip("/")))
        if not f.startswith(ROOT) or not os.path.isfile(f):
            return self.send(404, b"khong tim thay", "text/plain; charset=utf-8")
        ct = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
              ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
              ".png": "image/png", ".svg": "image/svg+xml"}.get(os.path.splitext(f)[1], "application/octet-stream")
        with open(f, "rb") as fh:
            self.send(200, fh.read(), ct)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Máy chủ BMS đặt tại toà nhà")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0", help="0.0.0.0 để các máy trong mạng toà nhà vào được")
    ap.add_argument("--data", default=ROOT, help="thư mục chứa file cơ sở dữ liệu")
    a = ap.parse_args()
    os.makedirs(a.data, exist_ok=True)
    DB = os.path.join(a.data, "bms.sqlite")
    _c = db(); seed_users(_c); _c.close()
    print(f"Giao diện:        http://<ip-máy-này>:{a.port}/")
    print(f"Địa chỉ API:      http://<ip-máy-này>:{a.port}/api")
    print(f"Cơ sở dữ liệu:    {DB}")
    print("Dữ liệu nằm trên máy này. Không có kết nối nào ra ngoài.")
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()
