"""配置図（図面1ページ目）から棟の外形（長方形）を取り出す（手順書 3.2〜3.3・設計書 4.3）

使い方:
  python tools/extract_outlines.py          候補の長方形を抽出し、番号つきのプレビュー画像を作る
  python tools/extract_outlines.py --apply  tools/building_map.json の対応表から D1 用の SQL を作る

出力（drawings/ はgitに入らない）:
  drawings/outlines_preview.png  配置図の上に候補の長方形と番号を描いた画像
  drawings/outlines_draft.json   候補の長方形（全体座標・メートル）
  drawings/buildings.sql         --apply のとき。D1 の buildings テーブルに入れる SQL

座標: 配置図を画面に表示した向き。x は右、y は下が正、単位メートル（設計書 4.1）
"""
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "29_R7延岡工業_図面.pdf"
OUT = ROOT / "drawings"
MAP_FILE = ROOT / "tools" / "building_map.json"

PT_TO_M = 25.4 / 72 * 1600 / 1000  # 1pt を 1/1600 の実寸（m）に直す = 0.56444
TOL = 0.6  # 線の端点のずれの許容（pt）
MIN_SIZE_M = 2.0  # これより小さい長方形は無視（記号など）
MAX_SIZE_M = 120.0  # これより大きい長方形は図枠・表なので無視


def axis_segments(page: fitz.Page):
    """ページ上の線分を「表示した向き」の座標に直し、水平線と垂直線に分ける"""
    m = page.rotation_matrix
    horizontal, vertical = [], []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                a, b = item[1] * m, item[2] * m
                points = [(a.x, a.y), (b.x, b.y)]
            elif item[0] == "re":  # 長方形として描かれたもの
                r = item[1] * m
                points = None
                horizontal += [(r.x0, r.x1, r.y0), (r.x0, r.x1, r.y1)]
                vertical += [(r.y0, r.y1, r.x0), (r.y0, r.y1, r.x1)]
            else:
                continue
            if points is None:
                continue
            (x0, y0), (x1, y1) = points
            if abs(y0 - y1) < 0.2 and abs(x0 - x1) > 2:
                horizontal.append((min(x0, x1), max(x0, x1), (y0 + y1) / 2))
            elif abs(x0 - x1) < 0.2 and abs(y0 - y1) > 2:
                vertical.append((min(y0, y1), max(y0, y1), (x0 + x1) / 2))
    return horizontal, vertical


def find_rectangles(horizontal, vertical):
    """4辺がそろっていて、中を横切る線のない長方形（＝最小の長方形）を探す"""

    def has_v(x, ya, yb):
        return any(abs(v[2] - x) < TOL and v[0] <= ya + TOL and v[1] >= yb - TOL for v in vertical)

    def has_h(y, xa, xb):
        return any(abs(h[2] - y) < TOL and h[0] <= xa + TOL and h[1] >= xb - TOL for h in horizontal)

    found = set()
    for top in horizontal:
        for bottom in horizontal:
            if bottom[2] - top[2] < 3:
                continue
            # 左右の端が同じ位置にある上辺と下辺の組
            if abs(top[0] - bottom[0]) > TOL or abs(top[1] - bottom[1]) > TOL:
                continue
            x0, x1, y0, y1 = top[0], top[1], top[2], bottom[2]
            if not (has_v(x0, y0, y1) and has_v(x1, y0, y1)):
                continue
            # 中を端から端まで横切る線があれば、それは小さい長方形の集まり
            if any(y0 + TOL < h[2] < y1 - TOL and h[0] <= x0 + TOL and h[1] >= x1 - TOL for h in horizontal):
                continue
            if any(x0 + TOL < v[2] < x1 - TOL and v[0] <= y0 + TOL and v[1] >= y1 - TOL for v in vertical):
                continue
            found.add((round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)))

    rects = []
    for x0, y0, x1, y1 in sorted(found, key=lambda r: (r[1], r[0])):
        w, h = (x1 - x0) * PT_TO_M, (y1 - y0) * PT_TO_M
        if MIN_SIZE_M <= w <= MAX_SIZE_M and MIN_SIZE_M <= h <= MAX_SIZE_M:
            rects.append({"pt": [x0, y0, x1, y1], "width_m": round(w, 2), "height_m": round(h, 2)})
    for i, r in enumerate(rects, start=1):
        r["no"] = i
        x0, y0, x1, y1 = (v * PT_TO_M for v in r["pt"])
        r["outline"] = [
            {"x": round(x0, 2), "y": round(y0, 2)},
            {"x": round(x1, 2), "y": round(y0, 2)},
            {"x": round(x1, 2), "y": round(y1, 2)},
            {"x": round(x0, 2), "y": round(y1, 2)},
        ]
    return rects


