import type { ActionReducer } from '@ngrx/store'
import type { RouteState } from './route.reducer'
import { SNAPSHOT_SCHEMA } from '../services/seed-data'

const CLIENT_STORAGE_KEY = 'hazmat-client-v1'

interface RootState {
  routes: RouteState
}

/**
 * 客户端快照持久化：操作日志（操作号）、草稿、选择与演练开关。
 * 服务端快照由 RouteApiService 持久化；此处只保留写操作上下文，
 * 保证刷新后可按操作号恢复、草稿不丢。
 */
export function persistenceMetaReducer(reducer: ActionReducer<RootState>): ActionReducer<RootState> {
  return (state, action) => {
    const next = reducer(state, action)
    const routeState = next?.routes
    if (routeState) {
      try {
        localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify({
          schema: SNAPSHOT_SCHEMA,
          pendingOps: routeState.pendingOps.slice(0, 50),
          drafts: routeState.drafts,
          selectedRouteId: routeState.selectedRouteId,
          selectedSegmentId: routeState.selectedSegmentId,
          simulateFailure: routeState.simulateFailure,
        }))
      } catch { /* 存储不可用时仅保内存 */ }
    }
    return next
  }
}
