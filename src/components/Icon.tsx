// 画面で使う小さな線画のアイコン（絵文字は端末ごとに見た目が変わるので、SVGで描く）
// 色は文字の色（currentColor）に合わせる

const PATHS = {
  camera: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  back: <path d="M14.5 5l-7 7 7 7" />,
  chevron: <path d="M9.5 5l7 7-7 7" />,
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M9 21l2.5-6.5L9.5 12l1-4.5 3 1.5 1.5 3 3 1M10.5 7.5L7 9.5v3M13.5 15l2 6" />
    </>
  ),
  stairs: <path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21" />,
  map: (
    <>
      <path d="M3.5 6l5.5-2 6 2 5.5-2v14L15 20l-6-2-5.5 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}
