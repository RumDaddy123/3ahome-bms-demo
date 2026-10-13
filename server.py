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
import argparse, json, os, sqlite3, time
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
    return c


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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
    db().close()
    print(f"Giao diện:        http://<ip-máy-này>:{a.port}/")
    print(f"Địa chỉ API:      http://<ip-máy-này>:{a.port}/api")
    print(f"Cơ sở dữ liệu:    {DB}")
    print("Dữ liệu nằm trên máy này. Không có kết nối nào ra ngoài.")
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()
