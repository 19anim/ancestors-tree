# AncestorsTree — Tài liệu thiết kế

> Ngày: 2026-11-11 (sửa 2026-11-12) · Trạng thái: chờ duyệt
> Mục tiêu cá nhân: dự án portfolio thể hiện kỹ năng React nâng cao trên nền MERN, có người dùng thật.
> Thời gian: ~10–15 giờ/tuần × 8 tuần.
> 🇬🇧 Bản tiếng Anh (bản gốc): [2026-11-11-ancestors-tree-design.md](2026-11-11-ancestors-tree-design.md)

Đây là bản dịch tiếng Việt của tài liệu thiết kế. Khi hai bản khác nhau, **bản tiếng Anh là bản chuẩn**. Tên biến, tên hàm, mã lỗi và đường dẫn API giữ nguyên tiếng Anh như trong code.

Các thuật ngữ in **đậm** lần đầu xuất hiện được giải thích ở [§19 Thuật ngữ](#19-thuật-ngữ).

---

## 1. Tổng quan

Nền tảng web (cài được như app nhờ **PWA**) cho phép **nhiều dòng họ** tạo và cùng quản lý cây gia phả, tự tính **ngày giỗ theo âm lịch** mỗi năm và nhắc con cháu trước ngày giỗ.

### Bài toán

- Gia phả hiện nằm trong sổ giấy hoặc file Excel, chỉ một người giữ, khó cập nhật, dễ thất lạc.
- Ngày giỗ tính theo âm lịch nên mỗi năm rơi vào một ngày dương lịch khác nhau; con cháu ở xa hay quên.
- Các app gia phả hiện có thường giao diện cũ, không cho nhiều người cùng sửa, và chạy chậm khi cây lớn.

### Tiêu chí thành công (đo được)

| # | Tiêu chí | Cách đo |
|---|---|---|
| S1 | Cây 1.000 người kéo/zoom ≥ 55 fps trên laptop tầm trung | Chrome DevTools Performance + React Profiler, seed 1.000 và 2.000 người |
| S2 | Mở cây 1.000 người: hiển thị đầy đủ lần đầu < 1,5 giây | `performance.mark` từ lúc nhận dữ liệu tới lúc vẽ xong |
| S3 | Đổi âm–dương lịch đúng 100% ngày Tết 1900–2100, và qua các test property-based + differential cho 1800–2400 (§9.1) | Vitest trên CI |
| S4 | Độ phủ test `packages/shared` ≥ 90%, toàn dự án ≥ 70% | Vitest coverage trên CI |
| S5 | Lighthouse Performance, Accessibility, Best Practices ≥ 90 | Lighthouse CI |
| S6 | Có ít nhất 1 dòng họ thật dùng, ≥ 100 người trong cây | Dữ liệu production |
| S7 | **PWA**: cài được trên Android (Chrome) và iOS (Safari ≥ 16.4, "Thêm vào màn hình chính"); xem được các cây mở gần đây khi offline; nhận thông báo đẩy trên cả hai khi đã cài | Bảng test thủ công + Playwright test offline |
| S8 | **Tài liệu**: hướng dẫn sử dụng bao phủ mọi tác vụ chính, có ảnh chụp màn hình; 100% route API có trong tài liệu OpenAPI tự sinh; mọi mã lỗi đều được mô tả | CI so danh sách route Express với tài liệu OpenAPI; tài liệu mã lỗi được sinh từ code |
| S9 | **Bản sắc giao diện riêng**: đạt checklist chống AI-slop ở §13.3 | Rà soát với `design-taste-frontend` + ảnh chụp Playwright |

---

## 2. Phạm vi

### Trong 8 tuần

| Nhóm | Tính năng |
|---|---|
| Tài khoản | Đăng ký/đăng nhập email + mật khẩu, đăng nhập Google, quên mật khẩu qua email |
| Dòng họ | Tạo dòng họ, chọn **thuỷ tổ** (người đứng đầu cây), mời thành viên qua link với vai trò Chủ họ / Biên tập / Xem |
| Cây gia phả | Thêm/sửa/xoá người, thêm vợ/chồng (nhiều đời), thêm con (ruột/nuôi), thứ tự anh chị em, chi/phái, số đời |
| Dâu/rể | Thẻ dâu/rể đặt cạnh vợ/chồng kèm thông tin gia đình gốc, chế độ "ẩn dâu/rể", cài đặt số đời con cháu của con gái (§8) |
| Liên kết cây gia phả | Nối bất kỳ người nào với chính người đó trong một cây gia phả khác đã được chia sẻ; di chuột vào thấy dấu hiệu + bản xem trước, bấm vào mở cây đó và bay tới đúng người, có breadcrumb để quay lại (§8.1) |
| Hồ sơ người | Tên, các tên khác (tên huý, tên tự, tên thường gọi), giới tính, ngày sinh & mất (âm và/hoặc dương, hoặc chỉ biết năm), nơi an táng, ảnh, tiểu sử |
| Chủ đề cây | Trang trí bảng: nền, khung ảnh polaroid, đồ giữ ảnh, kiểu chỉ và đường khâu cho cả cây, cùng khung ảnh và đồ giữ ảnh cho riêng từng thẻ; mỗi lựa chọn áp dụng cho cả họ hoặc chỉ mình tôi (§13.4) |
| ⭐ Cây lớn mượt | 1.000–2.000 người vẫn mượt; thu gọn/mở rộng nhánh; minimap; tìm kiếm không dấu rồi bay tới; vẽ theo mức chi tiết |
| ⭐ Lịch sử & undo | Undo/redo bằng **nút trên thanh công cụ và phím tắt**, dòng thời gian "ai sửa gì, lúc nào", hoàn tác một thay đổi cũ bất kỳ |
| Nhắc giỗ | Trang "Giỗ sắp tới" (30 ngày) có ghi chú cho các trường hợp đặc biệt; nhắc qua email + Web Push trước 7 ngày và 1 ngày |
| AI nhập liệu | Prompt mẫu → người dùng chạy trong AI chat của họ → dán JSON lại → kiểm tra → xem trước thay đổi → duyệt rồi mới ghi |
| Xuất & chia sẻ | Xuất PNG/SVG/PDF; link công khai chỉ xem, ẩn chi tiết người còn sống |
| PWA | Cài được, có icon/màn hình chờ, xem offline (chỉ đọc) các cây mở gần đây, hướng dẫn cài (đặc biệt cho iOS) |
| Tài liệu | Hướng dẫn sử dụng (trong app + repo), tài liệu developer, tài liệu API tự sinh, danh mục mã lỗi, ADR |

### Giai đoạn 2 (sau tuần 8)

- Cộng tác real-time: gửi chính các Operation qua Socket.io, hiện ai đang online.
- Sửa offline: lưu hàng đợi Operation chưa gửi vào IndexedDB, đồng bộ khi có mạng lại.
- Gợi ý liên kết tự động: phát hiện người có khả năng trùng giữa các cây (cùng tên, năm sinh, quê) và gợi ý nối.
- Nhắc qua Zalo (ZNS cần tài khoản doanh nghiệp, có phí).
- BYOK: người dùng nhập API key AI của họ để app gọi trực tiếp.
- Gộp hai cây; nhập/xuất GEDCOM.

### Ngoài phạm vi

- Mở rộng tổ tiên của dâu/rể ngược lên trên **bên trong** cây của dòng họ (dâu/rể là một thẻ cạnh vợ/chồng; muốn xem họ bên ấy thì dùng liên kết cây, §8.1).
- App native iOS/Android (PWA thay thế; không cần tài khoản App Store / Play Store).
- Thanh toán.

---

## 3. Người dùng & phân quyền

| Hành động | Chủ họ | Biên tập | Xem | Khách có link chia sẻ |
|---|:-:|:-:|:-:|:-:|
| Xem cây, hồ sơ | ✅ | ✅ | ✅ | ✅ (ẩn chi tiết người còn sống) |
| Xem giỗ sắp tới, đăng ký nhắc | ✅ | ✅ | ✅ | ❌ |
| Thêm/sửa/xoá người, undo | ✅ | ✅ | ❌ | ❌ |
| AI nhập liệu | ✅ | ✅ | ❌ | ❌ |
| Nối một người với cây khác (§8.1) | ✅ | ✅ | ❌ | ❌ |
| Thấy dấu hiệu liên kết & mở cây được liên kết | ✅* | ✅* | ✅* | ✅* |
| Xem lịch sử sửa | ✅ | ✅ | ✅ | ❌ |
| Trang trí cây và thẻ cho cả họ (§13.4) | ✅ | ✅ | ❌ | ❌ |
| Trang trí cây và thẻ chỉ cho mình xem (§13.4) | ✅ | ✅ | ✅ | ❌ |
| Mời thành viên, đổi vai trò | ✅ | ❌ | ❌ | ❌ |
| Xem liên kết từ dòng họ khác trỏ tới, chặn một dòng họ | ✅ | ❌ | ❌ | ❌ |
| Tạo/thu hồi link chia sẻ, đổi thuỷ tổ, cài đặt, xoá dòng họ | ✅ | ❌ | ❌ | ❌ |

\* Ai cũng thấy dấu hiệu liên kết; muốn mở cây được liên kết thì phải là thành viên của dòng họ đó hoặc link chia sẻ còn hiệu lực (§8.1).

Một User có thể thuộc nhiều dòng họ với vai trò khác nhau (ví dụ họ nội và họ ngoại).

**Thành viên bị xoá.** Khi Chủ họ xoá một thành viên, người đó không thể tham gia lại bằng bất kỳ link mời nào tạo trước lúc xoá (chấp nhận link sẽ trả `FORBIDDEN`, 403); link tạo sau lúc xoá thì dùng được. Người tự rời họ thì có thể tham gia lại bằng bất kỳ link nào còn hiệu lực.

---

## 4. Kiến trúc

```
ancestors-tree/                   (monorepo, pnpm workspaces)
├─ apps/
│  ├─ web/           Vite + React 19 + TypeScript (PWA)  → Netlify
│  ├─ api/           Express + TypeScript + Mongoose     → Render
│  └─ cron-worker/   Cloudflare Worker (~30 dòng), kích hoạt job nhắc giỗ mỗi sáng
├─ packages/
│  └─ shared/        Dùng chung cho web và api:
│                    · Zod schema (Person, Union, Operation, JSON nhập AI, hợp đồng API)
│                    · applyOp() — áp một thay đổi vào cây
│                    · lunar/ — đổi âm–dương lịch, tính ngày giỗ
│                    · computeGenerations(), classifyLineage()
│                    · ERROR_CODES — nguồn duy nhất của các mã lỗi
└─ docs/             Tài liệu developer, ADR, hướng dẫn sử dụng (§14)
```

```
Trình duyệt / PWA đã cài ──HTTPS──▶ Netlify (web tĩnh + service worker)
     │                                 │  /api/*  (proxy, cùng tên miền)
     │                                 ▼
     │                          Render (Express API) ──▶ MongoDB Atlas
     │                                 │                 Cloudinary (ảnh)
     │                                 ├──▶ Resend (email)
     │                                 └──▶ Web Push
     │
Cloudflare Worker Cron (07:00 VN, chính)   ──▶ POST /api/internal/run-reminders
cron-job.org           (07:30 VN, dự phòng) ──▶ POST /api/internal/run-reminders
```

**Vì sao web gọi API qua proxy `/api/*` của Netlify thay vì gọi thẳng `*.onrender.com`?**
Đăng nhập dùng cookie. Nếu web ở `netlify.app` còn API ở `onrender.com` thì cookie bị coi là **cookie bên thứ ba** và Safari/Chrome sẽ chặn. Một dòng proxy trong file `_redirects` của Netlify khiến trình duyệt chỉ thấy một tên miền:

```
/api/*  https://ancestors-tree-api.onrender.com/:splat  200
/*      /index.html                                     200
```

Dòng thứ hai để React Router xử lý được khi người dùng F5 ở trang con.

### Quy ước ngôn ngữ

- **Tiếng Anh** cho mọi thứ trong repo: code, tên biến/hàm, comment, commit message, tài liệu, mã lỗi và thông điệp lỗi của API.
- **Ngoại lệ — tài liệu thiết kế song ngữ:** `*-design.md` (tiếng Anh, bản chuẩn) và `*-design.vi.md` (bản tiếng Việt). Mỗi lần sửa phải cập nhật cả hai trong cùng một commit.
- **Tiếng Việt** là ngôn ngữ chính của giao diện. Mọi chữ hiển thị nằm trong file ngôn ngữ (`apps/web/src/locales/vi.json`, `en.json`) qua `react-i18next`; key bằng tiếng Anh (`tree.toolbar.undo`). Hướng dẫn sử dụng trong app bằng tiếng Việt, kèm bản tiếng Anh trong repo.
- API trả về `{ code, message }` với `message` tiếng Anh; client dịch theo `code`.

---

## 5. Mô hình dữ liệu (MongoDB)

```ts
// ===== Kiểu dùng chung =====
DateInfo {                       // dùng cho cả ngày sinh và ngày mất
  solar?: Date,                  // ngày dương lịch (nếu biết)
  lunar?: {                      // ngày âm lịch Việt Nam (nếu biết)
    day, month, year,
    isLeap                       // true nếu là tháng nhuận
  },
  approxYear?: number,           // chỉ biết "khoảng năm 1920"
  source: 'solar' | 'lunar' | 'approx'   // người dùng thực sự đã nhập loại nào (giữ làm dữ liệu gốc)
}
// Khi một bên đủ ngày/tháng/năm, bên kia được tính ra.
// Giao diện hiện kèm năm Can Chi: 1924 → "Giáp Tý".

// ===== Tài khoản & quyền =====
User {                           // người đăng nhập vào web
  email,                         // unique
  name, avatarUrl,
  googleId?,                     // đăng nhập Google
  passwordHash?,                 // đăng nhập mật khẩu (bcrypt)
  emailVerifiedAt?,              // đặt khi đăng nhập Google hoặc đặt lại mật khẩu; quyết định việc đăng nhập
                                 // Google có được tiếp quản tài khoản mật khẩu đã có hay không (§12)
  locale: 'vi' | 'en',
  createdAt
}

Session {                        // một refresh token (§12); có TTL index trên expiresAt
  userId, familyId,              // mọi token cấp ra từ một lần đăng nhập dùng chung familyId
  tokenHash,                     // SHA-256 của token ngẫu nhiên; không bao giờ lưu chính token
  expiresAt,
  usedAt?, revokedAt?
}

PasswordReset {                  // một link đặt lại mật khẩu (§12)
  userId, tokenHash, expiresAt,
  usedAt?
}

Clan {                           // một dòng họ, VD "Họ Nguyễn – Nam Định"
  name, hometown, description,
  ownerId,                       // User tạo = Chủ họ
  progenitorId?,                 // Person là thuỷ tổ, đời 1
  version,                       // phiên bản cây hiện tại (= seq của Operation mới nhất)
  settings: {
    daughtersDescendantsDepth: 0 | 1 | 2 | 'all',   // xem §8 (mặc định 1)
    showInLawsByDefault: boolean                     // mặc định true
  },
  theme: TreeTheme,              // chủ đề chung của cả họ (§13.4); {} = mặc định
  createdAt
}

TreeTheme {                      // trường nào cũng tuỳ chọn; thiếu thì xét lớp tiếp theo (§13.4)
  surface?: 'grid-paper' | 'corkboard' | 'fridge',
  frame?: CardFrame,
  fastener?: CardFastener,
  thread?: 'cotton' | 'yarn',
  stitch?: 'cotton' | 'yarn'
}
CardFrame    = 'classic' | 'kraft' | 'vintage'
CardFastener = 'washi' | 'pushpin' | 'magnet'
CardStyle {                      // lựa chọn riêng của một thẻ; trường nào cũng tuỳ chọn
  frame?: CardFrame,
  fastener?: CardFastener
}

ViewPreference {                 // "chỉ mình tôi": cách một User tự trang trí một Clan (§13.4)
  userId, clanId,                // duy nhất (userId, clanId)
  enabled: boolean,              // false = "Về chủ đề chung" mà không mất các lựa chọn
  theme: TreeTheme,
  cards: { [personId]: CardStyle },   // mục của người đã bị xoá được bỏ qua và dọn khi lưu
  updatedAt
}

Membership {                     // User nào thuộc dòng họ nào, với vai trò gì
  clanId, userId,                // unique (clanId, userId)
  role: 'owner' | 'editor' | 'viewer'
}

Invite {                         // link mời: /join/:token
  clanId, token,                 // 32 ký tự ngẫu nhiên
  role,                          // vai trò khi chấp nhận
  createdBy, expiresAt           // hết hạn sau 7 ngày
}
// Thu hồi lời mời nghĩa là xoá document Invite.

ShareLink {                      // link công khai chỉ xem: /share/:token
  clanId, token,
  createdBy, expiresAt?,         // không đặt = không hết hạn
  revokedAt?                     // có giá trị khi Chủ họ thu hồi
}

// ===== Cây gia phả =====
Person {                         // một người trong gia phả (KHÔNG phải User)
  _id,                           // do client tạo (ObjectId) để optimistic update hiện ngay
  clanId,
  fullName,                      // "Nguyễn Văn Tư"
  aliases: string[],             // tên huý, tên tự, tên thường gọi
  gender: 'male' | 'female',
  birth?: DateInfo,
  death: {
    isDeceased: boolean,         // false = còn sống
    date?: DateInfo
  },
  parentUnionId?,                // sinh ra từ cuộc hôn nhân nào (→ Union)
  isAdopted: boolean,
  siblingOrder?: number,         // 1 = con trưởng
  branch?: string,               // chi/phái, VD "Chi trưởng"
  birthFamily?: {                // chỉ có ý nghĩa với dâu/rể (§8)
    surname?, fatherName?, motherName?, hometown?, note?
  },
  treeLink?: {                   // chính người này trong một cây gia phả khác (§8.1); ai cũng có thể có
    targetClanId,
    targetPersonId,
    access: 'membership' | 'shareLink',   // liên kết được tạo theo cách nào
    shareLinkId?                          // nếu tạo từ một link chia sẻ
  },                             // index trên treeLink.targetClanId (danh sách liên kết trỏ tới)
  photo?: { publicId, version },  // asset trên Cloudinary (§12, lưu trữ ảnh); URL do client dựng
  cardStyle?: CardStyle,         // lựa chọn chung của cả họ cho thẻ này (§13.4); đổi bằng updatePerson
  bio?, burialPlace?,
  createdAt, updatedAt
}

Union {                          // một cuộc hôn nhân
  _id,                           // do client tạo
  clanId,
  partnerIds: personId[],        // 1–2 người (1 nếu chỉ biết cha hoặc mẹ)
  order: number,                 // 1 = vợ/chồng cả, 2 = thứ hai...
  status: 'married' | 'divorced' | 'widowed'
}
// Ông Tư có hai bà vợ → hai Union. Con trỏ parentUnionId tới đúng Union,
// nên biết là "con ông Tư với bà cả" hay "với bà hai".

// ===== Nhật ký thay đổi =====
Operation {                      // một dòng trong sổ nhật ký thay đổi (§6)
  clanId,
  seq: number,                   // 1, 2, 3... unique (clanId, seq)
  userId,                        // ai sửa
  type: OpType,                  // xem §6.1
  payload: object,               // dữ liệu của thay đổi
  inverse: Operation,            // thay đổi ngược lại, dùng để undo
  revertsSeq?: number,           // có giá trị khi op này hoàn tác một op khác
  createdAt
}

// ===== Nhắc giỗ =====
ReminderSub {                    // User đăng ký nhận nhắc giỗ của một dòng họ
  userId, clanId,                // unique (userId, clanId)
  channels: ('email' | 'push')[],
  daysBefore: number[],          // mặc định [7, 1]
  personIds: personId[]          // rỗng = tất cả người đã mất trong dòng họ
}

PushSub {                        // một thiết bị/trình duyệt đã cho phép thông báo
  userId, endpoint, keys: { p256dh, auth }
}

ReminderLog {                    // "sổ ký nhận" chống gửi trùng (§9.4)
  subId, personId,
  lunarYear,                     // giỗ của năm âm lịch nào
  daysBefore,                    // mốc nhắc nào
  status: 'sending' | 'sent',
  createdAt
}
// unique index (subId, personId, lunarYear, daysBefore)
```

**Tính ra, không lưu:**
- **Số đời** — `computeGenerations()`: thuỷ tổ là đời 1, con là đời 2…; vợ/chồng cùng đời với người kia.
- **Loại huyết thống** — `classifyLineage()` trả về `'blood' | 'in-law' | 'unlinked'` (§8).
- Người chưa nối với thuỷ tổ được liệt kê ở mục "Chưa nối vào cây" để người dùng ghép lại.

**Giới hạn thiết kế:** tối đa 5.000 người mỗi dòng họ. Cả cây tải trong một request (~2 MB trước nén với 2.000 người).

---

## 6. Mô hình Operation (sổ nhật ký thay đổi)

### 6.1 Các loại Operation

| type | payload | inverse (cách hoàn tác) |
|---|---|---|
| `addPerson` | toàn bộ Person mới | `deletePerson` với id đó |
| `updatePerson` | `{ id, changes }` (chỉ các trường đổi) | `updatePerson` với giá trị cũ của đúng các trường đó |
| `deletePerson` | `{ id }` | `restorePerson` với bản chụp (snapshot) người đó + các Union bị xoá theo |
| `addUnion` | Union mới | `deleteUnion` |
| `updateUnion` | `{ id, changes }` | `updateUnion` với giá trị cũ |
| `deleteUnion` | `{ id }` | `restoreUnion` với snapshot |
| `setParents` | `{ personId, parentUnionId \| null }` | `setParents` với giá trị cũ |
| `setTreeLink` | `{ personId, treeLink \| null }` | `setTreeLink` với giá trị cũ |
| `setTreeTheme` | `{ changes }` — các trường `TreeTheme` thay đổi; `null` đưa trường đó về mặc định (§13.4) | `setTreeTheme` với giá trị cũ của đúng các trường đó |
| `batch` | `{ ops: Operation[] }` (dùng cho AI nhập liệu) | `batch` gồm các inverse theo thứ tự ngược |
| `restorePerson` / `restoreUnion` | snapshot đầy đủ | `deletePerson` / `deleteUnion` — chỉ sinh ra khi undo, giao diện không gửi trực tiếp |

`_id` của Person/Union do client tạo. Server kiểm tra đúng định dạng ObjectId và chưa bị dùng; sai thì trả `RULE_VIOLATION`.

**Luật nghiệp vụ** (do `applyOp` kiểm tra, vi phạm thì ném `OpError`):
- Không xoá được người còn con (phải gỡ hoặc chuyển con trước). Xoá một người thì các Union mà người đó là partner duy nhất cũng bị xoá theo.
- `parentUnionId` phải trỏ tới một Union có thật trong cùng dòng họ.
- Không có vòng lặp (không ai là tổ tiên của chính mình).
- Không xoá được thuỷ tổ khi chưa chọn thuỷ tổ khác.

### 6.2 Luồng ghi một thay đổi

```
Client                                         Server
──────                                         ──────
op = { type:'addPerson', payload:{...} }
tree = applyOp(tree, op)   ← màn hình đổi NGAY (optimistic update)
pending.push(op)
POST /api/clans/:id/ops { op, baseVersion: 42 } ─▶ requireAuth → requireRole('editor') → validate(Zod)
                                               withTransaction:
                                                 clan.version !== 42 ?  → 409 VERSION_CONFLICT
                                                 tree = loadTree(clanId)
                                                 applyOp(tree, op)      ← cùng một hàm; ném lỗi nếu sai luật
                                                 ghi Person/Union
                                                 Operation.create({ seq: 43, ... })
                                                 clan.version = 43
                                     ◀──────── 200 { seq: 43 }
pending.shift(); version = 43
```

- **Transaction**: ghi Person/Union + ghi Operation + tăng version, hoặc thành công cả ba, hoặc không cái nào.
- Client gửi các op đang chờ **lần lượt từng cái** (hàng đợi), không gửi song song, để giữ đúng thứ tự.

### 6.3 Khi bị 409 (người khác vừa lưu trước)

```
1. GET /api/clans/:id/ops?since=42      → nhận op 43 (của người khác)
2. tree = cây đã xác nhận gần nhất (bản 42)
3. tree = applyOp(tree, op43)           → giờ giống hệt server
4. với mỗi op trong pending:
     thử tree = applyOp(tree, op)
     lỗi → bỏ op đó + toast "Không lưu được: <lý do>"
5. gửi lại pending với baseVersion = 43
```

Thử lại tối đa 3 lần; quá số đó thì tải lại toàn bộ cây và báo người dùng.

### 6.4 Undo / redo / hoàn tác thay đổi cũ

- **Nút trên thanh công cụ** (luôn hiện trên trang cây, cả máy tính và điện thoại): nút icon ↶ Hoàn tác và ↷ Làm lại, có tooltip kèm phím tắt ("Hoàn tác (Ctrl+Z)"), tự mờ khi không còn gì để hoàn tác, và có dòng mô tả thao tác sắp hoàn tác ("Hoàn tác: thêm Nguyễn Văn Bình"). Bên cạnh là trạng thái lưu: *Đã lưu* / *Đang lưu…* / *Chưa lưu (offline)*.
- **Bàn phím**: Ctrl/⌘+Z hoàn tác; Ctrl/⌘+Shift+Z và Ctrl+Y làm lại. Phím tắt bị bỏ qua khi đang gõ trong ô nhập liệu.
- **Undo** lấy op gần nhất **của chính người dùng trong phiên này** và gửi `inverse` của nó như một **op mới** (có `revertsSeq`). Lịch sử không bao giờ bị xoá, nên nhật ký luôn đầy đủ và trung thực.
- **Redo** gửi lại op vừa bị undo. Có thay đổi mới thì xoá stack redo.
- Stack undo bị xoá khi tải lại trang.
- **Trang Lịch sử**: bấm "Hoàn tác" ở một thay đổi cũ bất kỳ sẽ gửi `inverse` của nó. Nếu không còn áp được (VD người đó đã bị xoá sau đó), hiện lý do lỗi từ `applyOp`.
- Undo một lần AI nhập liệu = gửi inverse của `batch`, gỡ toàn bộ lần nhập đó.

---

## 7. Frontend (`apps/web`)

### 7.1 Cấu trúc thư mục

```
src/
  app/              router, providers (QueryClient, i18n, theme), khung app
  features/
    auth/           đăng nhập, đăng ký, quên mật khẩu
    clans/          danh sách dòng họ, thành viên, link mời, cài đặt
    tree/           ⭐ canvas, layout worker, PersonNode, panel hồ sơ, tìm kiếm, thanh công cụ (undo/redo), liên kết cây, bảng Trang trí (§13.4)
    history/        dòng thời gian thay đổi, hoàn tác
    reminders/      giỗ sắp tới, cài đặt nhắc, đăng ký push
    import/         AI nhập liệu: prompt, dán JSON, xem trước thay đổi
    export/         xuất PNG/SVG/PDF, link chia sẻ
    help/           hướng dẫn sử dụng trong app
  shared/
    ui/             design token, component nền (theo mẫu shadcn/ui trên Radix), thành phần album
                    (Polaroid, DateMark, Thread, Stitch, Board), giao diện sáng/tối, DualDateInput, InfoHint
    lib/            api client, removeDiacritics, các hàm định dạng
  locales/          vi.json, en.json
  sw/               service worker (vite-plugin-pwa / Workbox)
```

Mỗi feature chỉ công khai qua file `index.ts` của nó. Feature này không import file nội bộ của feature khác.

### 7.2 Các trang (React Router)

| Đường dẫn | Nội dung |
|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Tài khoản |
| `/clans` | Các dòng họ của tôi + tạo mới |
| `/clans/:id/tree` | ⭐ Cây gia phả (trang chính); `?focus=:personId` để bay tới một người. Khi trang cây chưa có (tới P5), `/clans/:id` mở trang thành viên |
| `/clans/:id/upcoming` | Giỗ sắp tới |
| `/clans/:id/history` | Lịch sử sửa |
| `/clans/:id/members` | Thành viên & link mời |
| `/clans/:id/import` | AI nhập liệu |
| `/clans/:id/settings` | Tên, thuỷ tổ, cài đặt dâu/rể, link chia sẻ, liên kết trỏ tới, nhắc giỗ |
| `/join/:token` | Nhận lời mời |
| `/share/:token` | Cây công khai chỉ xem; `?focus=:personId` |
| `/help/*` | Hướng dẫn sử dụng |

### 7.3 Quản lý state

| Dữ liệu | Công cụ | Ghi chú |
|---|---|---|
| Danh sách dòng họ, thành viên, giỗ sắp tới, lịch sử, user hiện tại, bản xem trước liên kết, `ViewPreference` của tôi (§13.4) | **TanStack Query** | Cache, tải lại, trạng thái loading/error |
| Cây đang chỉnh sửa | **Zustand** store `useTreeStore` | `persons`, `unions`, `confirmedVersion`, `confirmedTree`, `pending[]`, `undoStack[]`, `redoStack[]` |
| State giao diện cục bộ (panel đang mở, người đang chọn) | `useState` / slice Zustand nhỏ | |

Component đọc store qua **selector** (`useTreeStore(s => s.persons[id])`) để chỉ vẽ lại khi đúng phần đó đổi.

Cache của TanStack Query được lưu vào IndexedDB (`@tanstack/query-persist-client`) để xem offline các cây mở gần đây (S7).

### 7.4 ⭐ Vẽ cây lớn

**Pipeline:**

```
persons + unions (store) + tuỳ chọn xem (nhánh thu gọn, showInLaws, daughtersDescendantsDepth)
  → postMessage sang Layout Web Worker
      1. computeGenerations() + classifyLineage()
      2. dựng "đơn vị gia đình": [người trong họ + các vợ/chồng theo thứ tự] → các con theo từng Union
      3. đo bề rộng mỗi nhánh từ dưới lên
      4. đặt x từ trên xuống: con căn giữa dưới Union của cha mẹ; các nhánh không chồng lấn
      5. bỏ qua nhánh đang thu gọn và các node bị ẩn theo tuỳ chọn xem
  ◀ { nodeId: {x, y} }
  → React Flow vẽ PersonNode, UnionNode (chấm hôn nhân) và cạnh cha mẹ → con
```

Vì dâu/rể không bao giờ mở rộng ngược lên trên (§8), layout là cây hậu duệ thuần: một lượt từ dưới lên, một lượt từ trên xuống, O(n), không có cạnh nào cắt nhau.

**Kỹ thuật giữ hiệu năng:**

| Kỹ thuật | Tác dụng |
|---|---|
| `onlyRenderVisibleElements` của React Flow | Chỉ vẽ node nằm trong màn hình |
| `React.memo` cho PersonNode + selector theo id | Sửa một người thì chỉ thẻ đó vẽ lại |
| Mức chi tiết theo zoom (LOD) | < 0.4: một dải băng dính washi màu của chi · 0.4–0.8: nhãn tên dán băng kèm năm sinh–mất · > 0.8: ảnh polaroid đầy đủ có ảnh và tem ngày (§13.3) |
| Layout trong Web Worker | Tính lại vị trí không làm đơ giao diện |
| Chỉ tính lại layout khi cấu trúc đổi | Sửa tên hay ngày không phải tính lại vị trí |
| Thu gọn/mở rộng nhánh | Bớt node khi cây cực lớn |

**Tìm kiếm:** bỏ dấu cả tên lẫn từ khoá ("nguyen van tu" khớp "Nguyễn Văn Tư"), tìm cả trong `aliases`. Chọn kết quả thì mở các nhánh bị thu gọn trên đường đi, gọi `fitView` để bay tới và làm nổi bật thẻ.

**Script benchmark:** `pnpm seed:fake --people 2000` sinh cây giả nhiều đời để đo S1 và S2. Số liệu trước/sau tối ưu ghi vào README.

### 7.5 Thanh công cụ của cây

Thanh trên cùng của trang cây, từ trái sang phải: tên dòng họ (hoặc breadcrumb khi đang đi theo liên kết, §8.1) · **↶ Hoàn tác · ↷ Làm lại** · trạng thái lưu · tìm kiếm · menu xem (hiện/ẩn dâu/rể, số đời con cháu của con gái, thu gọn tất cả) · **Trang trí** (§13.4) · xuất file · vừa màn hình. Trên điện thoại thu thành thanh dưới cùng: Hoàn tác/Làm lại luôn hiện, phần còn lại trong menu "thêm". Mọi nút có nhãn cho trình đọc màn hình và trạng thái focus rõ ràng.

### 7.6 Form & nhập liệu

- React Hook Form + resolver Zod (schema từ `packages/shared`).
- Bấm vào một người mở **panel bên phải** (bottom sheet trên điện thoại) để xem/sửa. Lưu thì tạo op `updatePerson` chỉ chứa các trường đã đổi.
- `DualDateInput`: nút chuyển **Âm / Dương / Chỉ biết năm**. Nhập một bên thì hiện bên kia và năm Can Chi. Ô "tháng nhuận" hiện khi chọn Âm.
- Menu chuột phải (và nút trên thẻ ở thiết bị cảm ứng): Thêm con · Thêm vợ/chồng · Thêm cha/mẹ (nếu chưa có) · Đổi quan hệ… · Nối với cây gia phả khác · Trang trí thẻ này… (§13.4) · Xoá.
- Người mới được tạo qua form và nhập bằng AI (§10), không bao giờ bằng kéo thả. Kéo thả chỉ dùng để **đổi quan hệ**.

**Kéo thả để đổi quan hệ (chỉ người có quyền sửa).** Vị trí luôn do layout tính (§7.4); kéo thả không bao giờ lưu một vị trí tự do.

- **Vùng thả.** Thả thẻ A vào ⅓ trên, ⅓ giữa hoặc ⅓ dưới của thẻ B thì A thành **cha/mẹ**, **vợ/chồng** hoặc **con** của B. Các vùng hiện nhãn trên thẻ B khi rê tới, và dòng trạng thái nói chính xác lần thả sẽ làm gì.
- **Thay thế, không chồng thêm.** Quan hệ trực tiếp đang có giữa A và B (vợ chồng, cha mẹ hoặc con) được thay bằng quan hệ mới. Khi một cặp vợ chồng đổi thành cha mẹ – con, các con chung ở lại với người trở thành con.
- **Hỏi tiếp thay vì ngõ cụt.**
  - Nếu B có nhiều vợ/chồng, đặt A làm con của B sẽ hỏi "con của B với ai?" (hoặc "chỉ B").
  - Nếu B đã có đủ cha và mẹ, đặt A làm cha/mẹ của B sẽ hỏi A thay cho ai.
  - Nếu một trong hai người có con mới chỉ biết một cha/mẹ, đặt A và B làm vợ chồng sẽ hỏi đó có phải con chung không.
  - Câu hỏi nào cũng có lựa chọn "Thôi, không đổi".
- **Chỉ chặn điều không thể.** Lần thả chỉ bị chặn khi tạo ra trạng thái không thể có, ví dụ một người thành tổ tiên của chính mình qua người khác. Vùng bị chặn được gạch ngang kèm lý do trước khi thả, và lý do chỉ cách làm tiếp. Bước kiểm tra chạy đúng `applyOp` của server, nên giao diện không bao giờ nhận một lần thả mà server sẽ từ chối.
- **Hoàn tác.** Mỗi lần thả thành công là một op `batch`, tức là một bước hoàn tác. Một thông báo xác nhận thay đổi kèm nút "Hoàn tác".
- **Huỷ khi đang kéo.** Bấm Esc, hoặc thả thẻ ra chỗ trống cách vị trí cũ hơn khoảng một tấm ảnh.
- **Cắt chỉ.**
  - Bấm vào sợi chỉ hoặc ghim đỏ của nó, hay nút tròn giữa hai vợ chồng, để hiện nút **Cắt chỉ**.
  - Cắt sợi chỉ cha mẹ → con là `setParents(null)`.
  - Cắt quan hệ vợ chồng có con chung sẽ hỏi các con ở lại với ai; người còn lại được gỡ khỏi Union đó bằng `updateUnion`.
  - Ly hôn mà cả hai vẫn là cha mẹ thì ghi trạng thái Union `divorced` (đường khâu đứt quãng), không cắt chỉ.
- **Ảnh chưa dán.** Ai không còn nối với cây thì chuyển vào cột **Ảnh chưa dán** chứ không bị xoá. Một nhánh bị tách ra đi cùng nhau thành một xấp ảnh và có thể thả lại lên cây.
- **Xê dịch.** Thả thẻ cách vị trí cũ chưa tới khoảng một tấm ảnh thì thẻ giữ một độ lệch hiển thị nhỏ, giúp sợi chỉ ngắn vẫn dễ bấm. Độ lệch lưu theo từng máy (localStorage), không phải op và không chia sẻ cho người khác. Nút **Xếp lại gọn** xoá hết độ lệch.
- **Cảm ứng.** Nhấn giữ khoảng 400 ms để nhấc thẻ lên; vuốt bình thường vẫn là di chuyển cây.
- **Bàn phím và trình đọc màn hình.** Mục **Đổi quan hệ…** trong menu của thẻ liệt kê từng quan hệ kèm nút **Gỡ**, và có các lựa chọn thêm hoặc thay như trên.

### 7.7 PWA

- `vite-plugin-pwa` (Workbox) sinh service worker và manifest: tên, tên ngắn tiếng Việt, icon (192/512, maskable), màu chủ đạo, `display: standalone`.
- Cache: khung app được precache; `/api/clans/:id/tree` dùng network-first, mất mạng thì lấy cache; ảnh dùng stale-while-revalidate có giới hạn dung lượng.
- Offline: cây mở ở chế độ chỉ đọc từ cache với banner "Đang offline — chỉ xem"; các nút sửa bị tắt (sửa offline thuộc giai đoạn 2).
- Mời cài: nút "Cài ứng dụng" dùng `beforeinstallprompt` trên Android/máy tính; trên iOS là hướng dẫn ngắn có hình (Chia sẻ → Thêm vào MH chính), vì **iOS chỉ cho phép web push với PWA đã được thêm vào màn hình chính**. Trang cài đặt nhắc giỗ tự hiện hướng dẫn này khi người dùng iOS bật push mà chưa cài app.
- Cập nhật: khi có service worker mới đang chờ, hiện "Đã có phiên bản mới — Tải lại".

### 7.8 Responsive & khả năng tiếp cận

- Kéo/zoom bằng cảm ứng (React Flow có sẵn); panel thành bottom sheet trên màn hình nhỏ.
- Bàn phím: Tab qua các thẻ, Enter mở hồ sơ, phím mũi tên di chuyển giữa cha/con/anh chị em. "Đổi quan hệ…" trong menu của thẻ là cách dùng bàn phím thay cho kéo thả (§7.6).
- Độ tương phản đạt WCAG AA. Mỗi thẻ có `aria-label` gồm tên, năm sinh–mất, đời.

---

## 8. Dâu/rể và bên ngoại

Gia phả Việt Nam truyền thống theo dòng cha, nhưng các gia đình vẫn muốn biết ai đã về làm dâu/rể và họ từ đâu đến, mà không làm cây phình ngang ra.

**Phân loại** (`classifyLineage()`, tính ra chứ không lưu):
- `blood` — thuỷ tổ và mọi người là hậu duệ của thuỷ tổ qua `parentUnionId`.
- `in-law` — không cùng huyết thống, nhưng là partner trong một Union với người trong họ.
- `unlinked` — không thuộc hai loại trên; liệt kê ở "Chưa nối vào cây".

**Luật hiển thị:**
- Dâu/rể đặt **cạnh vợ/chồng là người trong họ** (theo `Union.order`) và không bao giờ mở rộng lên trên, nên layout luôn là cây hậu duệ thuần (§7.4).
- Thẻ dâu/rể có kiểu riêng nhưng nhẹ nhàng (viền, nền nhạt hơn) và một dòng phụ lấy từ `birthFamily`, VD "Con gái ông Trần Văn X · Hà Nam". Mở panel sẽ thấy đầy đủ thông tin gia đình gốc.
- Dâu/rể cùng số đời với vợ/chồng nhưng **không tính vào thống kê người trong họ** ("312 người · 85 dâu/rể").
- **Con cháu của con gái**: `Clan.settings.daughtersDescendantsDepth` quyết định hiện bao nhiêu đời dưới người con gái đã đi lấy chồng (mặc định 1 = các con của cô ấy, thu gọn sẵn). Kiểu truyền thống "chỉ theo dòng con trai" là 0.
- **Nút "Ẩn dâu/rể"** trong menu xem và trong tuỳ chọn xuất file, cho ra gia phả kiểu truyền thống chỉ gồm người trong họ. Dâu/rể bị ẩn thu thành một dấu nhỏ trên thẻ vợ/chồng ("+1 vợ").
- Tìm kiếm có cả dâu/rể, kèm nút lọc.

### 8.1 Liên kết cây gia phả

Bất kỳ ai — dâu/rể, con gái đã đi lấy chồng, con nuôi có gia đình gốc — đều có thể được nối với **chính người đó trong một cây gia phả khác** trên nền tảng, khi cây đó đã được chia sẻ.

**Tạo liên kết** (Chủ họ/Biên tập của dòng họ nguồn):
1. Panel hồ sơ → "Nối với cây gia phả khác".
2. Chọn đích: một dòng họ mà người dùng là thành viên, **hoặc** dán link chia sẻ người khác gửi cho (`/share/:token`).
3. Tìm và chọn đúng người tương ứng trong cây đích (có cây nhỏ xem trước để chắc chắn chọn đúng).
4. Lưu thành op `setTreeLink`, nên có trong lịch sử và hoàn tác được.

**Dấu hiệu khi di chuột:**
- Thẻ có liên kết mang một huy hiệu nhỏ hình "cây liên kết" ở góc, ở mọi mức zoom ≥ 0.4; thấp hơn thì là một viền màu nhấn mảnh.
- Di chuột (máy tính), nhấn giữ (cảm ứng) hoặc focus bằng bàn phím sẽ mở **popover xem trước**: tên dòng họ đích, quê, số người, tên người đó trong cây kia, trạng thái truy cập, và nút "Mở cây gia phả của họ".
- Dữ liệu popover được tải khi cần từ `GET /api/persons/:personId/tree-link/preview` và được TanStack Query cache. Di chuột vào cũng **prefetch** sẵn cây đích nên khi bấm sẽ mở gần như tức thì.
- Các trạng thái: ✅ **Mở được** · 🔒 **Chưa có quyền** (người xem không phải thành viên và không có link chia sẻ hợp lệ — "Hãy xin Chủ họ {tên dòng họ} cấp quyền") · ⚠️ **Không khả dụng** (link chia sẻ đã bị thu hồi/hết hạn, người đích đã bị xoá, hoặc Chủ họ bên kia đã chặn dòng họ này).

**Bấm vào → mở cây được liên kết:**
- Chuyển tới `/clans/:targetId/tree?focus=:personId` (nếu là thành viên) hoặc `/share/:token?focus=:personId` (nếu qua link chia sẻ); cây bay tới và làm nổi bật người đó.
- Một **breadcrumb** hiện đường đã đi: "Họ Nguyễn (Nam Định) › Họ Trần (Hà Nam)". Bấm vào một mục hoặc nút Back của trình duyệt sẽ quay về cây trước, đúng vị trí đang xem. Breadcrumb nằm trong state của router; quá 5 cấp thì phần giữa thu thành "…".
- Có hiệu ứng chuyển cảnh ngắn giữa hai cây (tắt khi người dùng bật `prefers-reduced-motion`).
- Trong cây đích, cùng người đó hiện huy hiệu ngược lại "Cũng có trong: Họ Nguyễn" nếu người xem có quyền xem cây nguồn.

**Quyền truy cập & riêng tư (kiểm tra ở server):**
- Xem trước và mở cây chỉ thành công khi người xem là thành viên dòng họ đích, hoặc link chia sẻ của liên kết vẫn còn hiệu lực.
- Qua link chia sẻ, cây đích chỉ đọc và được lọc như mọi link công khai (ẩn chi tiết người còn sống). Trong popover, nếu người được liên kết còn sống và truy cập qua link chia sẻ thì chỉ hiện "Một thành viên còn sống".
- Tạo liên kết từ link chia sẻ không bao giờ cấp quyền thành viên.
- Chủ họ của dòng họ đích thấy mục **Liên kết trỏ tới** trong cài đặt (dòng họ nào đang nối vào, bao nhiêu người) và có thể **chặn** một dòng họ nguồn; thu hồi link chia sẻ sẽ làm các liên kết tạo từ link đó ngừng hoạt động.
- Liên kết là một chiều; dòng họ đích có thể tự tạo liên kết ngược lại.

**Endpoint:**
- `GET /api/clans/:id/persons/search?q=` — chọn người trong cây đích (cần có quyền)
- `GET /api/persons/:personId/tree-link/preview` — dữ liệu popover + trạng thái truy cập
- `GET /api/clans/:id/incoming-links` — chỉ Chủ họ
- `POST /api/clans/:id/incoming-links/:sourceClanId/block` — chỉ Chủ họ

---

## 9. Âm lịch & nhắc giỗ

### 9.1 Đổi âm–dương lịch

- `packages/shared/lunar/` cài đặt **thuật toán Hồ Ngọc Đức** cho **UTC+7**. Không dùng thư viện lịch Trung Quốc (UTC+8) vì có những năm lệch với lịch Việt Nam (VD Tết 1985).
- Interface (nơi gọi phụ thuộc vào interface, không phụ thuộc thuật toán):
  ```ts
  interface LunarCalendar {
    solarToLunar(date: Date): LunarDate                  // { day, month, year, isLeap }
    lunarToSolar(l: LunarDate): Date | null              // null nếu ngày âm đó không tồn tại
    daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30
    leapMonthOf(lunarYear: number): number | null
  }
  canChiYear(lunarYear: number): string                  // 1924 → "Giáp Tý"
  ```
  Bản cài đặt mặc định là `HoNgocDucCalendar`; dữ liệu mỗi năm âm lịch được memoize (tính một lần rồi nhớ).

**Có giới hạn năm (VD 2100) không?** Không. Thuật toán là **phép tính thiên văn**, không phải bảng tra cứu: nó tính thời điểm trăng mới và kinh độ mặt trời (tiết khí) bằng công thức trong sách *Astronomical Algorithms* của Jean Meeus, rồi áp luật lịch (tháng bắt đầu vào ngày có trăng mới; trong năm có 13 tháng, tháng không chứa trung khí là tháng nhuận). Nó chạy được với mọi năm; độ chính xác chỉ giảm dần rất chậm qua nhiều thế kỷ. 1900–2100 chỉ là phạm vi của **bảng đối chiếu đã công bố** mà mình dùng để test. Ngoài phạm vi đó, tính đúng được bảo vệ bởi:

| Lớp | Làm gì |
|---|---|
| Golden test | Khớp 100% bảng ngày Tết 1900–2100 đã công bố |
| Property-based test (`fast-check`, năm 1800–2400) | Các luật luôn đúng: tháng có 29 hoặc 30 ngày; năm âm có 12 hoặc 13 tháng; tháng nhuận không chứa trung khí; Tết rơi trong 21/1–20/2; `lunarToSolar(solarToLunar(d)) === d` |
| Differential test (2100–2400) | So ngày đầu tháng với một thư viện thiên văn độc lập có độ chính xác cao (`astronomy-engine`). Chỉ có thể lệch khi trăng mới rơi sát nửa đêm vài phút; mọi ngày như vậy được ghi vào một ADR |
| Có thể thay thuật toán | Nếu cần chính xác hơn, `EphemerisCalendar` (dựa trên astronomy-engine) hoặc `TableCalendar` (bảng lịch chính thức) có thể thay `HoNgocDucCalendar` mà không phải sửa nơi gọi |

**Lưu ý lịch sử:** trước năm 1968, lịch âm Việt Nam được tính theo UTC+8 (ở miền Nam còn lâu hơn). Vì vậy đổi một ngày mất **dương lịch** trước 1968 sang âm lịch có thể lệch một ngày, thậm chí một tháng. Khi `source: 'solar'` và năm trước 1968, giao diện hiện ghi chú nhờ gia đình xác nhận lại ngày âm. *(Mốc năm này cần đối chiếu nguồn trước khi viết vào code.)*

### 9.2 Ngày giỗ năm nay

```ts
anniversaryFor(deathLunar: LunarDate, targetLunarYear: number): {
  solarDate: Date,
  notes: AnniversaryNote[],         // hiển thị thành ghi chú trên giao diện
  kind: 'first' | 'second' | 'regular'
}
```

| Trường hợp | Luật | Ghi chú trên giao diện |
|---|---|---|
| Mất vào tháng nhuận; năm nay không có tháng nhuận đó | Dùng tháng thường cùng số | ℹ️ Mất ngày 10/4 nhuận. Năm nay không có tháng 4 nhuận nên giỗ tính theo 10/4 thường. |
| Mất vào tháng nhuận; năm nay có đúng tháng nhuận đó | Vẫn dùng **tháng thường** (theo tập quán phổ biến) | ℹ️ Giỗ tính theo tháng 4 thường, như phần lớn các gia đình. |
| Mất ngày 30; tháng năm nay chỉ có 29 ngày | Dùng ngày 29 | ℹ️ Mất ngày 30/7 âm. Tháng 7 năm nay chỉ có 29 ngày nên giỗ vào 29/7. |
| Năm âm lịch thứ 1 sau khi mất | `kind: 'first'` | 🏷️ **Giỗ đầu** |
| Năm âm lịch thứ 2 sau khi mất | `kind: 'second'` | 🏷️ **Giỗ hết** — thường làm lớn |
| Ngày mất nhập theo dương lịch | Đổi sang âm khi lưu (`source: 'solar'`) | ℹ️ Ngày âm được tính từ ngày dương 12/05/1990 — hãy kiểm tra lại với gia đình. (+ lưu ý trước 1968 nếu có) |
| Chỉ biết năm / thiếu ngày tháng | Không tính giỗ | ⚠️ Chưa đủ thông tin để tính ngày giỗ. [Bổ sung] |

Component `InfoHint` hiển thị các ghi chú (di chuột trên máy tính, chạm trên điện thoại).

### 9.3 Trang "Giỗ sắp tới"

- Các ngày giỗ trong 30 ngày tới, sắp theo ngày: ngày dương (thứ) · ngày âm · tên · đời · chi · nhãn/ghi chú · "còn N ngày".
- Link "Thêm vào Google Calendar" (URL mẫu tạo sự kiện, không cần API).

### 9.4 Job nhắc giỗ

**Kích hoạt — nhiều lớp, không phụ thuộc repo có hoạt động hay không:**

| Lớp | Dịch vụ (miễn phí) | Khi nào | Vai trò |
|---|---|---|---|
| 1. Chính | **Cloudflare Worker Cron Trigger** (`apps/cron-worker`) | 00:00 UTC = 07:00 VN | Gọi endpoint; Worker chạy theo lịch được chờ tối đa 15 phút nên chờ được server Render đang ngủ (30–60 giây); lỗi thì thử lại 3 lần, cách nhau 1 phút |
| 2. Dự phòng | **cron-job.org** | 00:30 UTC = 07:30 VN | Gọi lại endpoint; thất bại thì gửi email cảnh báo |
| 3. Giám sát | **Sentry Cron Monitor** | — | Job báo "check-in" khi chạy xong; tới 08:00 chưa có thì cảnh báo |
| 4. Tự bù | Logic bắt kịp trong job (bên dưới) | — | Ngày bị lỡ được gửi trễ ở lần chạy sau, không bao giờ mất |

- Vì job **idempotent**, việc lớp 1 và lớp 2 cùng chạy trong một ngày là an toàn.
- `POST /api/internal/run-reminders` (cần header `X-Cron-Secret`) **trả `202 Accepted` ngay** rồi chạy job ở nền trong process Express (cron-job.org chỉ chờ tối đa 30 giây).
- Không dùng: GitHub Actions `schedule` (tự tắt sau 60 ngày không hoạt động ở repo public) và `node-cron` chạy trong server (Render free ngủ sau 15 phút không dùng).

**Thuật toán (có bắt kịp):**
```
milestones = daysBefore sắp giảm dần, VD [7, 1]
với mỗi ReminderSub:
  với mỗi người đã mất (lọc theo personIds nếu có) có ngày mất âm lịch:
    d = ngày dương của lần giỗ sắp tới (năm âm hiện tại, hoặc năm sau nếu đã qua)
    remaining = d - hôm nay   (Asia/Ho_Chi_Minh)
    n = mốc NHỎ NHẤT thoả remaining <= n     // còn 5 ngày → mốc 7; còn 1 hoặc 0 → mốc 1
    nếu có n:
      ghi ReminderLog { subId, personId, lunarYear, daysBefore: n }   (unique)
        → trùng khoá (E11000): bỏ qua
      gửi email và/hoặc push theo số ngày thực tế: "Còn {remaining} ngày nữa là giỗ ..."
      thành công → status 'sent'; thất bại → xoá log để lần sau thử lại
```
Ví dụ: cả hai lớp đều hỏng đúng ngày "còn 7 ngày". Hôm sau (còn 6 ngày), mốc 7 vẫn chưa được ký sổ nên job gửi "Còn 6 ngày…". Người dùng nhận trễ một ngày nhưng không bị mất lời nhắc.

- **Idempotent** nhờ unique index của ReminderLog ("ký sổ trước, gửi sau"). Không làm kiểu "kiểm tra rồi mới gửi" vì sẽ bị **race condition**.
- Endpoint push trả lỗi 410 (hết hạn) thì xoá PushSub đó.
- Nội dung email: "Còn 7 ngày nữa là giỗ cụ Nguyễn Văn Tư (đời 3) — Thứ Bảy 21/11/2026, tức 11/10 âm lịch" + link mở hồ sơ + link huỷ đăng ký. (Hiển thị theo ngôn ngữ của người dùng.)

---

## 10. AI nhập liệu (người dùng tự dùng AI của họ)

### 10.1 Luồng

```
1. /clans/:id/import hiện PROMPT MẪU + nút Copy + hướng dẫn 3 bước có hình
2. Người dùng dán prompt + ảnh trang sổ gia phả vào ChatGPT / Gemini / Claude
3. Người dùng copy JSON AI trả về, dán vào app
4. Kiểm tra (chạy hoàn toàn trên trình duyệt):
   a. Tách JSON khỏi phần chữ thừa (AI hay bọc trong ```json ... ```)
   b. JSON.parse lỗi → "JSON sai cú pháp ở dòng X, cột Y"
   c. Zod ImportSchema lỗi → liệt kê từng trường sai, VD "people[3].gender phải là male hoặc female"
   d. Kiểm tra quan hệ: mọi tempId được nhắc tới đều tồn tại; không có vòng lặp
   e. Dò người trùng với cây hiện có: tên không dấu giống ≥ 90% VÀ năm sinh lệch ≤ 2 năm (nếu biết)
5. XEM TRƯỚC THAY ĐỔI (danh sách + cây nhỏ):
   🟢 người mới
   🟡 có thể trùng "Nguyễn Văn Tư (1920)" → [Cùng người – gộp] [Người khác – thêm]
   ⚠️ trường AI đánh dấu không chắc chắn được tô màu, sửa được ngay tại chỗ
   + "gắn vào": chọn người nào trong cây là cha/mẹ của người đứng đầu đoạn nhập
6. "Nhập vào cây" → một op `batch` → POST /api/clans/:id/ops (một transaction)
   → bấm Hoàn tác một lần là gỡ cả lần nhập
```

### 10.2 Định dạng JSON yêu cầu AI trả về

```json
{
  "people": [
    {
      "tempId": "p1",
      "fullName": "Nguyễn Văn Tư",
      "aliases": ["Cụ Tư"],
      "gender": "male",
      "birth": { "lunar": { "day": 5, "month": 1, "year": 1924, "isLeap": false } },
      "death": { "isDeceased": true, "lunar": { "day": 12, "month": 3, "year": 1990, "isLeap": false } },
      "uncertain": ["birth"]
    }
  ],
  "unions": [
    { "tempId": "u1", "partners": ["p1", "p2"], "order": 1 }
  ],
  "children": [
    { "child": "p3", "parentUnion": "u1", "siblingOrder": 1, "isAdopted": false }
  ]
}
```

Prompt yêu cầu AI: chỉ trả về JSON đúng định dạng này; không bịa thông tin; đánh dấu các trường đọc không rõ vào `uncertain`; chỉ đổi năm Can Chi sang số khi suy ra được, không thì đánh dấu không chắc chắn.

### 10.3 An toàn

- Kết quả AI luôn bị coi là **không tin cậy**: phải qua Zod, rồi qua `applyOp`, rồi người dùng duyệt rõ ràng.
- Mọi chuỗi hiển thị dạng text (React tự escape). Không bao giờ dùng `dangerouslySetInnerHTML`.
- Tối đa 500 người mỗi lần nhập.

---

## 11. Xuất file & chia sẻ

- **PNG/SVG:** `html-to-image` chụp vùng React Flow, tạm tắt LOD để có đủ chi tiết.
- **PDF:** `jsPDF`, khổ ngang A4/A3/A1. Cây lớn hơn trang giấy thì chia thành nhiều trang có dấu ghép. Có tiêu đề và ngày xuất. Tuỳ chọn: ẩn dâu/rể, số đời con cháu của con gái.
- **Chủ đề:** file xuất và link chia sẻ luôn dùng cách trang trí chung của cả họ, không bao giờ dùng lựa chọn "chỉ mình tôi" của ai (§13.4).
- **Link chia sẻ:** `GET /api/share/:token/tree`. **Server** lọc dữ liệu trước khi trả về: người còn sống chỉ giữ tên, giới tính và quan hệ; bỏ ngày sinh, ảnh và tiểu sử. Lọc ở server vì dữ liệu đã gửi về trình duyệt thì ai cũng xem được qua DevTools. Chủ họ có thể thu hồi link bất cứ lúc nào. Link chia sẻ cũng là một cách để dòng họ khác nối cây vào (§8.1).

---

## 12. Bảo mật

- Mật khẩu băm bằng bcrypt (cost 12).
- Phiên đăng nhập (cookie `httpOnly`, `SameSite=Lax`, thêm `Secure` ở production):
  - **Access token:** JWT (HS256), 15 phút, cookie `at`, path `/api`.
  - **Refresh token:** chuỗi ngẫu nhiên không mang thông tin, cookie `rt`, path `/api/auth`, 30 ngày. Chỉ lưu mã băm SHA-256 của nó (`Session`). Mỗi lần dùng là xoay sang token mới. Dùng lại một token cũ sau hơn 10 giây kể từ lần dùng đầu thì thu hồi cả họ token (phát hiện bị đánh cắp); trong vòng 10 giây thì coi là một tab khác làm mới cùng lúc.
  - **CSRF:** `SameSite=Lax` cộng kiểm tra header `Origin` trên mọi request `/api` không phải GET (request mang `Origin` lạ bị từ chối; trình duyệt luôn gửi `Origin` khi ghi chéo trang).
  - **Đăng nhập Google:** qua chuyển hướng (authorization code + PKCE, `state` và `nonce` giữ trong cookie sống ngắn); chỉ nhận email Google đã xác minh. Đăng nhập Google tiếp quản tài khoản có email chưa từng được xác minh bằng cách xoá mật khẩu và đăng xuất khỏi mọi thiết bị.
  - **Đặt lại mật khẩu:** link có hiệu lực 1 giờ, dùng một lần, token nằm trong phần fragment của URL (`/reset-password#token=…`) nên không gửi tới máy chủ hay log. Yêu cầu luôn trả lời giống nhau dù email có tồn tại hay không. Đặt lại mật khẩu sẽ đăng xuất mọi thiết bị.
  - **Đăng nhập khi đã có phiên:** mỗi lần đăng nhập (mật khẩu, đăng ký, đặt lại mật khẩu hoặc Google) thu hồi cả họ token của cookie refresh mà trình duyệt đang giữ.
  - **Sau proxy:** `trust proxy` đặt theo số tầng proxy (`TRUST_PROXY_HOPS`); ở production, `APP_ORIGIN` và `TRUST_PROXY_HOPS` là bắt buộc khi khởi động. Logger che cookie và `Authorization`, che token mời, `code`, `state` và `returnTo` của Google cùng URL đặt lại mật khẩu, và ẩn các header `Referer` và `Location`.
- Mọi route `/clans/:id/*` kiểm tra Membership + vai trò ở middleware. Không bao giờ tin `clanId` trong body; luôn kiểm tra `Person.clanId === :id`.
- `helmet`, `express-rate-limit` (đăng nhập, đăng ký, quên mật khẩu và đặt lại mật khẩu: 5 lần/phút theo từng IP và từng endpoint; API chung: 300 lần/phút/user). Đăng nhập còn có giới hạn thứ hai: 10 lần thử sai trong 15 phút cho mỗi email (`RATE_LIMITED`, 429; đăng nhập thành công không bị tính), nên dò mật khẩu qua nhiều IP cũng không thoát. Đánh đổi: ai biết email của một người dùng đều có thể chặn việc đăng nhập bằng mật khẩu của người đó tối đa 15 phút, và chặn email đặt lại mật khẩu của họ tối đa 24 giờ (giới hạn 5 email mỗi 24 giờ). Đăng nhập bằng Google và các phiên đang mở không bị ảnh hưởng. Cải tiến sau này: miễn trừ theo thiết bị (một cookie có chữ ký, đặt sau khi đăng nhập thành công). Quên mật khẩu vẫn luôn trả 204, nhưng mỗi người dùng chỉ được gửi tối đa một email mỗi 60 giây và 5 email mỗi 24 giờ.
- Upload ảnh: client xin **chữ ký upload** từ API rồi upload thẳng lên Cloudinary; tối đa 2 MB; chỉ jpg/png/webp. Đường dẫn và các bước kiểm tra: xem "Lưu trữ ảnh" bên dưới.
- `/internal/*` yêu cầu `X-Cron-Secret` khớp biến môi trường.
- Token mời/chia sẻ: 32 ký tự từ `crypto.randomBytes`.

### Lưu trữ ảnh (Cloudinary)

Một cloud Cloudinary dùng cho mọi môi trường. API quyết định mọi đường dẫn; trình duyệt không bao giờ tự chọn.

```
ancestors-tree/                      gốc trên Cloudinary
├─ dev/                              CLOUDINARY_FOLDER=ancestors-tree/dev (chạy trên máy)
└─ prod/                             CLOUDINARY_FOLDER=ancestors-tree/prod (Render)
   └─ clans/<clanId>/
      └─ people/<personId>/
         └─ <ngẫu nhiên>             mỗi ảnh tải lên là một asset
```

- **Theo dòng họ, rồi theo người.** Xoá một dòng họ thì xoá theo tiền tố `…/clans/<clanId>/`; xoá hẳn một người thì xoá `…/people/<personId>/`. Dung lượng của từng dòng họ đo được theo tiền tố.
- **Không có tên người trong đường dẫn.** ID là ID trong cơ sở dữ liệu, đoạn cuối là 16 ký tự ngẫu nhiên (`crypto.randomBytes`). URL ảnh có thể lộ ra (ảnh chụp màn hình, lịch sử trình duyệt), nên nó không chứa tên hay ngày tháng và không đoán được.
- **API ký từng lần upload.** `POST /api/clans/:id/people/:personId/photo-upload` (Editor hoặc Owner) ký đúng các tham số: `public_id` (đường dẫn đầy đủ), `asset_folder` (phần thư mục của nó, để cả hai chế độ thư mục của Cloudinary cho ra cùng một cây), `allowed_formats=jpg,png,webp`, `tags=clan_<clanId>` và phép biến đổi khi nhận `c_limit,w_1600,h_1600`, vốn mã hoá lại ảnh và bỏ siêu dữ liệu (kể cả vị trí GPS). Client từ chối file trên 2 MB trước khi upload.
- **Kiểm tra khi lưu.** Client lưu `photo: { publicId, version }` bằng một op `updatePerson` bình thường. Server chỉ chấp nhận khi `publicId` bắt đầu bằng tiền tố của đúng dòng họ và người đó, và asset tồn tại với dung lượng tối đa 2 MB (Admin API); nếu không thì trả 422 và xoá asset.
- **Giữ ảnh cũ** chừng nào còn op tham chiếu tới nó có thể hoàn tác hoặc khôi phục (§6.4). Dọn các asset không còn ai dùng để sang Giai đoạn 2.
- **Hiển thị.** Trình duyệt tự dựng URL từ tên cloud công khai (`VITE_CLOUDINARY_CLOUD_NAME`), `publicId`, `version` và các phép biến đổi có tên: polaroid `c_fill,g_face,w_172,h_148,f_auto,q_auto` (gấp đôi vùng ảnh 86×74), hồ sơ `c_fill,g_face,w_480,h_480,f_auto,q_auto`. Link chia sẻ (§11) bỏ `photo` của người còn sống ngay trên server, nên URL ảnh của họ không bao giờ được gửi đi.
- **Bí mật.** `CLOUDINARY_URL` (API key và secret) chỉ nằm trong biến môi trường của API.

---

## 13. Lỗi, trạng thái giao diện & thiết kế hình ảnh

### 13.1 Xử lý lỗi

- **Server:** mọi lỗi dùng chung một dạng:
  ```json
  { "error": { "code": "VERSION_CONFLICT", "message": "The tree was updated by someone else" } }
  ```
  Mã lỗi được định nghĩa một lần trong `packages/shared/errors.ts` (`ERROR_CODES`) kèm HTTP status và mô tả; tài liệu mã lỗi được sinh từ đó. Các mã chính: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400, kèm `details`), `VERSION_CONFLICT` (409), `RULE_VIOLATION` (422, từ `applyOp`), `RATE_LIMITED` (429). Phần tài khoản thêm `INVALID_TOKEN` (400, token đặt lại mật khẩu hoặc token mời không tồn tại, đã dùng hoặc hết hạn), `INVALID_CREDENTIALS` (401, sai email hoặc mật khẩu) và `EMAIL_TAKEN` (409).
