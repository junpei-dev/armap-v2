"""図面PDFの各ページを画像に書き出す（作業用・手順書 3.1）

使い方:  python tools/render_pages.py
出力:    drawings/p1.png 〜 p9.png（gitには入らない）
"""
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "29_R7延岡工業_図面.pdf"
OUT = ROOT / "drawings"


def main() -> None:
    OUT.mkdir(exist_ok=True)
    doc = fitz.open(PDF)
    for i, page in enumerate(doc, start=1):
        # 200dpi あれば平面図の寸法の数字まで読める
        page.get_pixmap(dpi=200).save(OUT / f"p{i}.png")
        print(f"p{i}.png を書き出しました")


if __name__ == "__main__":
    main()
