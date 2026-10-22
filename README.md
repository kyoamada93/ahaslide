# Townhall AI & Data — tương tác realtime kiểu AhaSlides

Ứng dụng web realtime (Node.js + Socket.IO) chạy toàn bộ chương trình Townhall AI & Data của MoMo:

| # | Slide | Khán giả (điện thoại) | Màn hình chiếu |
|---|-------|-----------------------|----------------|
| 1 | **Check-in** | Quét QR → nhập tên, team | QR lớn, số người check-in, tên hiện realtime |
| 2 | **Word cloud** "Bạn mong muốn gì ở Townhall?" | Nhập tối đa 3 từ khoá (lọc từ tục tiếng Việt/Anh) | Word cloud cập nhật trực tiếp |
| 3 | **Vote chủ đề sharing** (11 topic) | Chọn 1 topic (đổi được đến khi đóng vote) | Biểu đồ cột realtime; có thể **ẩn kết quả đến khi công bố** và **hẹn giờ tự đóng vote** |
| 4 | **Sharing — Anh Dũng** | Gửi câu hỏi cho speaker | Slide giới thiệu speaker |
| 5 | **Sharing — Chị Yên** | Gửi câu hỏi cho speaker | Slide giới thiệu speaker |
| 6 | **Q&A realtime** (luôn **ẩn danh**) | Gửi câu hỏi, upvote câu đã duyệt | Chỉ hiện câu hỏi **moderator đã Approve**; câu Highlight hiện to |
| 7 | **Đua vịt** | Bấm "Tham gia đua", **chọn màu vịt**, tap liên tục để vịt tăng tốc (thanh tốc độ, BOOST, vị trí realtime) | Dòng sông dài, camera bám theo vịt dẫn đầu, đèn xuất phát, bảng dẫn đầu, mini-map, podium + pháo giấy |
| 8 | **Đánh giá & góp ý** | Chấm sao + góp ý cho kỳ sau | Số lượt đánh giá, điểm trung bình |

## Chạy online — không cần máy local (Render)

App là 1 server Node.js giữ kết nối realtime (WebSocket), nên cần một dịch vụ chạy server liên tục. Cách đơn giản nhất là **Render** (render.com) — repo đã có sẵn `render.yaml`.

1. Đăng nhập https://render.com bằng tài khoản GitHub (cấp quyền cho repo `kyoamada93/ahaslide`).
2. **New + → Blueprint** → chọn repo `ahaslide` → chọn branch có code (vd. `main` sau khi merge, hoặc `claude/townhall-ai-data-program-aowi1a`) → **Apply**.
3. Render tự build và chạy. Khi xong sẽ có địa chỉ dạng `https://townhall-ai-data.onrender.com`. QR trên màn hình tự dùng địa chỉ này.
4. Lấy mật khẩu admin: service → **Environment** → `ADMIN_KEY` (Render tự sinh; có thể đổi).
5. Mở trên laptop trình chiếu:
   - Màn hình chiếu: `https://<app>.onrender.com/screen?key=<ADMIN_KEY>` (bấm `F` toàn màn hình)
   - Presenter: `https://<app>.onrender.com/admin?key=<ADMIN_KEY>`
   - Moderator Q&A (máy/điện thoại khác): `https://<app>.onrender.com/moderator?key=<ADMIN_KEY>`

**Gói nên dùng:** `render.yaml` để gói **Starter** (0.5 CPU, 512 MB) + ổ đĩa 1 GB để dữ liệu và logo/ảnh nền đã upload không mất khi restart. Với 300 người, CPU đo được trung bình 5–14% và đỉnh ~48% của 1 core (xem *Kiểm thử tải* bên dưới) → vừa với 0.5 CPU. Gói **Free** (0.1 CPU, không có ổ đĩa, tự ngủ sau 15 phút không có request) chỉ nên dùng để thử; nếu dùng Free thì xoá phần `disk` trong `render.yaml`, đổi `plan: free`, và mở `/screen` trước giờ G vài phút để server "thức dậy".

### Host miễn phí cho 1 lần sự kiện

