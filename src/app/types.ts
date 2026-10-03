export type RiskLevel = '高' | '中' | '低'

/** 共享区段：全网唯一的编组容量登记点，多份运输单共用同一容量池 */
export interface Section {
  id: string
  name: string
  /** 最大编组容量（辆） */
  capacity: number
  /** 乐观并发版本号：先到者生效，后到者据此识别冲突 */
  version: number
}

export interface RiskSegment {
  id: string
  /** 引用共享区段 Section.id，编组容量按区段统一计算 */
  sectionId: string
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
  /** 编组辆数：变更后相关会签立即失效 */
  wagonCount: number
  permit: string
  permission: '有效' | '缺失' | '待补充'
  score: number
  updatedAt: string
  /** 计划排序号，逐段余量按此顺序排入容量池 */
  scheduleOrder: number
  segments: RiskSegment[]
}

export interface ReviewComment {
  id: string
  routeId: string
  segmentId: string
  role: string
  author: string
  content: string
  status: '待确认' | '已接受' | '已退回'
  /** 限值或编组变更后置为 true，必须重新确认 */
  invalidated?: boolean
  invalidReason?: string
}

/** 排队记录：运输单在某一区段超出当前编组容量 */
export interface QueueEntry {
  id: string
  routeId: string
  sectionId: string
  /** 申请编组辆数 */
  requiredWagons: number
  /** 排入前已占用编组 */
  loadBefore: number
  /** 当时余量 */
  margin: number
  capacity: number
  reason: string
}

export type OpType = 'UPDATE_SECTION' | 'UPDATE_CONSIST' | 'ADD_COMMENT' | 'RESOLVE_COMMENT' | 'CREATE_ALTERNATIVE'
export type OpStatus = '待写入' | '已写入' | '写入失败' | '冲突'

/** 写操作日志（outbox）：每份写入都有操作号，失败后按操作号恢复，快照要么全成要么全不成 */
export interface PendingOp {
  opId: string
  type: OpType
  payload: any
  /** 区段修改时的乐观并发基线版本 */
  baseVersion?: number
  status: OpStatus
  attempts: number
  error?: string
  conflictReason?: string
  /** 冲突后保留的草稿（提交内容） */
  draft?: any
  createdAt: string
  appliedAt?: string
}

/** 待复核结果：工作台、风险地图、审批页共用同一份清单 */
export interface ReviewItem {
  kind: '风险区段' | '会签意见' | '通行排队' | '许可缺失'
  refId: string
  routeId?: string
  sectionId?: string
  reason: string
  severity: '高' | '中'
}

/** 服务端快照：运输单编组、区段容量、会签、排队在同一份快照上 */
export interface ServerSnapshot {
  schema: number
  routes: RoutePackage[]
  sections: Section[]
  comments: ReviewComment[]
  queue: QueueEntry[]
}
