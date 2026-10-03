import { createSelector } from '@ngrx/store'
import type { ReviewComment } from '../types'
import type { RouteState } from './route.reducer'

export const selectRouteState = (state: { routes: RouteState }): RouteState => state.routes

/** 运输单按当前编组逐段计算的通行余量 */
export interface SegmentMarginView {
  routeId: string
  trainCode: string
  segmentId: string
  segmentName: string
  capacity: number | null
  wagonCount: number
  margin: number | null
  over: boolean
}

export const selectSegmentMargins = createSelector(selectRouteState, (state): SegmentMarginView[] =>
  state.routes.flatMap((route) =>
    route.segments.map((segment) => {
      const capacity = state.capacities[segment.id]?.maxWagons ?? null
      const margin = capacity === null ? null : capacity - route.wagonCount
      return {
        routeId: route.id,
        trainCode: route.trainCode,
        segmentId: segment.id,
        segmentName: segment.name,
        capacity,
        wagonCount: route.wagonCount,
        margin,
        over: margin !== null && margin < 0,
      }
    }),
  ),
)

/** 超出区段容量而进入排队的运输单 */
export interface QueuedOrderView {
  routeId: string
  trainCode: string
  cargo: string
  blocks: { segmentId: string; segmentName: string; overBy: number }[]
}

export const selectQueuedOrders = createSelector(selectRouteState, selectSegmentMargins, (state, margins): QueuedOrderView[] => {
  const queued = new Map<string, QueuedOrderView>()
  for (const margin of margins) {
    if (!margin.over) continue
    let entry = queued.get(margin.routeId)
    if (!entry) {
      const route = state.routes.find((item) => item.id === margin.routeId)
      entry = { routeId: margin.routeId, trainCode: margin.trainCode, cargo: route?.cargo ?? '', blocks: [] }
      queued.set(margin.routeId, entry)
    }
    entry.blocks.push({ segmentId: margin.segmentId, segmentName: margin.segmentName, overBy: -(margin.margin ?? 0) })
  }
  return [...queued.values()]
})

/** 工作台、风险地图、审批页共用同一份待复核结果 */
export interface PendingReviewView {
  segments: { routeId: string; segmentId: string; name: string }[]
  invalidated: ReviewComment[]
  queued: QueuedOrderView[]
  total: number
}

export const selectPendingReview = createSelector(selectRouteState, selectQueuedOrders, (state, queued): PendingReviewView => {
  const segments = state.routes.flatMap((route) =>
    route.segments
      .filter((segment) => segment.status === '待复核')
      .map((segment) => ({ routeId: route.id, segmentId: segment.id, name: segment.name })))
  const invalidated = state.comments.filter((comment) => comment.status === '已失效')
  return { segments, invalidated, queued, total: segments.length + invalidated.length + queued.length }
})