| Lựa chọn | Chi phí | Cấu hình | Ghi chú |
|---|---|---|---|
| **Railway – gói dùng thử** (khuyên dùng) | $5 credit tặng 1 lần, hết hạn sau 30 ngày | 1 GB RAM, vCPU dùng chung | Đủ cho cả ngày sự kiện. **Đăng ký trong vòng 30 ngày trước sự kiện.** New Project → Deploy from GitHub repo → chọn repo + branch (Railway tự dùng `Dockerfile`) → Settings → Networking → *Generate Domain* → thêm biến `ADMIN_KEY`. |
| **Render – gói Free** | 0đ | 0.1 CPU, 512 MB, Singapore | Đổi `plan: free` và xoá phần `disk` trong `render.yaml`. CPU yếu: 300 người có thể hơi trễ lúc đông nhất. Ngủ sau 15 phút không có request → mở `/screen` trước giờ G. |
| **Koyeb – gói Free** | 0đ | 0.1 vCPU, 512 MB, chỉ Frankfurt/Washington | Xa Việt Nam (trễ hơn), CPU yếu như Render Free. |
| **Laptop trình chiếu + Cloudflare Tunnel** | 0đ | CPU của laptop (mạnh nhất) | `npm start` rồi `cloudflared tunnel --url http://localhost:3000`, đặt `PUBLIC_URL` = URL tunnel. Laptop phải luôn bật, không sleep, mạng ổn định. |

Dù chọn nơi nào, nên chạy thử tải trước 1 ngày: `node scripts/load-test.js 300 https://<app> <ADMIN_KEY>` rồi vào admin **Reset**. Lưu ý các gói free không giữ file khi restart: hãy upload logo/ảnh nền **sau** lần deploy cuối, và xuất CSV ngay sau chương trình.

Cách khác: bất kỳ dịch vụ nào chạy được Docker (Railway, Fly.io, VM nội bộ…) bằng `Dockerfile` có sẵn — chạy **đúng 1 instance**, đặt `PUBLIC_URL` = địa chỉ công khai, `DATA_DIR` trỏ vào ổ đĩa bền vững.

## Chạy trên máy (tuỳ chọn)

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
| `PUBLIC_URL` | tự phát hiện (trên Render dùng `RENDER_EXTERNAL_URL`) | URL khán giả dùng (mã hoá trong QR) |
| `DATA_DIR` | `./data` | Nơi lưu `state.json` (tự lưu mỗi giây, khởi động lại không mất dữ liệu) |
| `CONFIG_FILE` | `./config.json` | File cấu hình chương trình |

## So với AhaSlides

Đã đối chiếu với tài liệu AhaSlides (Word Cloud, Poll, Q&A, Duck Race, cách mời khán giả):

| Tính năng AhaSlides | Ở đây |
|---|---|
| Word cloud: giới hạn số từ / người, lọc từ tục, xoá từ trên màn hình | ✅ `maxPerUser`, bộ lọc tiếng Việt + Anh (`profanityFilter`), admin ẩn/hiện từng từ |
| Poll: đóng/mở vote, *Show results manually*, giới hạn thời gian | ✅ Đóng/mở, 🙈 ẩn kết quả đến khi công bố (`hideResults`), hẹn giờ 30s–5 phút tự đóng |
| Q&A: duyệt (Pending → Approve/Dismiss), moderator dùng máy riêng, upvote, ẩn danh, sắp xếp Top/Mới nhất/Đã trả lời, đánh dấu câu nổi bật | ✅ Đủ; câu có từ tục được gắn ⚠️ cho moderator; luôn ẩn danh |
| Duck race: ai vào là có vịt, đổi kiểu vịt trước khi bắt đầu, công bố người thắng trên màn hình + điện thoại; tối đa 40 vịt | ✅ Chọn màu vịt; tap để đua (thay vì ngẫu nhiên); đã thử 300 vịt |
| Presenter-paced: điện thoại đi theo slide của presenter, vào lại không mất câu trả lời | ✅ Đồng bộ < 25 ms; tự kết nối lại; thanh "Slide x/8" trên điện thoại |
| Màn hình chiếu luôn sáng | ✅ Screen Wake Lock (cần https — có sẵn khi deploy) |

## Tuỳ chỉnh nội dung

Sửa `config.json` (khởi động lại server để áp dụng):

