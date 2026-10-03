import { Injectable } from '@angular/core'
import { Observable, of, delay, switchMap } from 'rxjs'
import type { PendingOp, RoutePackage, ServerSnapshot } from '../types'
import { SEED_COMMENTS, SEED_ROUTES, SEED_SECTIONS, SNAPSHOT_SCHEMA } from './seed-data'
import { invalidateComments, recomputeQueue } from './snapshot-logic'

const SERVER_STORAGE_KEY = 'hazmat-server-snapshot-v1'

export type CommitResult =
  | { ok: true; snapshot: ServerSnapshot }
  | { ok: false; kind: 'conflict'; reason: string; currentVersion: number }
  | { ok: false; kind: 'error'; error: string; simulated: boolean }

function clone<T>(value: T): T {
  return structuredClone(value)
}

/** 固定种子的伪随机：每次会话的失败序列可复现，便于演练与排查 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 服务端快照：运输单编组、区段容量、会签、排队在同一份快照上。
 * - 每次写入按操作号幂等提交，快照整体替换，不出现半份快照；
 * - 区段修改走乐观并发：先到者生效，后到者收到冲突原因；
 * - 快照持久化到 localStorage，刷新后已写入数据不丢。
 */
@Injectable({ providedIn: 'root' })
export class RouteApiService {
  private snapshot: ServerSnapshot
  private readonly appliedOps = new Set<string>()
  private readonly random = mulberry32(20261003)
  private simulateFailure = false

  constructor() {
    this.snapshot = this.load()
  }

  /** 新电脑首次打开即有种子数据，同步可用，不出现空白 */
  getSnapshot(): Observable<ServerSnapshot> {
    return of(clone(this.snapshot))
  }

  /** 演练开关：打开后下一次写入必然失败（一次性），用于演示按操作号恢复 */
  setSimulateFailure(on: boolean): void {
    this.simulateFailure = on
  }

  /** 按操作号提交：同一操作号幂等，已写入的操作直接返回当前快照 */
  commitOp(op: PendingOp): Observable<CommitResult> {
    return of(null).pipe(
      delay(120),
      switchMap(() => {
        if (this.appliedOps.has(op.opId)) {
          return of<CommitResult>({ ok: true, snapshot: clone(this.snapshot) })
        }
        if (this.simulateFailure) {
          this.simulateFailure = false
          return of<CommitResult>({ ok: false, kind: 'error', error: '模拟写入失败（演练）：快照未变更，可按操作号恢复', simulated: true })
        }
        // 约 15% 的真实写入失败，失败时快照保持不变
        if (this.random() < 0.15) {
          return of<CommitResult>({ ok: false, kind: 'error', error: '写入冲突：服务端暂时无法提交，请按操作号恢复', simulated: false })
        }
        const result = this.apply(op)
        if (!result.ok) return of<CommitResult>(result)
        this.appliedOps.add(op.opId)
        this.persist()
        return of<CommitResult>({ ok: true, snapshot: clone(this.snapshot) })
      }),
    )
  }

  /** 原子应用：要么整份快照更新，要么完全不变 */
  private apply(op: PendingOp): CommitResult {
    const snapshot = clone(this.snapshot)
    switch (op.type) {
      case 'UPDATE_SECTION': {
        const section = snapshot.sections.find((item) => item.id === op.payload.sectionId)
        if (!section) return { ok: false, kind: 'conflict', reason: `区段 ${op.payload.sectionId} 不存在`, currentVersion: 0 }
        if (section.version !== op.baseVersion) {
          return {
            ok: false,
            kind: 'conflict',
            currentVersion: section.version,
            reason: `区段 ${section.name} 已被其他调度员修改（v${op.baseVersion} → v${section.version}），先到者已生效；请刷新基线后重新提交，草稿已保留`,
          }
        }
        section.capacity = op.payload.capacity
        section.version += 1
        snapshot.comments = invalidateComments(snapshot.comments, snapshot.routes, { sectionIds: [section.id] })
        break
      }
      case 'UPDATE_CONSIST': {
        const route = snapshot.routes.find((item) => item.id === op.payload.routeId)
        if (!route) return { ok: false, kind: 'conflict', reason: `运输单 ${op.payload.routeId} 不存在`, currentVersion: 0 }
        route.wagonCount = op.payload.wagonCount
        route.tonnage = op.payload.tonnage
        route.updatedAt = '刚刚'
        snapshot.comments = invalidateComments(snapshot.comments, snapshot.routes, { routeIds: [route.id] })
        break
      }
      case 'ADD_COMMENT': {
        snapshot.comments = [op.payload.comment, ...snapshot.comments]
        break
      }
      case 'RESOLVE_COMMENT': {
        const comment = snapshot.comments.find((item) => item.id === op.payload.commentId)
        if (comment) {
          comment.status = op.payload.status
          comment.invalidated = false
          comment.invalidReason = undefined
        }
        break
      }
      case 'CREATE_ALTERNATIVE': {
        const source = snapshot.routes.find((item) => item.id === op.payload.routeId) ?? snapshot.routes[0]
        if (source) {
          const alt: RoutePackage = {
            ...clone(source),
            id: `${source.id}-ALT`,
            score: Math.max(72, source.score - 2),
            updatedAt: '刚刚',
            scheduleOrder: snapshot.routes.length + 1,
            segments: clone(source.segments),
          }
          snapshot.routes = [...snapshot.routes, alt]
        }
        break
      }
    }
    snapshot.queue = recomputeQueue(snapshot.routes, snapshot.sections)
    this.snapshot = snapshot
    return { ok: true, snapshot: clone(this.snapshot) }
  }

  private load(): ServerSnapshot {
    try {
      const raw = localStorage.getItem(SERVER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ServerSnapshot
        if (parsed.schema === SNAPSHOT_SCHEMA && Array.isArray(parsed.routes) && Array.isArray(parsed.sections)) {
          return parsed
        }
      }
    } catch { /* 损坏则回退到种子数据 */ }
    return { schema: SNAPSHOT_SCHEMA, routes: clone(SEED_ROUTES), sections: clone(SEED_SECTIONS), comments: clone(SEED_COMMENTS), queue: [] }
  }

  private persist(): void {
    try {
      localStorage.setItem(SERVER_STORAGE_KEY, JSON.stringify(this.snapshot))
    } catch { /* 存储不可用时仅保内存，不影响当次快照一致性 */ }
  }
}
