"""QRコードの掲示用シート（A4）の PDF を作る（教師用PCで実行・手順書 10章）

使い方:
  node tools/make_qr_sheets.ts     （先に材料を作る）
  python tools/make_qr_pdf.py      → local/qr/qr-sheets.pdf

1枚を上下に分ける:
  上（掲示する部分）    … 来校者向けの見出しと大きなQR
  下（切り取って保管）  … 貼る場所・貼る向き・周りの地図（アプリと同じく180度回した向き）
"""
import json
import math
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
QR_DIR = ROOT / "local" / "qr"
FONT = "bizud"  # BIZ UDゴシック（Windows 標準。読みやすい UD フォント）
FONT_FILE = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_OBJ = fitz.Font(fontfile=FONT_FILE)

W, H = fitz.paper_size("a4")  # 595 x 842 pt
MM = 72 / 25.4
CUT_Y = 520  # 切り取り線の高さ

RED = (0.85, 0.28, 0.06)
GREEN = (0.12, 0.42, 0.23)
GRAY = (0.45, 0.45, 0.45)
BLUE = (0.11, 0.49, 0.84)


def tlen(s, size):
    return FONT_OBJ.text_length(s, fontsize=size)


def put(page, pos, s, size, color=(0, 0, 0)):
    page.insert_text(pos, s, fontname=FONT, fontfile=FONT_FILE, fontsize=size, color=color)


def text_center(page, y, s, size, color=(0, 0, 0)):
    put(page, ((W - tlen(s, size)) / 2, y), s, size, color)


def arrow(page, a, b, color, width=2.5, head=9):
    page.draw_line(a, b, color=color, width=width)
    ang = math.atan2(b.y - a.y, b.x - a.x)
    for d in (2.6, -2.6):
        p = fitz.Point(b.x - head * math.cos(ang + d / 6), b.y - head * math.sin(ang + d / 6))
        page.draw_line(b, p, color=color, width=width)


def draw_map(page, sheet, rect, radius):
    """アプリと同じ向き（配置図を180度回す）で、周りの棟・歩いてくる道・貼る位置・QRの面の向きを描く
    別の1ページに描いてから枠にはめ込むので、枠の外にはみ出さない"""
    mdoc = fitz.open()
    mp = mdoc.new_page(width=rect.width, height=rect.height)
    cx, cy = sheet["pos"]["x"], sheet["pos"]["y"]
    scale = rect.width / (2 * radius)

    def to_page(p):
        # 180度回す: (x, y) → (-(x-cx), -(y-cy))
        return fitz.Point(rect.width / 2 - (p["x"] - cx) * scale, rect.height / 2 - (p["y"] - cy) * scale)

    box = fitz.Rect(0, 0, rect.width, rect.height)
    shape = mp.new_shape()
    for b in sheet["buildings"]:
        pts = [to_page(p) for p in b["outline"]]
        shape.draw_polyline(pts + [pts[0]])
        shape.finish(color=GRAY, fill=(0.9, 0.9, 0.88), width=0.6)
    shape.commit()
    for b in sheet["buildings"]:
        xs = [p["x"] for p in b["outline"]]
        ys = [p["y"] for p in b["outline"]]
        c = to_page({"x": sum(xs) / len(xs), "y": sum(ys) / len(ys)})
        if box.contains(c):
            put(mp, (c.x - 4, c.y + 3), b["id"], 8, GRAY)

    here = to_page(sheet["pos"])
    if sheet.get("path") and len(sheet["path"]) > 1:
        # 歩いてくる道（約30m手前から）を青い線で描き、この地点に矢印で入ってくる
        pts = [to_page(p) for p in reversed(sheet["path"])]
        for a, b in zip(pts, pts[1:-1] + [pts[-1]]):
            if a != b:
                mp.draw_line(a, b, color=BLUE, width=3)
        arrow(mp, pts[-2], here, BLUE, width=3, head=10)
        far = pts[0]
        label = "歩いてくる道（QRの面をこちらへ向ける）"
        lx = min(max(4, far.x - tlen(label, 8) / 2), rect.width - tlen(label, 8) - 4)
        ly = far.y + 14 if far.y < rect.height - 30 else far.y - 8
        put(mp, (lx, ly), label, 8, BLUE)
    mp.draw_circle(here, 7, color=(1, 1, 1), fill=RED, width=1.5)
    put(mp, (here.x + 10, here.y + 4), "ここに貼る", 9, RED)
    put(mp, (4, rect.height - 5), "地図はアプリと同じ向き（正門が下）・枠は約90m四方", 7, GRAY)

    page.show_pdf_page(rect, mdoc, 0)
    page.draw_rect(rect, color=GRAY, width=0.8)