- Tiêu đề, câu hỏi word cloud, danh sách **topic vote** (`slides[].options`).
- Thông tin speaker: `speaker`, `topic`, `role`, `photo` (vd. đặt ảnh ở `public/assets/dung.jpg` rồi điền `"/assets/dung.jpg"`).
- Thêm/bớt/đổi thứ tự slide; các loại: `checkin`, `wordcloud`, `poll`, `speaker`, `qa`, `race`, `feedback`.
- Đua vịt: `finishTaps` (số tap để về đích, mặc định 160 ≈ 15–20 giây), `maxTapsPerSecond` (chống auto-click), `maxDurationSec`, `podium`.
- `qaTargets`: danh sách người nhận câu hỏi.

### Logo & background

**Cách nhanh nhất:** trang admin → mục **Logo & background** → *Tải lên* logo AI & Data, ảnh nền 16:9 (màn chiếu) và 9:16 (điện thoại). Ảnh được lưu trong `DATA_DIR/brand/` và áp dụng ngay cho mọi màn hình đang mở; nút *Mặc định* để quay về ảnh có sẵn.

- `public/assets/ai-data-logo.svg` là bản vẽ lại tạm thời (dùng khi chưa upload logo chính thức).
- `public/assets/bg.jpg` (16:9) và `bg-mobile.jpg` (9:16) là ảnh nền phong cách "AI neural network" tông màu MoMo, được render bằng `scripts/gen-background.js`. Muốn dùng ảnh từ Midjourney/DALL·E/Firefly thì ghi đè 2 file này. Prompt gợi ý:
  > abstract futuristic AI neural network, glowing magenta and deep plum particles, flowing light waves, data streams, MoMo pink #A50064, dark background, cinematic, 16:9, no text

## Tập dượt & kiểm thử

```bash
npm test                                              # test end-to-end toàn bộ luồng (tự bật server tạm)
npm run load-test                                     # 300 khán giả ảo chạy hết chương trình, in độ trễ + CPU
node scripts/load-test.js 300 https://<app>.onrender.com <ADMIN_KEY>   # thử tải trên server thật (nhớ Reset sau đó)
node scripts/simulate.js https://<app>.onrender.com 50                 # 50 khán giả ảo để tập dượt cùng presenter
```

### Kết quả kiểm thử tải (300 người cùng lúc)

| Chỉ số | Kết quả |
|---|---|
| Check-in / vote / từ khoá / câu hỏi / upvote / feedback | 300/300 thành công, 0 lỗi; phản hồi p95 ≤ 36 ms |
| Presenter chuyển slide → 300 điện thoại cập nhật | p95 10–25 ms |
| Đua vịt 300 người tap 6–12 lần/giây | về đích ~13 s sau đèn xanh |
| CPU server | trung bình 5–14%, đỉnh 48% của 1 core (lúc 300 người check-in trong 1 giây) |
| RAM | ~110 MB |

(Đo trên server cục bộ; mạng thật sẽ cộng thêm độ trễ đường truyền.)

Bot giả lập sẽ check-in, gửi từ khoá, vote, đặt câu hỏi, upvote, đua vịt và gửi feedback theo slide hiện tại.

## Xuất dữ liệu

Trong trang admin → **Xuất dữ liệu (CSV)**: `checkins`, `words`, `votes`, `questions`, `race`, `feedback` (UTF-8, mở được bằng Excel).

## Lưu ý khi vận hành

- Trước chương trình: vào admin → **Reset toàn bộ dữ liệu** (gõ `RESET`) để xoá dữ liệu tập dượt.
- Khán giả được nhận diện qua localStorage; tải lại trang không mất check-in.
- Mỗi người: tối đa 3 từ khoá, 1 phiếu vote, 3 câu hỏi/phút, 1 lượt feedback (gửi lại sẽ ghi đè).
- Q&A luôn ẩn danh: tên người hỏi không được lưu (kể cả moderator và file CSV cũng không thấy).
- Đua vịt: tối đa 14 tap/giây được tính (chống auto-click); `finishTaps` trong `config.json` chỉnh độ dài cuộc đua.
- Đã kiểm thử tải với 300 khán giả đồng thời (xem bảng ở trên).
