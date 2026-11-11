// 来校者向け画面の状態（設計書 7.3）
// 状態は useReducer で1か所にまとめ、再読み込みしても消えないよう sessionStorage に残す

export type Screen = 'start' | 'overview' | 'guide' | 'arrived'

export type VisitorState = {
  screen: Screen
  originCp: string // 出発点のチェックポイントID（QRの地点。ふつうは CP01）
  destination: string | null // 部屋ID
  step: number // 案内中の区間（0から）
}

export type VisitorAction =
  | { type: 'chooseDestination'; roomId: string }
  | { type: 'setOrigin'; cp: string }
  | { type: 'startGuide' }
  | { type: 'next'; lastStep: number } // 次の区間へ。最後の区間なら到着
  | { type: 'prev' } // 前の区間へ（押し間違い対策・要件 F-25）
  | { type: 'back' } // 1つ前の画面へ
  | { type: 'reset' }

const STORAGE_KEY = 'armap.visitor'
const DEFAULT_CP = 'CP01'

export function visitorReducer(state: VisitorState, action: VisitorAction): VisitorState {
  switch (action.type) {
    case 'chooseDestination':
      return { ...state, destination: action.roomId, screen: 'overview', step: 0 }
    case 'setOrigin':
      return { ...state, originCp: action.cp }
    case 'startGuide':
      return state.destination ? { ...state, screen: 'guide', step: 0 } : state
    case 'next':
      return state.step >= action.lastStep ? { ...state, screen: 'arrived' } : { ...state, step: state.step + 1 }
    case 'prev':
      return { ...state, step: Math.max(0, state.step - 1) }
    case 'back':
      if (state.screen === 'arrived') return { ...state, screen: 'guide' }
      return { ...state, screen: state.screen === 'guide' ? 'overview' : 'start' }
    case 'reset':
      return { ...state, screen: 'start', destination: null, step: 0 }
  }
}

/**
 * 最初の状態を決める
 * ・URL に ?cp=CP05 があれば、そのQRの地点から始める（要件 F-02）。目的地の選び直しから
 * ・無ければ、前回の続き（同じタブで再読み込みしたとき）か、事務室（CP01）から
 */
export function initialState(search: string): VisitorState {
  const cp = new URLSearchParams(search).get('cp')?.trim().toUpperCase()
  if (cp) return { screen: 'start', originCp: cp, destination: null, step: 0 }
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) return { step: 0, ...(JSON.parse(saved) as Partial<VisitorState>) } as VisitorState
  } catch {
    // 読めなければ最初から
  }
  return { screen: 'start', originCp: DEFAULT_CP, destination: null, step: 0 }
}

export function saveState(state: VisitorState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 保存できなくても動作には困らない
  }
}
