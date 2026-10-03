import { createAction, props } from '@ngrx/store'
import type { PendingOp, ServerSnapshot } from '../types'

/** 加载快照（新电脑首次打开即拉取，工作台/地图/审批页共用同一份） */
export const loadRoutes = createAction('[Snapshot] Load')
export const loadRoutesSuccess = createAction('[Snapshot] Load Success', props<{ snapshot: ServerSnapshot }>())
export const loadRoutesFailure = createAction('[Snapshot] Load Failure', props<{ error: string }>())

/** 写操作：所有编组/容量/会签变更都走操作号驱动，失败可按操作号恢复 */
export const commitOpRequest = createAction('[Op] Commit Request', props<{ op: PendingOp }>())
export const commitOpSuccess = createAction('[Op] Commit Success', props<{ opId: string; snapshot: ServerSnapshot }>())
export const commitOpFailure = createAction('[Op] Commit Failure', props<{ opId: string; error: string; simulated: boolean }>())
export const commitOpConflict = createAction('[Op] Commit Conflict', props<{ opId: string; conflictReason: string }>())

/** 按操作号恢复失败/中断的写入 */
export const recoverOp = createAction('[Op] Recover', props<{ opId: string }>())
/** 放弃冲突或失败的操作（草稿保留在操作日志中，放弃后清除） */
export const discardOp = createAction('[Op] Discard', props<{ opId: string }>())

/** 区段容量/编组编辑时的草稿（后到者保留草稿与冲突原因） */
export const setSectionDraft = createAction('[Risk Map] Set Section Draft', props<{ sectionId: string; capacity: number; baseVersion: number }>())
export const clearSectionDraft = createAction('[Risk Map] Clear Section Draft', props<{ sectionId: string }>())

/** 选择 */
export const selectRoute = createAction('[Workspace] Select Route', props<{ id: string }>())
export const selectSegment = createAction('[Risk Map] Select Segment', props<{ id: string }>())

/** 写入失败演练开关 */
export const setSimulateFailure = createAction('[Approval] Set Simulate Failure', props<{ on: boolean }>())
