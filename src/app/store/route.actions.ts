import { createAction, props } from '@ngrx/store'
import type { ReviewComment, RiskLevel, RoutePackage, SectionCapacity, SnapshotRecord } from '../types'

export const loadRoutes = createAction('[Route Workbench] Load Routes')
export const loadRoutesSuccess = createAction('[Route API] Load Routes Success', props<{ routes: RoutePackage[]; capacities: SectionCapacity[]; comments: ReviewComment[] }>())
export const loadRoutesFailure = createAction('[Route API] Load Routes Failure', props<{ error: string }>())
export const snapshotRestored = createAction('[Snapshot] Restored From Storage', props<{ record: SnapshotRecord }>())
export const selectRoute = createAction('[Route Workbench] Select Route', props<{ id: string }>())
export const selectSegment = createAction('[Risk Map] Select Segment', props<{ id: string }>())
export const updateSegmentLevel = createAction('[Risk Map] Update Level', props<{ id: string; level: RiskLevel }>())
export const updateSectionCapacity = createAction('[Workspace] Update Section Capacity', props<{ segmentId: string; maxWagons: number; baseVersion: number; actor: string }>())
export const updateMarshalling = createAction('[Workspace] Update Marshalling', props<{ routeId: string; wagonCount: number; actor: string }>())
export const dismissConflict = createAction('[Workspace] Dismiss Conflict')
export const addComment = createAction('[Approval] Add Comment', props<{ comment: Omit<ReviewComment, 'basisVersion'> }>())
export const resolveComment = createAction('[Approval] Resolve Comment', props<{ id: string; status: ReviewComment['status'] }>())
export const reconfirmComment = createAction('[Approval] Reconfirm Comment', props<{ id: string; actor: string }>())
export const createAlternative = createAction('[Risk Map] Create Alternative')
export const writeSucceeded = createAction('[Snapshot] Write Succeeded', props<{ op: number }>())
export const writeFailed = createAction('[Snapshot] Write Failed', props<{ op: number; reason: string }>())
