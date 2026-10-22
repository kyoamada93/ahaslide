# Townhall AI & Data — tương tác realtime kiểu AhaSlides

Ứng dụng web realtime (Node.js + Socket.IO) chạy toàn bộ chương trình Townhall AI & Data của MoMo:

| # | Slide | Khán giả (điện thoại) | Màn hình chiếu |
|---|-------|-----------------------|----------------|
| 1 | **Check-in** | Quét QR → nhập tên, team | QR lớn, số người check-in, tên hiện realtime |
| 2 | **Word cloud** "Bạn mong muốn gì ở Townhall?" | Nhập tối đa 3 từ khoá | Word cloud cập nhật trực tiếp |
| 3 | **Vote chủ đề sharing** (11 topic) | Chọn 1 topic (đổi được đến khi đóng vote) | Biểu đồ cột realtime, topic dẫn đầu màu vàng |
| 4 | **Sharing — Anh Dũng** | Gửi câu hỏi cho speaker | Slide giới thiệu speaker |
| 5 | **Sharing — Chị Yên** | Gửi câu hỏi cho speaker | Slide giới thiệu speaker |
| 6 | **Q&A realtime** | Gửi câu hỏi, upvote câu đã duyệt | Chỉ hiện câu hỏi **moderator đã Approve**; câu Highlight hiện to |
| 7 | **Đua vịt** | Bấm "Tham gia đua", tap liên tục để vịt tăng tốc | Đường đua realtime, bảng dẫn đầu, podium + pháo giấy |
| 8 | **Đánh giá & góp ý** | Chấm sao + góp ý cho kỳ sau | Số lượt đánh giá, điểm trung bình |

## Chạy nhanh

```bash
npm install
ADMIN_KEY=matkhau-cua-ban npm start
```

Server in ra các đường dẫn:

- **Màn hình chiếu:** `http://<host>:3000/screen?key=<ADMIN_KEY>` — bấm `F` để toàn màn hình; dùng `←/→`, `PageUp/PageDown` hoặc clicker để chuyển slide. (Mở `/screen` không có key = chỉ hiển thị.)
- **Bảng điều khiển presenter:** `http://<host>:3000/admin?key=<ADMIN_KEY>` — danh sách slide, nút Trước/Tiếp, xem trước màn hình, điều khiển từng slide (đóng/mở vote, lọc từ khoá xấu, bắt đầu đua vịt, đua lại…), duyệt Q&A, xuất CSV.
- **Moderator Q&A:** `http://<host>:3000/moderator?key=<ADMIN_KEY>` — giao diện riêng chỉ để Approve / Highlight / Đã trả lời / Ẩn câu hỏi.
- **Khán giả:** `http://<host>:3000/` (mã QR trên màn hình trỏ tới đây).

Admin key mặc định là `momo-aidata`, **hãy đổi khi chạy thật**.

### Để điện thoại truy cập được

Điện thoại của khán giả phải truy cập được server. Chọn một trong các cách:

1. **Cùng mạng Wi-Fi/LAN**: chạy trên laptop, QR tự dùng IP LAN (vd. `http://192.168.1.10:3000`). Kiểm tra Wi-Fi không chặn kết nối giữa các thiết bị.
2. **Deploy lên cloud** (Render, Railway, Fly.io, VM nội bộ…) bằng `Dockerfile` có sẵn. Chạy **1 instance** (state nằm trong bộ nhớ). Đặt `PUBLIC_URL=https://ten-mien-cua-ban` để QR đúng địa chỉ.
3. **Tunnel**: `cloudflared tunnel --url http://localhost:3000` hoặc `ngrok http 3000`, rồi đặt `PUBLIC_URL` bằng URL tunnel và khởi động lại.

Nếu mở `/screen` qua tên miền công khai thì QR tự lấy tên miền đó, không cần `PUBLIC_URL`.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `PORT` | `3000` | Cổng HTTP |
| `ADMIN_KEY` | `momo-aidata` | Mật khẩu cho admin / moderator / điều khiển màn hình |
| `PUBLIC_URL` | tự phát hiện | URL khán giả dùng (mã hoá trong QR) |
| `DATA_DIR` | `./data` | Nơi lưu `state.json` (tự lưu mỗi giây, khởi động lại không mất dữ liệu) |
| `CONFIG_FILE` | `./config.json` | File cấu hình chương trình |

## Tuỳ chỉnh nội dung

Sửa `config.json` (khởi động lại server để áp dụng):

- Tiêu đề, câu hỏi word cloud, danh sách **topic vote** (`slides[].options`).
- Thông tin speaker: `speaker`, `topic`, `role`, `photo` (vd. đặt ảnh ở `public/assets/dung.jpg` rồi điền `"/assets/dung.jpg"`).
- Thêm/bớt/đổi thứ tự slide; các loại: `checkin`, `wordcloud`, `poll`, `speaker`, `qa`, `race`, `feedback`.
- Đua vịt: `finishTaps` (số tap để về đích, mặc định 160 ≈ 15–20 giây), `maxTapsPerSecond` (chống auto-click), `maxDurationSec`, `podium`.
- `qaTargets`: danh sách người nhận câu hỏi.

### Logo & background

**Cách nhanh nhất:** trang admin → mục **Logo & background** → *Tải lên* logo MoMo, logo AI & Data, ảnh nền 16:9 (màn chiếu) và 9:16 (điện thoại). Ảnh được lưu trong `DATA_DIR/brand/` và áp dụng ngay cho mọi màn hình đang mở; nút *Mặc định* để quay về ảnh có sẵn.

- `public/assets/momo-logo.svg`, `public/assets/ai-data-logo.svg` là bản vẽ lại tạm thời (dùng khi chưa upload logo chính thức).
- `public/assets/bg.jpg` (16:9) và `bg-mobile.jpg` (9:16) là ảnh nền phong cách "AI neural network" tông màu MoMo, được render bằng `scripts/gen-background.js`. Muốn dùng ảnh từ Midjourney/DALL·E/Firefly thì ghi đè 2 file này. Prompt gợi ý:
  > abstract futuristic AI neural network, glowing magenta and deep plum particles, flowing light waves, data streams, MoMo pink #A50064, dark background, cinematic, 16:9, no text

## Tập dượt & kiểm thử

```bash
npm test                                        # test end-to-end toàn bộ luồng (tự bật server tạm)
node scripts/simulate.js http://localhost:3000 50   # 50 khán giả ảo để tập dượt
```

Bot giả lập sẽ check-in, gửi từ khoá, vote, đặt câu hỏi, upvote, đua vịt và gửi feedback theo slide hiện tại.

## Xuất dữ liệu

Trong trang admin → **Xuất dữ liệu (CSV)**: `checkins`, `words`, `votes`, `questions`, `race`, `feedback` (UTF-8, mở được bằng Excel).

## Lưu ý khi vận hành

- Trước chương trình: vào admin → **Reset toàn bộ dữ liệu** (gõ `RESET`) để xoá dữ liệu tập dượt.
- Khán giả được nhận diện qua localStorage; tải lại trang không mất check-in.
- Mỗi người: tối đa 3 từ khoá, 1 phiếu vote, 3 câu hỏi/phút, 1 lượt feedback (gửi lại sẽ ghi đè).
- Đã thử với 40+ khán giả đồng thời; kiến trúc 1 process phù hợp vài trăm người trong một hội trường.
