import type { CampusData } from '../types.ts'

// 来校者向けのデータ読み込み（設計書 5.6）
// 一度読んだデータは sessionStorage に版（ETag）と一緒に残し、
// 次からは「変わっていなければ 304」で通信量を減らす（モバイル回線を想定）

const CACHE_KEY = 'armap.campusData'

type Cached = { etag: string; data: CampusData }

function readCache(): Cached | null {
  try {
    const s = sessionStorage.getItem(CACHE_KEY)
    return s ? (JSON.parse(s) as Cached) : null
  } catch {
    return null
  }
}

function writeCache(c: Cached) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    // 保存できなくても動作には困らない（プライベートブラウズなど）
  }
}

export async function fetchCampusData(): Promise<CampusData> {
  const cached = readCache()
  try {
    const res = await fetch('/api/data', { headers: cached ? { 'If-None-Match': cached.etag } : {} })
    if (res.status === 304 && cached) return cached.data
    if (!res.ok) throw new Error(`データを読み込めませんでした（${res.status}）`)
    const data = (await res.json()) as CampusData
    writeCache({ etag: res.headers.get('ETag') ?? '', data })
    return data
  } catch (e) {
    // 電波が悪いときは、前に読んだデータで続ける
    if (cached) return cached.data
    throw e
  }
}