- **Client:** api client chuyển lỗi thành `ApiError { code, message }`, giao diện hiện câu tiếng Việt tương ứng với `code`. Mỗi feature được bọc trong một **Error Boundary**. Thao tác lỗi thì hiện toast. Mất mạng khi gửi op thì giữ trong `pending` và thử lại kiểu **exponential backoff** (1 s, 2 s, 4 s…); thanh công cụ hiện "Chưa lưu".
- **Render cold start (~30–60 giây):** lần tải đầu hiện màn hình "Đang khởi động máy chủ…" thay vì trang trắng.
- **Sentry** (gói Developer miễn phí: 5.000 lỗi/tháng, 1 người dùng, lưu 30 ngày; vượt hạn mức thì bỏ sự kiện, không tính tiền). Chỉ bật ở production.

### 13.2 Trạng thái tải & trống

Skeleton có hình dạng giống nội dung thật (không dùng vòng xoay chung chung ở các trang chính). Dòng họ trống → hướng dẫn bước đầu ("Thêm thuỷ tổ"). Danh sách giỗ trống → giải thích cần gì (ngày mất âm lịch).

### 13.3 Hướng thiết kế: "album gia đình" (chống AI-slop)

Giao diện không được trông như template SaaS do AI sinh ra. Đối tượng chính là các thành viên trẻ trong gia đình, nhưng người lớn tuổi vẫn phải đọc dễ, và giao diện phải hợp khi thêm nhắc sinh nhật sau này.

