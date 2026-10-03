import { createFeatureSelector, createSelector } from '@ngrx/store'
import type { RouteState } from './route.reducer'
import { buildReviewItems, routeMargins } from '../services/snapshot-logic'

export const selectRouteState = createFeatureSelector<RouteState>('routes')

export const selectRoutes = createSelector(selectRouteState, (state) => state.routes)
export const selectSections = createSelector(selectRouteState, (state) => state.sections)
export const selectComments = createSelector(selectRouteState, (state) => state.comments)
export const selectQueue = createSelector(selectRouteState, (state) => state.queue)
export const selectPendingOps = createSelector(selectRouteState, (state) => state.pendingOps)
export const selectDrafts = createSelector(selectRouteState, (state) => state.drafts)
export const selectSelectedRouteId = createSelector(selectRouteState, (state) => state.selectedRouteId)
export const selectSelectedSegmentId = createSelector(selectRouteState, (state) => state.selectedSegmentId)
export const selectLoading = createSelector(selectRouteState, (state) => state.loading)
export const selectError = createSelector(selectRouteState, (state) => state.error)
export const selectVersion = createSelector(selectRouteState, (state) => state.version)
export const selectSimulateFailure = createSelector(selectRouteState, (state) => state.simulateFailure)

/** 待复核结果：工作台、风险地图、审批页共用同一份清单 */
export const selectReviewItems = createSelector(selectRoutes, selectComments, selectQueue, (routes, comments, queue) =>
  buildReviewItems(routes, comments, queue),
)
export const selectReviewCount = createSelector(selectReviewItems, (items) => items.length)

/** 需要处理的写操作（失败 / 冲突），用于按操作号恢复 */
export const selectFailedOps = createSelector(selectPendingOps, (ops) => ops.filter((op) => op.status === '写入失败' || op.status === '冲突'))
export const selectPendingActionCount = createSelector(selectFailedOps, (ops) => ops.length)

/** 某运输单的逐段编组余量 */
export const selectSectionMargins = (routeId: string) =>
  createSelector(selectRoutes, selectSections, selectQueue, (routes, sections, queue) => routeMargins(routes, sections, queue, routeId))

/** 当前选中运输单 */
export const selectSelectedRoute = createSelector(selectRoutes, selectSelectedRouteId, (routes, id) => routes.find((route) => route.id === id))
