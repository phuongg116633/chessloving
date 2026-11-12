# Cờ Vua Từng Bước

Ứng dụng web luyện cờ vua "cầm tay chỉ việc". Bạn cầm quân Trắng, bên cạnh bàn cờ có huấn luyện viên:

- chỉ nước nên đi bằng mũi tên vàng và giải thích lý do bằng tiếng Việt,
- cảnh báo khi quân của bạn đang bị đe dọa,
- chấm từng nước đi: **Tốt nhất / Tốt / Chưa chính xác / Sai lầm**, có nút "Đi lại" để thử lại.

## 6 cấp độ

| Cấp | Nội dung |
|---|---|
| 1. Làm quen quân cờ | Bàn cờ, giá trị quân, cách đi từng quân, trò chơi "Cuộc đua Tốt" |
| 2. Luật chơi quan trọng | Chiếu, thoát chiếu, chiếu hết, hòa pat, nhập thành, phong cấp, bắt tốt qua đường |
| 3. Khai cuộc đúng cách | 3 nguyên tắc vàng, ván cờ được gợi ý mọi nước |
| 4. Đòn chiến thuật | Ăn quân hở, đòn chĩa, đòn ghim, đòn xiên, chiếu hết hàng cuối |
| 5. Tàn cuộc | Chiếu hết bằng Hậu, bằng Xe, quy tắc hình vuông, tàn cuộc Tốt |
| 6. Thực chiến | 3 đối thủ mạnh dần |

## Cách chạy

Mở file `index.html` bằng trình duyệt là chơi được, không cần cài đặt gì.

Muốn có đường link online: vào **Settings → Pages** của repo, chọn nhánh `main`, thư mục `/ (root)`. Sau khoảng 1 phút trang sẽ có ở `https://<tên-tài-khoản>.github.io/chessloving/`.

## Cấu trúc mã nguồn

| File | Vai trò |
|---|---|
| `src/engine.js` | Luật cờ (đi quân, chiếu, nhập thành, bắt tốt qua đường, phong cấp), máy tính cờ (alpha-beta) và phần tạo lời giải thích |
| `src/levels.js` | Nội dung 6 cấp độ: bài học, câu đố, ván đấu và độ mạnh của đối thủ |
| `src/app.js` | Giao diện bàn cờ, kéo thả quân, khung huấn luyện viên, lưu tiến độ |
| `src/shell.html` | Khung trang và CSS |
| `build.py` | Ghép các file trong `src/` thành `index.html` |

Sau khi sửa file trong `src/`, chạy lại:

```bash
python3 build.py
```

Tiến độ học được lưu trong `localStorage` của trình duyệt.