**Hướng đi:** một cuốn album gia đình bày trên giấy kẻ ô. Mỗi chi tiết trang trí đều mang thông tin:

| Chi tiết | Ý nghĩa |
|---|---|
| Ảnh polaroid | một người: ảnh (hoặc chữ cái đầu trên nền màu nhạt), chú thích viết tay và một dòng chữ nhỏ bên dưới |
| Màu băng dính washi (hoặc màu đinh ghim / nam châm, §13.4) | chi của người đó, lấy từ bảng màu Okabe–Ito an toàn cho người mù màu. Thuỷ tổ dán băng đỏ cam; dâu/rể dán băng xám trung tính |
| Sợi chỉ có ghim đỏ ở cuối | cha mẹ → con |
| Đường khâu chấm chấm có nút tròn | vợ chồng |
| Dòng dưới chú thích: "Giỗ 15/10 ÂL" | ngày giỗ (ngày âm lịch). Chữ mono màu `photo-muted`, không con dấu, không nghiêng, không màu đỏ, vì đây là ngày tưởng nhớ người đã khuất |
| Sticker vàng tròn có hình bánh kem vẽ nét | sinh nhật: icon Lucide `Cake` phía trên ngày dương ("21/11"); chữ cho trình đọc màn hình là "Sinh nhật 21/11" |
| Cột "Ảnh chưa dán" | người chưa nối với cây (§7.6) |