def main() -> None:
    meta = json.loads((QR_DIR / "sheets.json").read_text(encoding="utf-8"))
    doc = fitz.open()
    for s in meta["sheets"]:
        page = doc.new_page(width=W, height=H)

        # ---- 上: 掲示する部分 ----
        text_center(page, 58, "宮崎県立延岡工業高等学校", 13, GRAY)
        text_center(page, 92, "校内案内", 30, GREEN)
        qr = fitz.Rect((W - 300) / 2, 110, (W + 300) / 2, 410)
        page.insert_image(qr, filename=str(QR_DIR / f"{s['id']}.png"))
        text_center(page, 440, "スマートフォンのカメラで読み取ってください", 15)
        text_center(page, 464, "ここから目的の部屋までの道順を案内します", 12, GRAY)
        put(page, (W - 90, 500), s["id"], 11, GRAY)

        # ---- 切り取り線 ----
        x = 30
        while x < W - 30:
            page.draw_line((x, CUT_Y), (min(x + 8, W - 30), CUT_Y), color=GRAY, width=0.8)
            x += 14
        put(page, (34, CUT_Y - 4), "ここで切り取り、上を掲示する。下は掲示の記録として保管", 8, GRAY)

        # ---- 下: 貼り方の説明 ----
        y = CUT_Y + 26
        put(page, (40, y), f"{s['id']}　掲示の説明", 14)
        lines = [
            f"場所: {s['place']}",
            f"ノード: {s['landmark'] or '（目印なし）'}・{s['floor']}階",
            f"貼る向き: 地図の青い道（歩いてくる方）へQRの面を向ける（掲示面の向き {s['facing']:.0f}度）",
            "　　　　　（＝事務室の方から歩いてきた人が、正面から読める向き）",
            f"この地点を通る目的地: {'・'.join(s['via']) if s['via'] else '—'}",
            f"QRの中身: {s['url']}",
        ]
        if s["id"] == "CP01":
            lines.insert(3, "　　　　　※CP01の向きは仮（事務室と相談して決める）。決まったら管理コンソールで直す")
        ly = y + 22
        text_w = W - 40 - 85 * MM - 40 - 14  # 地図の左までの幅
        for line in lines:
            # 長い行は折り返す
            while tlen(line, 9) > text_w:
                cut = len(line)
                while tlen(line[:cut], 9) > text_w:
                    cut -= 1
                put(page, (40, ly), line[:cut], 9)
                line = "　　" + line[cut:]
                ly += 13
            put(page, (40, ly), line, 9)
            ly += 13
        for note in ["貼るとき: 目の高さ（床から約1.3m）", "雨の当たらない所に、ラミネートして貼る"]:
            ly += 4
            put(page, (40, ly + 6), note, 8, GRAY)
            ly += 10
        draw_map(page, s, fitz.Rect(W - 40 - 85 * MM, CUT_Y + 14, W - 40, CUT_Y + 14 + 85 * MM), meta["radius"])

    out = QR_DIR / "qr-sheets.pdf"
    doc.save(out)
    print(f"{out} を作りました（{len(meta['sheets'])}枚）")


if __name__ == "__main__":
    main()
