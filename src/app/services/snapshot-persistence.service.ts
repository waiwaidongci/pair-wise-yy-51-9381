import { Injectable } from '@angular/core'
import { Observable, of, throwError } from 'rxjs'
import type { SnapshotRecord } from '../types'

const STORAGE_KEY = 'hazmat.snapshot.v1'

/**
 * 快照持久化：每次提交把完整快照（含操作号与审计日志）整体写入。
 * 写入要么完整落盘、要么整体失败，不会写出半份快照。
 */
@Injectable({ providedIn: 'root' })
export class SnapshotPersistenceService {
  private failNextWrite = false

  /** 演练开关：让下一次写入失败，用于验证按操作号恢复 */
  armFailureDrill() {
    this.failNextWrite = true
  }

  save(record: SnapshotRecord): Observable<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false
      return throwError(() => new Error('存储介质拒绝写入（演练）'))
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
      return of(void 0)
    } catch (error) {
      return throwError(() => (error instanceof Error ? error : new Error(String(error))))
    }
  }

  /** 读取上次完整落盘的快照；残缺或损坏的记录一律视为不存在 */
  load(): SnapshotRecord | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const record = JSON.parse(raw) as SnapshotRecord
      if (!record || typeof record.op !== 'number' || typeof record.version !== 'number') return null
      if (!record.core || !Array.isArray(record.core.routes) || !Array.isArray(record.journal)) return null
      return record
    } catch {
      return null
    }
  }
}
