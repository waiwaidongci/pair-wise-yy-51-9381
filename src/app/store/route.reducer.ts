import { createReducer, on } from '@ngrx/store'
import type { CapacityConflict, JournalEntry, ReviewComment, SnapshotCore } from '../types'
import * as RouteActions from './route.actions'

export interface SnapshotVersion {
  core: SnapshotCore
  version: number
}

export interface RouteState extends SnapshotCore {
  selectedRouteId: string
  selectedSegmentId: string
  loading: boolean
  error: string
  /** 快照版本号，每次核心数据变更 +1 */
  version: number
  /** 操作号序列，每一次操作（含未生效）都占一个号 */
  opSeq: number
  journal: JournalEntry[]
  /** 按操作号留存的完整快照，写入失败时整体恢复，不会出现半份快照 */
  history: Record<number, SnapshotVersion>
  conflict: CapacityConflict | null
  lastRecovery: string
}

const HISTORY_LIMIT = 30

export const initialState: RouteState = {
  routes: [],
  capacities: {},
  comments: [],
  marshallingVersions: {},
  selectedRouteId: '',
  selectedSegmentId: '',
  loading: false,
  error: '',
  version: 0,
  opSeq: 0,
  journal: [],
  history: {},
  conflict: null,
  lastRecovery: '',
}