Dòng dưới chú thích hiện ngày giỗ với người đã mất có ngày mất âm lịch, và hiện năm sinh–mất ("1990–") với mọi người khác, nên mọi thẻ đầy đủ cao bằng nhau (thẻ cao thêm từ 124 px lên khoảng 138 px). Sticker sinh nhật vẫn dán ở góc ảnh.

Mỗi thẻ nghiêng nhẹ theo một góc tính từ id của người đó (±2,5°). Bảng trông như làm tay, nhưng một thẻ không bao giờ đổi góc nghiêng giữa các lần vẽ.

**Token màu** (sáng = "giấy kẻ ô ban ngày", tối = "bàn làm việc ban đêm"). Giấy ảnh polaroid luôn sáng ở cả hai giao diện.

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `paper` / `paper-grid` | #FAFAF8 / #ECECE7 | #14161C / #1E2129 | nền trang và nền bảng, ô kẻ 22 px |
| `surface` | #FFFFFF | #1C1F27 | panel, hộp thoại, ô nhập |
| `ink` / `ink-muted` | #1A1A1A / #5B5F66 | #ECEAE4 / #A4A9B3 | chữ |
| `line` / `line-strong` | #E2E2DC / #8A8F98 | #2C303A / #737882 | viền trang trí / viền của nút và ô nhập (≥ 3:1) |
| `stamp` / `on-stamp` | #D7263D / #FFFFFF | #FF5A6E / #14161C | ngày giỗ, thao tác xoá |
| `stamp-hover` | #B8202F | #FF7A8B | khi rê chuột lên thao tác xoá (giữ `on-stamp` đạt 4.5:1) |
| `accent` / `on-accent` | #2B59FF / #FFFFFF | #7C9CFF / #14161C | liên kết, viền focus, lựa chọn |
| `success` | #12805C | #3CCB91 | "máy chủ đang hoạt động" và các trạng thái ổn |
| `thread` / `pin` | #5B5F66 / #D7263D | #A4A9B3 / #FF5A6E | đường quan hệ |
| `photo`, `photo-ink`, `photo-muted` | #FFFFFF, #1A1A1A, #5B5F66 | #E9E6DD, mực giữ nguyên | giấy ảnh và chữ in trên ảnh (khung `classic`; các khung khác có giá trị riêng, §13.4) |
| `sticker` / `on-sticker` | #FFD23F / #1A1A1A | giữ nguyên | sticker sinh nhật |
| `tape-*` | thuỷ tổ #D55E00; các chi #E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #CC79A7; dâu/rể #B8BCC4; chưa dán #C9C9C2 | giữ nguyên | băng dính washi |

