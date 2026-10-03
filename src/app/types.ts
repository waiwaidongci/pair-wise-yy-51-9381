export type RiskLevel = '高' | '中' | '低'

export interface RiskSegment {
  id: string
  name: string
  from: string
  to: string
  km: string
  speed: string
  risks: string[]
  level: RiskLevel
  status: '待复核' | '已确认' | '需绕行'
  coordinates: [number, number][]
}

export interface RoutePackage {
  id: string
  cargo: string
  hazardClass: string
  trainCode: string
  origin: string
  destination: string
  tonnage: number
  wagonCount: number
  permit: string
  permission: '有效' | '缺失' | '待补充'
  score: number
  updatedAt: string
  segments: RiskSegment[]
}

export type CommentStatus = '待确认' | '已接受' | '已退回' | '已失效'

export interface ReviewComment {
  id: string
  segmentId: string
  role: string
  author: string
  content: string
  status: CommentStatus
  /** 会签所依据的快照版本，限值或编组变化后即失效 */
  basisVersion: number
  invalidReason?: string
}

/** 区段通行能力登记：每个区段的最大编组容量 */
export interface SectionCapacity {
  segmentId: string
  maxWagons: number
  /** 限值版本，每次变更 +1，用于并发先到者生效判定 */
  version: number
  updatedBy: string
  updatedAt: string
}

/** 操作日志：每一次快照变更按操作号审计 */
export interface JournalEntry {
  op: number
  at: string
  actor: string
  action: string
  detail: string
  status: '已提交' | '已回滚' | '未生效'
}

/** 后到者的限值冲突：草稿与冲突原因都保留 */
export interface CapacityConflict {
  segmentId: string
  actor: string
  draftMaxWagons: number
  baseVersion: number
  currentMaxWagons: number
  currentVersion: number
  winner: string
  reason: string
  at: string
}

/** 同一份快照上的核心数据：运输单编组、区段限值、会签 */
export interface SnapshotCore {
  routes: RoutePackage[]
  capacities: Record<string, SectionCapacity>
  comments: ReviewComment[]
  marshallingVersions: Record<string, number>
}

/** 可持久化的完整快照记录，写入失败时按操作号恢复 */
export interface SnapshotRecord {
  op: number
  version: number
  savedAt: string
  core: SnapshotCore
  journal: JournalEntry[]
}