def draw_preview(page: fitz.Page, rects) -> None:
    """配置図の画像に、候補の長方形と番号を赤で描く"""
    dpi = 250
    scale = dpi / 72
    pix = page.get_pixmap(dpi=dpi)
    # 画像を新しいPDFページに貼り、その上に描いてから画像に戻す
    out = fitz.open()
    p = out.new_page(width=pix.width, height=pix.height)
    p.insert_image(p.rect, pixmap=pix)
    for r in rects:
        x0, y0, x1, y1 = (v * scale for v in r["pt"])
        p.draw_rect(fitz.Rect(x0, y0, x1, y1), color=(1, 0, 0), width=2)
        p.insert_text((x0 + 3, y0 + 18), str(r["no"]), fontsize=18, color=(1, 0, 0))
    p.get_pixmap(dpi=72).save(OUT / "outlines_preview.png")


def apply_map(rects) -> None:
    """building_map.json（候補の番号 → 棟）から buildings テーブル用の SQL を作る"""
    mapping = json.loads(MAP_FILE.read_text(encoding="utf-8"))
    by_no = {r["no"]: r for r in rects}
    buildings: list[dict] = []
    for no, info in mapping.items():
        if no.startswith("_"):
            continue  # "_説明" などのメモ用キー
        buildings.append({**info, "outline": by_no[int(no)]["outline"]})
    # 自動抽出できなかった多角形の棟（配置図の座標 pt で書いたもの）
    for info in mapping.get("_manual", []):
        outline = [{"x": round(x * PT_TO_M, 2), "y": round(y * PT_TO_M, 2)} for x, y in info["outlinePt"]]
        buildings.append({**info, "outline": outline})

    def q(s):
        return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"

    def num(v):
        return "NULL" if v is None else str(round(v, 2))

    ids = [b["id"] for b in buildings]
    if len(ids) != len(set(ids)):
        sys.exit(f"棟番号が重複しています: {sorted(i for i in ids if ids.count(i) > 1)}")

    lines = ["-- extract_outlines.py --apply で生成。手で直さず building_map.json を直して作り直すこと"]
    for b in buildings:
        origin = b.get("originPt")
        ox = origin[0] * PT_TO_M if origin else None
        oy = origin[1] * PT_TO_M if origin else None
        lines.append(
            "INSERT OR REPLACE INTO buildings"
            " (id, name, drawing_name, floors, outline, origin_x, origin_y, rotation, updated_by) VALUES ("
            f"{q(b['id'])}, {q(b['name'])}, {q(b.get('drawingName', b['name']))}, {int(b['floors'])}, "
            f"{q(json.dumps(b['outline'], ensure_ascii=False))}, {num(ox)}, {num(oy)}, "
            f"{b['rotation'] if 'rotation' in b else 'NULL'}, 'extract_outlines.py');"
        )
    grouped = buildings
    (OUT / "buildings.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"drawings/buildings.sql を作りました（{len(grouped)}棟）")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    page = fitz.open(PDF)[0]
    horizontal, vertical = axis_segments(page)
    rects = find_rectangles(horizontal, vertical)
    (OUT / "outlines_draft.json").write_text(json.dumps(rects, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"候補の長方形: {len(rects)}個")
    if "--apply" in sys.argv:
        apply_map(rects)
    else:
        draw_preview(page, rects)
        print("drawings/outlines_preview.png を確認し、tools/building_map.json に番号と棟の対応を書いてください")


if __name__ == "__main__":
    main()