Các cặp chữ/nền đạt chuẩn WCAG AA (4,5:1), còn viền và đường nối đạt 3:1. Một unit test kiểm tra mọi cặp ở cả hai giao diện.

**Chữ:** cả ba phông đều tự host kèm bộ ký tự tiếng Việt.
- **Be Vietnam Pro**: chữ giao diện và tiêu đề (700, giãn chữ −0,02em).
- **Patrick Hand**: chỉ dùng cho chú thích trên ảnh và ghi chú viết tay, không bao giờ dùng cho nút hay chữ nội dung.
- **JetBrains Mono**: ngày tháng, dòng ngày giỗ và con số.

**Checklist chống AI-slop (S9):**
- ❌ Không gradient tím/chàm, không glassmorphism, không đốm sáng phát quang, không dùng emoji làm icon.
- ❌ Không dùng giao diện shadcn mặc định nguyên si: phải tuỳ biến token (màu, bo góc, khoảng cách, cỡ chữ, đổ bóng) trước, và bỏ bảng màu mặc định của Tailwind để chỉ dùng được token.
- ❌ Không landing page kiểu "hero + ba thẻ tính năng"; landing page hiển thị một cây gia phả thật (cây mẫu).
- ❌ Không để thẻ xám giống hệt nhau khắp nơi; thứ bậc thị giác đến từ chữ, khoảng cách và vài điểm nhấn có chủ đích.
- ❌ Không đổ bóng cho thẻ đang nằm yên; chỉ có độ nổi khi thẻ đang được nhấc lên (kéo).
- ❌ Không trang trí vô nghĩa: màu đồ giữ ảnh, sợi chỉ, đường khâu, dòng ngày giỗ và sticker luôn mang dữ liệu. Chủ đề (§13.4) đổi hình dáng của chi tiết, không bao giờ đổi ý nghĩa.
- ✅ Màu các chi lấy từ bảng màu Okabe–Ito an toàn cho người mù màu, không chọn màu ngẫu nhiên.
- ✅ Thiết kế cả giao diện sáng và tối (tối = "bàn làm việc ban đêm").
- ✅ Chuyển động ngắn và có mục đích (thẻ trôi về chỗ, bay tới, trượt panel); tôn trọng `prefers-reduced-motion`.
- ✅ Icon từ một bộ thống nhất (Lucide), nét dày 1,75.