const timestamp = () => {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const coreOf = (state: RouteState): SnapshotCore => ({
  routes: state.routes,
  capacities: state.capacities,
  comments: state.comments,
  marshallingVersions: state.marshallingVersions,
})

function pruneHistory(history: Record<number, SnapshotVersion>): Record<number, SnapshotVersion> {
  const keys = Object.keys(history).map(Number).sort((a, b) => a - b)
  if (keys.length <= HISTORY_LIMIT) return history
  const keep = new Set([keys[0], ...keys.slice(-(HISTORY_LIMIT - 1))])
  return Object.fromEntries(Object.entries(history).filter(([op]) => keep.has(Number(op))))
}

/** 提交一份完整快照：核心数据整体替换，追加操作号与审计日志，历史快照按操作号留存 */
function commit(state: RouteState, core: SnapshotCore, entry: { actor: string; action: string; detail: string }): RouteState {
  const op = state.opSeq + 1
  const version = state.version + 1
  const journalEntry: JournalEntry = { op, at: timestamp(), actor: entry.actor, action: entry.action, detail: entry.detail, status: '已提交' }
  const history = pruneHistory({ ...state.history, [op]: { core, version } })
  return { ...state, ...core, version, opSeq: op, journal: [journalEntry, ...state.journal], history }
}

/** 未生效的操作（如限值冲突）同样记入审计，但不触碰核心快照 */
function rejectOp(state: RouteState, entry: { actor: string; action: string; detail: string }): RouteState {
  const op = state.opSeq + 1
  const journalEntry: JournalEntry = { op, at: timestamp(), actor: entry.actor, action: entry.action, detail: entry.detail, status: '未生效' }
  return { ...state, opSeq: op, journal: [journalEntry, ...state.journal] }
}

/** 限值或编组一变，相关会签立即失效，等待重新确认 */
function invalidateComments(comments: ReviewComment[], segmentIds: string[], reason: string): ReviewComment[] {
  return comments.map((comment) =>
    segmentIds.includes(comment.segmentId) && (comment.status === '待确认' || comment.status === '已接受')
      ? { ...comment, status: '已失效' as const, invalidReason: reason }
      : comment)
}

/** 取失败操作号之前最近的一份完整快照 */
function nearestSnapshot(history: Record<number, SnapshotVersion>, beforeOp: number): (SnapshotVersion & { op: number }) | null {
  const keys = Object.keys(history).map(Number).filter((key) => key < beforeOp).sort((a, b) => b - a)
  const key = keys[0]
  return key === undefined ? null : { ...history[key], op: key }
}

export const routeReducer = createReducer(
  initialState,
  on(RouteActions.loadRoutes, (state) => ({ ...state, loading: true, error: '' })),
  on(RouteActions.loadRoutesSuccess, (state, { routes, capacities, comments }) => {
    const core: SnapshotCore = {
      routes,
      capacities: Object.fromEntries(capacities.map((capacity) => [capacity.segmentId, capacity])),
      comments,
      marshallingVersions: {},
    }
    const loaded = commit({ ...state, loading: false }, core, { actor: '系统', action: '载入基础数据', detail: `运输单 ${routes.length} 条 · 区段限值 ${capacities.length} 条 · 会签 ${comments.length} 条` })
    return {
      ...loaded,
      selectedRouteId: state.selectedRouteId || routes[0]?.id || '',
      selectedSegmentId: state.selectedSegmentId || routes[0]?.segments[0]?.id || '',
    }
  }),
  on(RouteActions.loadRoutesFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(RouteActions.snapshotRestored, (state, { record }) => {
    const op = record.op + 1
    const entry: JournalEntry = { op, at: timestamp(), actor: '系统', action: '快照恢复', detail: `从本地存储恢复操作 OP-${record.op} 的完整快照（v${record.version}）`, status: '已提交' }
    return {
      ...state,
      ...record.core,
      loading: false,
      version: record.version,
      opSeq: op,
      journal: [entry, ...record.journal],
      history: { [record.op]: { core: record.core, version: record.version } },
      selectedRouteId: state.selectedRouteId || record.core.routes[0]?.id || '',
      selectedSegmentId: state.selectedSegmentId || record.core.routes[0]?.segments[0]?.id || '',
      conflict: null,
      lastRecovery: '',
    }
  }),
  on(RouteActions.selectRoute, (state, { id }) => ({ ...state, selectedRouteId: id, selectedSegmentId: state.routes.find((route) => route.id === id)?.segments[0]?.id ?? '' })),
  on(RouteActions.selectSegment, (state, { id }) => ({ ...state, selectedSegmentId: id })),
  on(RouteActions.updateSegmentLevel, (state, { id, level }) => ({
    ...commit(state, {
      ...coreOf(state),
      routes: state.routes.map((route) => ({ ...route, segments: route.segments.map((segment) => segment.id === id ? { ...segment, level, status: level === '高' ? '需绕行' as const : '待复核' as const } : segment) })),
    }, { actor: '风险地图', action: '风险等级调整', detail: `${id} 调整为${level}风险` }),
  })),
  on(RouteActions.updateSectionCapacity, (state, { segmentId, maxWagons, baseVersion, actor }) => {
    const current = state.capacities[segmentId]
    const currentVersion = current?.version ?? 0
    if (baseVersion !== currentVersion) {
      // 后到者：先到者已生效，保留草稿与冲突原因，操作按未生效记入审计
      const reason = `${actor} 基于限值版本 v${baseVersion} 提交，但 ${current?.updatedBy ?? '其他调度'} 已先将 ${segmentId} 最大编组登记为 ${current?.maxWagons ?? '—'} 辆（v${currentVersion}）。先到者生效，草稿 ${maxWagons} 辆已保留在登记席，可基于新版本重新提交。`
      const conflict: CapacityConflict = { segmentId, actor, draftMaxWagons: maxWagons, baseVersion, currentMaxWagons: current?.maxWagons ?? 0, currentVersion, winner: current?.updatedBy ?? '—', reason, at: timestamp() }
      const rejected = rejectOp(state, { actor, action: '区段限值变更', detail: `${segmentId} 草稿 ${maxWagons} 辆未生效：与 ${conflict.winner} 的 v${currentVersion} 冲突` })
      return { ...rejected, conflict }
    }
    // 先到者生效：限值变更后该区段会签立即失效，区段回到待复核
    const op = state.opSeq + 1
    const capacities = { ...state.capacities, [segmentId]: { segmentId, maxWagons, version: currentVersion + 1, updatedBy: actor, updatedAt: timestamp() } }
    const comments = invalidateComments(state.comments, [segmentId], `区段 ${segmentId} 限值由 ${current?.maxWagons ?? '未登记'} 辆调整为 ${maxWagons} 辆（操作 OP-${op}），需重新确认`)
    const routes = state.routes.map((route) => ({ ...route, segments: route.segments.map((segment) => segment.id === segmentId && segment.status === '已确认' ? { ...segment, status: '待复核' as const } : segment) }))
    return commit(state, { routes, capacities, comments, marshallingVersions: state.marshallingVersions }, { actor, action: '区段限值变更', detail: `${segmentId} 最大编组 ${current?.maxWagons ?? '未登记'} → ${maxWagons} 辆，相关会签已失效` })
  }),
  on(RouteActions.updateMarshalling, (state, { routeId, wagonCount, actor }) => {
    const route = state.routes.find((item) => item.id === routeId)
    if (!route || wagonCount === route.wagonCount || wagonCount < 1) return state
    // 编组一变，该运输单全部区段的会签立即失效，已确认区段回到待复核
    const op = state.opSeq + 1
    const segmentIds = route.segments.map((segment) => segment.id)
    const routes = state.routes.map((item) => item.id === routeId
      ? { ...item, wagonCount, segments: item.segments.map((segment) => segment.status === '已确认' ? { ...segment, status: '待复核' as const } : segment) }
      : item)
    const comments = invalidateComments(state.comments, segmentIds, `运输单 ${routeId} 编组由 ${route.wagonCount} 辆调整为 ${wagonCount} 辆（操作 OP-${op}），需重新确认`)
    const marshallingVersions = { ...state.marshallingVersions, [routeId]: (state.marshallingVersions[routeId] ?? 0) + 1 }
    return commit(state, { routes, capacities: state.capacities, comments, marshallingVersions }, { actor, action: '运输单编组变更', detail: `${routeId} 编组 ${route.wagonCount} → ${wagonCount} 辆，逐段余量已重算，相关会签已失效` })
  }),
  on(RouteActions.dismissConflict, (state) => ({ ...state, conflict: null })),
  on(RouteActions.addComment, (state, { comment }) => {
    const version = state.version + 1
    const comments: ReviewComment[] = [{ ...comment, basisVersion: version }, ...state.comments]
    return commit(state, { ...coreOf(state), comments }, { actor: comment.author, action: '新增会签', detail: `${comment.id}（${comment.segmentId} · ${comment.role}）依据快照 v${version}` })
  }),
  on(RouteActions.resolveComment, (state, { id, status }) => {
    const target = state.comments.find((comment) => comment.id === id)
    if (!target) return state
    const version = state.version + 1
    const comments = state.comments.map((comment) => comment.id === id ? { ...comment, status, basisVersion: version } : comment)
    return commit(state, { ...coreOf(state), comments }, { actor: '当前审阅人', action: `会签${status}`, detail: `${id}（${target.segmentId}）${status}，依据快照 v${version}` })
  }),
  on(RouteActions.reconfirmComment, (state, { id, actor }) => {
    const target = state.comments.find((comment) => comment.id === id)
    if (!target || target.status !== '已失效') return state
    const version = state.version + 1
    const comments = state.comments.map((comment) => comment.id === id ? { ...comment, status: '待确认' as const, basisVersion: version, invalidReason: undefined } : comment)
    return commit(state, { ...coreOf(state), comments }, { actor, action: '会签重新确认', detail: `${id}（${target.segmentId}）依据快照 v${version} 重新进入待确认` })
  }),
  on(RouteActions.createAlternative, (state) => ({
    ...commit(state, {
      ...coreOf(state),
      routes: state.routes.map((route) => route.id === state.selectedRouteId ? { ...route, id: `${route.id}-ALT`, score: Math.max(72, route.score - 2) } : route),
    }, { actor: '规则引擎', action: '生成替代方案', detail: `${state.selectedRouteId} 生成 -ALT 替代路径` }),
  })),
  on(RouteActions.writeFailed, (state, { op, reason }) => {
    const target = nearestSnapshot(state.history, op)
    if (!target) {
      return { ...state, lastRecovery: `操作 OP-${op} 写入失败（${reason}），无更早快照可回滚，当前内存中的完整快照保留不变` }
    }
    // 按操作号整体恢复：核心数据一次性替换，不会出现半份快照
    const journal = state.journal.map((entry) => entry.op === op ? { ...entry, status: '已回滚' as const, detail: `${entry.detail}｜写入失败：${reason}` } : entry)
    return {
      ...state,
      ...target.core,
      version: target.version,
      journal,
      lastRecovery: `操作 OP-${op} 写入失败（${reason}），已按操作号恢复至 OP-${target.op} 的完整快照（v${target.version}），未出现半份快照`,
    }
  }),
)
