# Phần mềm quản lý BMS — bản triển khai tại toà nhà

Một bộ mã nguồn dùng chung cho nhiều toà nhà. Mỗi công trình có nhận diện riêng
và giữ dữ liệu của chính mình.

## Chạy tại toà nhà

```bash
python3 server.py --port 8080 --data /var/lib/bms
```

Máy chủ đặt trong phòng kỹ thuật, cùng mạng với các DDC. Nó phục vụ giao diện web,
giữ cấu hình và ghi toàn bộ dữ liệu vận hành vào `bms.sqlite` ngay trên máy đó.
Người vận hành mở bằng trình duyệt điện thoại hoặc máy tính trong mạng toà nhà.

Không cần Node, không cần build, không cần internet để chạy.

## Cá nhân hoá cho từng công trình

Sửa `site.json` khi lắp đặt — không phải sửa mã nguồn, không phải build lại:

| Nhóm | Đặt được gì |
|---|---|
| `building` | tên toà nhà, mã công trình, địa chỉ |
| `owner` | tên đơn vị quản lý, logo, hotline, email |
| `vendor` | đơn vị lắp đặt (chỉ hiện ở mục Cài đặt) |
| `theme` | màu chủ đạo, chữ tắt logo |
| `locale` | múi giờ, giá điện đ/kWh, số ngày làm việc |
| `ops` | giờ vận hành, có chạy thứ 7 / chủ nhật không |
| `storage` | địa chỉ máy chủ tại toà nhà, điểm đẩy lên internet |

Những mục này cũng sửa được ngay trong phần mềm ở **Vận hành › Cài đặt › Nhận diện toà nhà**
(cần vai trò Kỹ thuật). Logo tải lên từ máy, lưu cùng cấu hình.

## Dữ liệu nằm ở đâu

```
Trình duyệt người vận hành
        │  ghi ngay khi thao tác
        ▼
Máy chủ trong phòng kỹ thuật ──► bms.sqlite   ← cơ sở dữ liệu của toà nhà
        │
        │  chỉ khi chủ đầu tư bật, và chỉ tới địa chỉ chủ đầu tư chỉ định
        ▼
Điểm nhận trên internet (tuỳ chọn)
```

Không có đường nào tự gửi dữ liệu về máy chủ của đơn vị lắp đặt. Mất mạng internet
thì phần mềm vẫn chạy và vẫn ghi đủ; nối lại mới đồng bộ. Chủ đầu tư xuất toàn bộ
dữ liệu ra JSON bất cứ lúc nào ở mục Cài đặt.

Khi chưa cấu hình máy chủ, phần mềm lưu tạm trong trình duyệt để chạy thử.

## Đăng nhập và phân quyền

Có máy chủ tại toà nhà thì xác thực là thật: mật khẩu băm PBKDF2-SHA256 200.000 vòng kèm muối
riêng từng người, lưu trong `bms.sqlite`; phiên có thẻ ngẫu nhiên hết hạn sau 12 giờ; sai mật khẩu
bị làm chậm. Chưa có máy chủ thì phần mềm chạy **chế độ trình diễn**, đối chiếu băm trong `site.json`
— màn đăng nhập nói rõ điều đó, đừng dùng để vận hành thật.

| Quyền | Làm được gì |
|---|---|
| Khách | chỉ xem |
| Vận hành | đặt nhiệt độ, bật tắt FCU, nhận xử lý cảnh báo, tạm ẩn, tạo phiếu |
| Kỹ thuật | thêm: chạy/dừng quạt tăng áp và hút khói, đổi lịch vận hành |
| Quản trị | thêm: nhận diện toà nhà, nơi lưu dữ liệu, quản lý người dùng |

Tài khoản khởi tạo khi chạy `server.py` lần đầu: `admin` / `3ahome@2026`.
**Đổi mật khẩu ngay sau khi bàn giao công trình.**

Màn hình tự khoá sau 30 phút không thao tác, mở lại bằng mật khẩu của chính người đang trực —
bàn trực hay bỏ máy đó rồi đi. Mọi thao tác ghi vào nhật ký kèm tên người làm, không phải tên vai trò.

## Lịch sử dài hạn

Phần mềm chốt sổ mỗi giờ và gộp thành một dòng mỗi ngày: điện năng, mức chuẩn, điện ngoài giờ,
số cảnh báo, điểm sức khoẻ, phiếu đã đóng, tiền lãng phí chẩn đoán được. Ghi vào bảng `history`
trên máy chủ của toà nhà, giữ 400 ngày.

Nhờ đó mục **Vận hành › Lịch sử** trả lời được những câu màn hình thời gian thực không trả lời nổi:
30 ngày qua so với 30 ngày trước thế nào, sửa phiếu xong có hết lãng phí thật không, thiết bị nào
lặp lỗi mãi không dứt. Khi chưa có máy chủ, phần mềm dựng 90 ngày mô phỏng và **nói rõ trên màn hình**
rằng đó là số mô phỏng.

## API của máy chủ tại toà nhà

| Đường dẫn | Việc |
|---|---|
| `GET /api/health` | kiểm tra sống và số bản ghi |
| `GET /api/config` · `POST /api/config` | cấu hình riêng của toà nhà |
| `GET /api/events` · `POST /api/events` | nhật ký vận hành: xác nhận cảnh báo, tạm ẩn, phiếu công việc, bàn giao ca |
| `POST /api/auth/login` · `GET /api/auth/me` | đăng nhập, kiểm tra phiên |
| `GET /api/users` · `POST /api/users` | quản lý người dùng (cần quyền quản trị) |
| `GET /api/history` · `POST /api/history` | lịch sử dài hạn theo ngày |

## Các mô-đun

| File | Việc |
|---|---|
| `site.js` | cấu hình từng toà nhà, lưu trữ tại chỗ |
| `auth.js` | đăng nhập, phân quyền, khoá màn hình |
| `history.js` | chốt sổ và đọc lại lịch sử dài hạn |
| `plan.js` | dữ liệu toà nhà, mặt bằng, thiết bị theo bản vẽ |
| `alarms.js` | quản lý cảnh báo: gộp trùng, độ trễ xác nhận, chống rung, ưu tiên, nhận xử lý, tạm ẩn, leo thang |
| `fdd.js` | phát hiện lỗi tự động, ước tính tiền điện lãng phí |
| `health.js` | sức khoẻ hệ BMS: mất kết nối, số liệu đứng yên, pin cảm biến |
| `energy.js` | năng lượng so với đường chuẩn theo thời tiết và số người |
| `work.js` | phiếu công việc và bảo trì theo giờ chạy |
| `occ.js` | điều khiển theo chiếm dụng |
| `floor3d.js` | 3D riêng từng tầng |
| `ops.js` | giao diện vận hành |
| `server.py` | máy chủ đặt tại toà nhà |

## Lưu ý cho bản mẫu

Các ngưỡng thời gian được rút ngắn còn vài chục giây để xem ngay: leo thang cảnh báo,
độ trễ xác nhận, thời gian phòng trống. Khi triển khai thật, đặt lại theo phút
(xem `ESC` trong `alarms.js`, `ON_DELAY`, `VACANT_MIN` trong `occ.js`).