Design token nằm ở `apps/web/src/shared/ui/tokens.css` (biến CSS được đưa vào Tailwind bằng `@theme`). Trang `/design` hiển thị mọi token và component ở cả hai giao diện.

### 13.4 Chủ đề cây (trang trí bảng)

Gia đình có thể tự trang trí bảng của mình, giống như chọn cuốn album và sticker. Chủ đề đổi hình dáng của các chi tiết album, không bao giờ đổi ý nghĩa của chúng (§13.3).

**Những gì chọn được.** Bộ mẫu đầu tiên cố ý ít; mẫu nào cũng phải có bản sáng và tối, đủ 3 mức LOD và qua bài test độ tương phản.

| Thành phần | Lựa chọn (bộ đầu tiên) | Cả cây | Một thẻ |
|---|---|:-:|:-:|
| Nền | `grid-paper` giấy kẻ ô (mặc định), `corkboard` bảng ghim gỗ bần, `fridge` cửa tủ lạnh | ✅ | ❌ |
| Khung ảnh polaroid | `classic` trắng (mặc định), `kraft` giấy kraft, `vintage` ảnh cũ viền răng cưa | ✅ | ✅ |
| Đồ giữ ảnh | `washi` băng dính (mặc định), `pushpin` đinh ghim, `magnet` nam châm | ✅ | ✅ |
| Sợi chỉ (cha mẹ → con) | `cotton` chỉ thường (mặc định), `yarn` sợi len | ✅ | ❌ |
| Đường khâu (vợ chồng) | `cotton` nét đứt (mặc định), `yarn` sợi len | ✅ | ❌ |

- Nền và kiểu đường nét thuộc về cả bảng: sợi chỉ hay đường khâu nối hai người, nên không thẻ nào sở hữu riêng.
- Chọn nền thì đồ giữ ảnh hợp với nền đó cũng được chọn theo (giấy kẻ ô → băng dính, bảng ghim → đinh ghim, tủ lạnh → nam châm). Sau đó vẫn đổi đồ giữ ảnh được.
- Ý nghĩa giữ nguyên ở mọi mẫu: màu đồ giữ ảnh là màu chi, sợi chỉ vẫn kết thúc bằng ghim, đường khâu vẫn có nút, ly hôn vẫn là đường khâu đứt.

**Hai phạm vi × hai chế độ.**

| | Cả cây | Một thẻ |
|---|---|---|
| **Cho cả họ** (Chủ họ/Biên tập) | `Clan.theme`, đổi bằng op `setTreeTheme` | `Person.cardStyle`, đổi bằng op `updatePerson` |
| **Chỉ mình tôi** (mọi thành viên) | `ViewPreference.theme` | `ViewPreference.cards[personId]` |

- Thay đổi cho cả họ là op bình thường: có trong lịch sử, hoàn tác và khôi phục được, và đi qua luồng 409 (§6).
- Lựa chọn "chỉ mình tôi" lưu theo tài khoản và dòng họ, nên đổi thiết bị vẫn còn. Chúng không phải op và không bao giờ hiện trong lịch sử của dòng họ. Vai trò Xem cũng dùng được, nên ai cũng trang trí được mà không cần quyền sửa.
- File xuất và link chia sẻ chỉ dùng các lớp của cả họ (§11).

**Lựa chọn nào thắng.** Với từng thành phần của một thẻ, lớp đầu tiên có giá trị được dùng:

