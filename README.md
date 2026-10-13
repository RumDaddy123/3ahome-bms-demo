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

## API của máy chủ tại toà nhà

| Đường dẫn | Việc |
|---|---|
| `GET /api/health` | kiểm tra sống và số bản ghi |
| `GET /api/config` · `POST /api/config` | cấu hình riêng của toà nhà |
| `GET /api/events` · `POST /api/events` | nhật ký vận hành: xác nhận cảnh báo, tạm ẩn, phiếu công việc, bàn giao ca |

## Các mô-đun

| File | Việc |
|---|---|
| `site.js` | cấu hình từng toà nhà, lưu trữ tại chỗ |
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