1. Lựa chọn của tôi cho thẻ này (`ViewPreference.cards[personId]`, khi `enabled`)
2. Lựa chọn của cả họ cho thẻ này (`Person.cardStyle`)
3. Chủ đề cây của tôi (`ViewPreference.theme`, khi `enabled`)
4. Chủ đề cây của cả họ (`Clan.theme`)
5. Mặc định

Hai quy tắc giúp dễ đoán: **thẻ thắng cả cây**, và **của tôi thắng của cả họ**. Vì vậy đổi chủ đề của cả họ không bao giờ xoá cách trang trí riêng của một thẻ, và không bao giờ đè lên lựa chọn một thành viên đã chọn cho riêng mình. Nền, sợi chỉ và đường khâu chỉ xét bước 3–5. Bộ phân giải là hàm thuần trong `packages/shared` (`resolveCardStyle`, `resolveBoardStyle`) có unit test cho từng bước.

**Giao diện.**
- Nút **Trang trí** trên thanh công cụ của cây (§7.5) mở bảng bên phải (bottom sheet trên điện thoại), có công tắc **Áp dụng cho: Chỉ mình tôi / Cả họ** và mỗi thành phần một hàng ô xem trước nhỏ. Bấm vào một mẫu là bảng đổi ngay. "Cả họ" bị mờ với vai trò Xem, kèm một câu giải thích ngắn.
- **Trang trí thẻ này…** trong menu thẻ (§7.6) và trong panel hồ sơ mở một bảng nhỏ gồm hàng khung ảnh và đồ giữ ảnh, cùng công tắc đó, và nút **Dùng lại theo chủ đề cây** để bỏ lựa chọn riêng của thẻ.
- Khi đang có lựa chọn "chỉ mình tôi", một dải báo hiện "Bạn đang xem chủ đề riêng" kèm nút **Về chủ đề chung** (đặt `enabled: false` và giữ lại các lựa chọn). Chọn bất kỳ mẫu nào ở chế độ "Chỉ mình tôi" sẽ đặt lại `enabled: true`. Chủ họ và Biên tập thấy thêm nút **Dùng cho cả họ**, gửi op `setTreeTheme` với các lựa chọn cấp cây của họ; lựa chọn cấp thẻ vẫn là của riêng họ.
- Bảng hiện "Khác chủ đề cây" ở thẻ hoặc thành phần nào có lựa chọn riêng.

**API.**
- `GET /api/clans/:id/view-preference` và `PUT /api/clans/:id/view-preference` (mọi thành viên; chỉ tài liệu của chính người gọi). Body được Zod kiểm tra: chỉ nhận giá trị mẫu có sẵn, key `personId` phải là ObjectId, tối đa 5.000 mục thẻ (giới hạn số người của một dòng họ, §5).
- Thay đổi cho cả họ đi qua `POST /api/clans/:id/ops` như mọi chỉnh sửa khác.

**Hiển thị.**
- Lựa chọn cấp bảng là data attribute trên phần tử gốc của bảng (`data-surface`, `data-thread`, `data-stitch`); lựa chọn cấp thẻ là data attribute trên từng thẻ (`data-frame`, `data-fastener`). Mỗi mẫu là một bộ biến CSS trong `tokens.css`, nên đổi chủ đề không bao giờ chạy lại layout và không vẽ lại những thẻ có kiểu không đổi.
- Nền là họa tiết CSS/SVG lặp lại (không dùng ảnh chụp lớn), nên kéo và phóng to vẫn mượt, CSP giữ nguyên và nền nào cũng có bản tối.
- Đồ giữ ảnh chỉ vẽ ở mức LOD đầy đủ. Mức nhãn tên và dải băng giữ dải màu chi (§7.4).
- Mỗi khung có giá trị `photo`, `photo-ink` và `photo-muted` riêng, mỗi nền có giá trị `paper` và `thread` riêng. Unit test độ tương phản kiểm tra mọi khung và nền ở cả hai giao diện.

---

## 14. Tài liệu

| Đối tượng | Tài liệu | Vị trí / định dạng |
|---|---|---|
| Người dùng | **Hướng dẫn sử dụng**: bắt đầu, dựng cây, ngày tháng & âm lịch, giỗ & nhắc giỗ, cài app (Android/iOS), AI nhập liệu, liên kết cây, chia sẻ & riêng tư, câu hỏi thường gặp — có ảnh chụp màn hình | Trong app `/help` (tiếng Việt) + `docs/user-guide/` (tiếng Anh) |
| Developer | **README**: giới thiệu, GIF demo, sơ đồ kiến trúc, số liệu hiệu năng, cách chạy nhanh | `README.md` |
| Developer | **Kiến trúc**: các module, luồng dữ liệu, mô hình Operation, thuật toán layout (sơ đồ Mermaid) | `docs/architecture.md` |
| Developer | **Tài liệu API**: sinh từ schema Zod (`@asteasolutions/zod-to-openapi`) thành OpenAPI 3.1, xem tại `/api/docs` (Scalar; chỉ bật ngoài production, đặt `API_DOCS=on` để bật ở production) | Tự sinh; CI báo lỗi nếu route Express nào chưa có trong tài liệu |
| Developer | **Mã lỗi**: mã, HTTP status, ý nghĩa, cách client xử lý | `docs/error-codes.md`, sinh từ `ERROR_CODES` |
| Developer | **ADR**: mỗi quyết định lớn một file ngắn (monorepo, Operation log, React Flow + layout tự viết, thuật toán âm lịch UTC+7, cron nhiều lớp, proxy Netlify, liên kết cây) | `docs/adr/0001-*.md` |
| Developer | **Đóng góp**: cài đặt, script, quy ước (chỉ tiếng Anh trong code, kiểu commit, thư mục theo feature), test | `CONTRIBUTING.md` |
| Developer | **Biến môi trường**: mọi biến kèm mô tả | Các file `.env.example` + `docs/configuration.md` |
| Mọi người | **Tài liệu thiết kế song ngữ** | `docs/superpowers/specs/*-design.md` (Anh) + `*-design.vi.md` (Việt) |

---

## 15. Kiểm thử

| Loại | Công cụ | Nội dung chính |
|---|---|---|
| Unit | Vitest | `applyOp` cho từng loại op, từng luật nghiệp vụ và tính đúng của inverse (`applyOp(applyOp(t, op), op.inverse) ≡ t`); lunar: golden + property-based (`fast-check`) + differential; `anniversaryFor` cho mọi dòng của §9.2; layout (không chồng lấn, con nằm dưới cha mẹ); `classifyLineage`; dò người trùng; `resolveCardStyle` / `resolveBoardStyle` cho mọi lớp của §13.4; độ tương phản của mọi khung và nền ở cả hai giao diện |
| Component | Vitest + Testing Library | `DualDateInput`, màn hình xem trước nhập liệu, panel hồ sơ, trạng thái nút undo/redo, popover liên kết cây (3 trạng thái) |
| Integration | Supertest + `mongodb-memory-server` (chế độ replica set để có transaction) | Ghi op, 409 khi sai version, quyền viewer/editor, link chia sẻ ẩn người còn sống, quyền xem trước/mở liên kết cây, chặn dòng họ nguồn, job nhắc chạy hai lần chỉ gửi một, bắt kịp sau ngày bị lỡ, độ phủ route OpenAPI, Viewer lưu được `ViewPreference` của mình nhưng bị 403 với `setTreeTheme`, link chia sẻ không bao giờ chứa `ViewPreference` của ai |
| E2E | Playwright | Đăng ký → tạo dòng họ → thêm 3 đời → nhập ngày mất → thấy giỗ sắp tới → hoàn tác bằng nút trên thanh công cụ → xuất PNG; hai tab cùng sửa → bên sau tự rebase; nối một người với link chia sẻ của dòng họ khác → di chuột thấy xem trước → bấm mở cây đích đúng người → breadcrumb quay lại; link bị thu hồi hiện trạng thái "Không khả dụng"; offline: tải lại khi mất mạng vẫn thấy cây (chỉ đọc) |
| Hiệu năng | Script seed + React Profiler | S1, S2 với 1.000 và 2.000 người |
| Hình ảnh | Ảnh chụp Playwright (sáng/tối, điện thoại/máy tính) | Rà soát theo §13.3; mỗi nền và mỗi khung một ảnh chụp (§13.4) |

**CI (GitHub Actions)** mỗi lần push/PR: `lint` → `typecheck` → `test` (kèm coverage) → `build` → kiểm tra route OpenAPI. Deploy chỉ chạy khi merge vào `main`.

---

## 16. Deploy & chi phí (mục tiêu 0đ)

| Thành phần | Dịch vụ (gói miễn phí) | Ghi chú |
|---|---|---|
| Web | **Netlify** | Tài khoản tạo từ 04/09/2025 có 300 credit/tháng; mỗi lần deploy production tốn 15 (~20 lần/tháng) → **chỉ deploy khi merge `main`, tắt deploy preview**. Hết credit thì site tạm dừng tới tháng sau. Dự phòng: Cloudflare Pages |
| API | Render | Ngủ sau 15 phút không dùng → có màn hình chờ khởi động |
| Database | MongoDB Atlas M0 | 512 MB, có transaction |
| Ảnh | Cloudinary | Gói miễn phí: 25 credit/tháng (tính chung dung lượng, băng thông và biến đổi ảnh); một cloud, dev và prod tách bằng thư mục (§12) |
| Email | Resend | 3.000 email/tháng. Khi chưa xác minh tên miền, Resend chỉ gửi tới địa chỉ email của chủ tài khoản Resend, nên cho tới lúc xác minh tên miền, API production chưa thể gửi email cho người dùng khác; khi đã xác minh, đặt `MAIL_FROM` là một địa chỉ thuộc tên miền đó |
| Push | Web Push (VAPID) | Miễn phí |
| Cron chính | Cloudflare Workers Cron Trigger | Free: 5 trigger/tài khoản, tối đa 15 phút mỗi lần chạy |
| Cron dự phòng | cron-job.org | Timeout 30 giây, cảnh báo qua email, không tự thử lại |
| Theo dõi lỗi | Sentry Developer | |

Biến môi trường được mô tả trong `apps/*/.env.example` (không chứa giá trị thật).

---

## 17. Lộ trình 8 tuần (tổng quan)

> Kế hoạch triển khai từng bước sẽ là một tài liệu riêng sau khi spec này được duyệt.

| Tuần | Mục tiêu | Kết quả demo được |
|---|---|---|
| 1 | Monorepo, CI, **design system & token (§13.3)**, cài i18n, auth (email + Google), Clan, Membership, Invite, pipeline OpenAPI | Đăng nhập, tạo dòng họ, mời người khác; bản sắc giao diện đã định hình |
| 2 | `packages/shared`: schema Zod, `applyOp` + test; API ops (transaction, version, 409); Zustand store; cây hiển thị với layout đơn giản | Thêm người, thấy trên cây, tải lại vẫn còn |
| 3 | Panel hồ sơ, `DualDateInput`, thuật toán âm lịch + golden/property test, `computeGenerations`, `classifyLineage`, hiển thị dâu/rể | Nhập ngày âm/dương; thấy số đời và dâu/rể |
| 4 | Layout worker, **thanh công cụ undo/redo + phím tắt**, trang lịch sử, rebase khi 409 → **deploy MVP** | MVP online; gia đình bắt đầu nhập liệu |
| 5 | **Chủ đề cây (§13.4)**, sau đó ⭐ hiệu năng: seed 2.000 người, LOD, memo, thu gọn, tìm kiếm, minimap, tuỳ chọn xem dâu/rể, đo đạc (đã có chủ đề) | Bảng được trang trí; số liệu trước/sau cho CV |
| 6 | Trang giỗ sắp tới + ghi chú, `anniversaryFor` + differential test, job idempotent có bắt kịp, email, **PWA (cài đặt, xem offline, push cả iOS)**, cron worker | Nhận email/push nhắc giỗ thật; app cài được |
| 7 | AI nhập liệu (prompt, kiểm tra, xem trước, batch); xuất PNG/PDF; link chia sẻ; **liên kết cây (§8.1)** | Nhập một trang sổ thật; từ một người dâu/rể nhảy sang cây của họ bên ấy |
| 8 | E2E, accessibility, Lighthouse, Sentry, **tài liệu (hướng dẫn sử dụng, kiến trúc, ADR, mã lỗi)**, README có GIF demo, mời người dùng thật | Bản hoàn chỉnh để đưa vào CV |

---

## 18. Rủi ro & cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Layout tự viết tốn nhiều thời gian hơn dự kiến | Tuần 2 dùng layout đơn giản trước; tuần 4 thay thế. Tệ nhất: dùng ELK (`elkjs`) trong worker |
| Phình phạm vi ("làm tất cả") | Danh sách giai đoạn 2 rõ ràng; tính năng mới vào đó, trừ khi thay thế một mục trong phạm vi |
| Hết credit Netlify | Chỉ deploy từ `main`; dự phòng Cloudflare Pages |
| Render cold start làm người dùng khó chịu | Màn hình chờ; các lần gọi cron giữ server thức vào buổi sáng |
| Gia đình không đồng ý với cách tính giỗ đặc biệt | Ghi chú giải thích mọi luật; `source` giữ dữ liệu gốc người dùng nhập |
| iOS chỉ nhận push khi PWA đã được cài | Hiện hướng dẫn cài đúng lúc bật push trên iOS |
| Liên kết cây làm lộ dữ liệu ngoài ý muốn | Server kiểm tra quyền mỗi lần xem trước/mở; qua link chia sẻ thì lọc như cây công khai; Chủ họ đích thấy và chặn được liên kết trỏ tới |

---

## 19. Thuật ngữ

| Thuật ngữ | Giải thích dễ hiểu | Dùng ở đâu |
|---|---|---|
| **PWA (Progressive Web App)** | Website cài được như app (icon ngoài màn hình chính, toàn màn hình, chạy offline, nhận thông báo) mà không cần kho ứng dụng | §7.7 |
| **Service worker** | Script chạy nền mà trình duyệt chạy cho trang web; lưu cache file và nhận thông báo đẩy | PWA |
| **Monorepo** | Một repo Git chứa nhiều project (web, api, shared) dùng chung code | Kiến trúc |
| **Operation (op)** | Một dòng trong sổ nhật ký thay đổi: ai, làm gì, chi tiết, và cách hoàn tác | §6 |
| **Transaction** | Nhóm nhiều thao tác ghi DB "làm hết hoặc không làm gì", giống chuyển khoản ngân hàng | Ghi op |
| **Version / baseVersion** | Số phiên bản cây; client báo "tôi đang sửa trên bản X" để phát hiện xung đột | §6.2 |
| **409 Conflict** | Mã HTTP nghĩa là "thay đổi của bạn dựa trên phiên bản cũ" | §6.3 |
| **Rebase** | Đặt lại thay đổi của mình lên phiên bản mới nhất (mượn từ Git) | §6.3 |
| **Pure function (hàm thuần)** | Cùng đầu vào luôn ra cùng kết quả; không gọi API/DB; không sửa gì bên ngoài | `applyOp`, lunar |
| **Reducer** | Hàm thuần `(state cũ, hành động) → state mới`, như `useReducer`/Redux | `applyOp` |
| **Immutable** | Không sửa object cũ mà tạo bản mới, nhờ đó React biết cái gì đã đổi | `applyOp`, store |
| **Optimistic update** | Cập nhật màn hình ngay, không chờ server; lỗi thì hoàn lại (như bấm ❤️ trên Facebook) | §6.2 |
| **TanStack Query** | Thư viện lấy dữ liệu có cache, tự tải lại, có sẵn trạng thái loading/error | §7.3 |
| **Zustand** | Kho state toàn cục nhỏ gọn, đơn giản hơn Redux | Cây đang sửa |
| **Selector** | Hàm chọn đúng một phần của store, để component chỉ vẽ lại khi phần đó đổi | §7.3 |
| **React.memo** | Bảo React không vẽ lại component khi props không đổi | PersonNode |
| **Web Worker** | Luồng JavaScript chạy nền; tính toán nặng ở đó không làm đơ giao diện | Layout cây |
| **LOD (Level of Detail)** | Zoom xa thì vẽ đơn giản, zoom gần mới vẽ đầy đủ | §7.4 |
| **Prefetch** | Tải dữ liệu sẵn ở nền trước khi người dùng cần (VD khi di chuột), để màn hình sau mở tức thì | Liên kết cây |
| **Breadcrumb** | Dải đường dẫn "bạn đang ở đây", mỗi mục bấm được để quay lại | Liên kết cây |
| **Popover** | Khung nổi nhỏ gắn với một phần tử, hiện khi di chuột/chạm | Xem trước liên kết cây |
| **Zod schema** | Mô tả dữ liệu hợp lệ trông thế nào, dùng để kiểm tra tự động | Form, API, JSON từ AI |
| **OpenAPI** | Chuẩn mô tả API HTTP mà máy đọc được; công cụ hiển thị nó thành tài liệu tương tác | Tài liệu API |
| **ADR** | Architecture Decision Record: ghi chú ngắn về một quyết định quan trọng, các phương án và lý do chọn | `docs/adr/` |
| **i18n** | Quốc tế hoá: chữ giao diện nằm trong file theo từng ngôn ngữ, tra theo key | Giao diện tiếng Việt |
| **Middleware** | Các trạm kiểm tra request đi qua lần lượt trước khi tới code xử lý | API |
| **JWT** | "Vé" đã ký, chứng minh bạn là ai | Đăng nhập |
| **Cookie httpOnly** | Cookie mà JavaScript trên trang không đọc được, nên mã độc chèn vào (XSS) không lấy cắp được | Đăng nhập |
| **Cookie bên thứ ba** | Cookie của tên miền khác với trang đang mở; trình duyệt ngày càng chặn | Lý do có proxy `/api` |
| **Proxy** | Trung gian chuyển tiếp request, để trình duyệt chỉ thấy một tên miền | Netlify `_redirects` |
| **Rate limit** | Giới hạn số request trong một khoảng thời gian, chống spam và dò mật khẩu | API |
| **Cron job** | Việc được lên lịch chạy định kỳ | Nhắc giỗ |
| **Idempotent** | Chạy một lần hay mười lần kết quả như nhau | Job nhắc giỗ |
| **Unique index** | Luật DB cấm hai bản ghi trùng cùng bộ giá trị; được đảm bảo kể cả khi ghi đồng thời | ReminderLog |
| **E11000** | Mã lỗi trùng khoá của MongoDB | Job nhắc giỗ |
| **Race condition** | Hai tiến trình chạy gần như cùng lúc, cùng "kiểm tra rồi làm", nên cùng làm | Lý do "ký sổ trước, gửi sau" |
| **Web Push / VAPID** | Thông báo hiện cả khi đã đóng web; khoá VAPID chứng minh thông báo đến từ server của mình | Nhắc giỗ |
| **Snapshot** | Bản chụp đầy đủ dữ liệu tại một thời điểm, dùng để khôi phục | Inverse của `deletePerson` |
| **Error Boundary** | Component React bắt lỗi của phần con, chỉ khu vực đó báo lỗi | Client |
| **Exponential backoff** | Thử lại sau 1 s, 2 s, 4 s… để không dồn dập server | Gửi op khi mất mạng |
| **Cold start** | Server miễn phí "ngủ" khi không ai dùng; request đầu phải chờ nó khởi động | Render |
| **Property-based testing** | Thay vì vài ví dụ chọn tay, sinh hàng nghìn đầu vào ngẫu nhiên và kiểm tra các luật luôn phải đúng | Test âm lịch |
| **Differential testing** | Chạy hai bản cài đặt độc lập trên cùng đầu vào rồi so kết quả | Test âm lịch với astronomy-engine |
| **Ephemeris** | Mô hình/bảng thiên văn độ chính xác cao cho biết vị trí mặt trời, mặt trăng ở mọi thời điểm | `astronomy-engine` |
| **Coverage** | Tỉ lệ dòng code được test chạy qua | CI |
| **CI** | Dịch vụ tự chạy lint/test/build mỗi lần push | GitHub Actions |
| **E2E test** | Test mà script điều khiển trình duyệt thật như người dùng | Playwright |
| **Design token** | Các giá trị thiết kế có tên (màu, khoảng cách, bo góc, font) định nghĩa một lần, dùng lại khắp nơi | §13.3 |
| **OKLCH** | Không gian màu mà bước số bằng nhau thì mắt thấy khác biệt bằng nhau; tốt để dựng bảng màu cân đối | Màu các chi |
| **GEDCOM** | Định dạng file chuẩn để trao đổi dữ liệu gia phả | Giai đoạn 2 |
| **Thuỷ tổ (progenitor)** | Tổ tiên khai sáng dòng họ, đời 1 | `Clan.progenitorId` |
| **Dâu/rể (in-law)** | Người kết hôn với người trong họ | §8 |
| **Giỗ đầu / giỗ hết** | Giỗ năm âm lịch thứ 1 / thứ 2 sau khi mất | §9.2 |

---

## 20. Các quyết định đã chốt

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Thời gian | 10–15 giờ/tuần × 8 tuần | |
| Đối tượng | Nền tảng nhiều dòng họ, có phân quyền | Đẹp CV hơn; gia đình là người dùng đầu tiên |
| Tính năng nổi bật | Cây lớn mượt + lịch sử sửa | Thuần React/hiệu năng, rủi ro thấp |
| Real-time | Giai đoạn 2, mô hình Operation sẵn từ đầu | Thêm sau không phải viết lại |
| Kiến trúc | Monorepo MERN + `packages/shared` | Tận dụng nền MERN; dùng chung schema và `applyOp` |
| Vẽ cây | React Flow + layout tự viết trong Web Worker | Có sẵn pan/zoom/chỉ vẽ phần nhìn thấy; layout là câu chuyện kỹ thuật |
| Dâu/rể | Đặt cạnh vợ/chồng, không mở rộng lên trên; cài đặt số đời con cháu của con gái | Giữ layout O(n) và dễ đọc; tôn trọng truyền thống nhưng linh hoạt |
| Gia đình khác | Liên kết cây: dấu hiệu + xem trước khi di chuột, bấm mở cây được chia sẻ, có breadcrumb quay lại | Nối các gia đình mà không gộp dữ liệu; mỗi dòng họ tự quản cây của mình |
| Âm lịch | Thuật toán Hồ Ngọc Đức, UTC+7, sau interface `LunarCalendar` | Đúng lịch Việt Nam; không giới hạn năm; thay được |
| AI nhập liệu | Người dùng tự chạy AI chat của họ rồi dán JSON | Miễn phí, không lưu API key, an toàn |
| Di động | PWA thay cho app native | Không cần tài khoản kho ứng dụng; cài được + có push |
| Ngôn ngữ | Tiếng Anh trong repo; giao diện tiếng Việt qua i18n; tài liệu thiết kế song ngữ | Codebase chuyên nghiệp; người dùng thật là người Việt |
| Host web | Netlify | Đã quen; cho phép thương mại; chỉ deploy từ `main` |
| Kích hoạt nhắc giỗ | Cloudflare Worker Cron + cron-job.org dự phòng + Sentry giám sát + bắt kịp | Không phụ thuộc commit; chịu được cold start; ngày lỡ được gửi trễ chứ không mất |
| Tài liệu | Hướng dẫn sử dụng + OpenAPI tự sinh + mã lỗi tự sinh + ADR | Đo được (S8); thể hiện sự chuyên nghiệp |
| Hướng thiết kế | "Album gia đình" trên giấy kẻ ô: ảnh polaroid, màu băng dính = chi, sợi chỉ, dòng ngày giỗ và sticker (§13.3) | Hợp với người trẻ, có chỗ cho nhắc sinh nhật; mọi chi tiết trang trí đều mang thông tin |
| Sửa quan hệ | Kéo thả trên bảng, có cắt chỉ, câu hỏi tiếp theo và hoàn tác; menu bàn phím để thay thế (§7.6) | Sửa nhầm trực tiếp, không bao giờ vào ngõ cụt |
| Dấu ngày | Ngày giỗ là một dòng chữ trang nghiêm dưới chú thích ("Giỗ 15/10 ÂL"); sinh nhật là sticker có hình bánh kem vẽ nét (§13.3) | Con dấu đỏ đóng nghiêng trông như "đã duyệt"/"quá hạn", không hợp với ngày tưởng nhớ người đã khuất; chữ "SN" khó hiểu |
| Chủ đề cây | Các mẫu chọn sẵn cho từng thành phần; cả cây hoặc một thẻ; cho cả họ hoặc chỉ mình tôi; thẻ thắng cả cây, của tôi thắng của cả họ (§13.4) | Gia đình tự trang trí mà không mất ý nghĩa, độ tương phản hay tốc độ; trang trí của ai không bị người khác xoá mất |
| Lưu trữ ảnh | Một cloud Cloudinary, `ancestors-tree/<env>/clans/<clanId>/people/<personId>/<ngẫu nhiên>`, API ký và kiểm tra mọi lần upload (§12) | Xoá dòng họ hay một người theo tiền tố; URL không lộ tên; dev và prod tách nhau mà không cần tài khoản thứ hai |
| Phiên đăng nhập | Cookie httpOnly: JWT 15 phút cộng refresh token ngẫu nhiên xoay vòng mỗi lần dùng (§12; ADR 0005) | Script không đọc được token (chống XSS); kiểm tra không cần tra database; vẫn thu hồi được phiên |
| Đăng nhập Google | Chuyển hướng toàn trang (authorization code + PKCE), không nạp script của Google vào trang | CSP giữ nguyên; chạy được trên iOS không cần popup |
| Gửi email | Resend sau một interface `Mailer` (ghi log khi phát triển, lưu trong bộ nhớ khi test) | Đổi nhà cung cấp mà không sửa nơi gọi; chạy được cả khi chưa có key |
