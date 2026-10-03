import { createReducer, on } from '@ngrx/store'
import type { PendingOp, ReviewComment, RoutePackage, Section, ServerSnapshot } from '../types'
import { SEED_COMMENTS, SEED_ROUTES, SEED_SECTIONS, SNAPSHOT_SCHEMA } from '../services/seed-data'
import { recomputeQueue } from '../services/snapshot-logic'
import * as RouteActions from './route.actions'

const CLIENT_STORAGE_KEY = 'hazmat-client-v1'

export interface SectionDraft {
  capacity: number
  baseVersion: number
}

export interface RouteState {
  routes: RoutePackage[]
  sections: Section[]
  comments: ReviewComment[]
  queue: ReturnType<typeof recomputeQueue>
  pendingOps: PendingOp[]
  drafts: Record<string, SectionDraft>
  selectedRouteId: string
  selectedSegmentId: string
  loading: boolean
  error: string
  version: number
  simulateFailure: boolean
  hydrated: boolean
}

function buildInitialState(): RouteState {
  const routes = structuredClone(SEED_ROUTES)
  const sections = structuredClone(SEED_SECTIONS)
  const comments = structuredClone(SEED_COMMENTS)
  const state: RouteState = {
    routes,
    sections,
    comments,
    queue: recomputeQueue(routes, sections),
    pendingOps: [],
    drafts: {},
    selectedRouteId: routes[0]?.id ?? '',
    selectedSegmentId: routes[0]?.segments[0]?.id ?? '',
    loading: false,
    error: '',
    version: 1,
    simulateFailure: false,
    hydrated: false,
  }
  return hydrateClientState(state)
}

function hydrateClientState(state: RouteState): RouteState {
  try {
    const raw = localStorage.getItem(CLIENT_STORAGE_KEY)
    if (!raw) return state
    const parsed = JSON.parse(raw) as Partial<RouteState> & { schema?: number }
    if (parsed.schema !== SNAPSHOT_SCHEMA) return state
    return {
      ...state,
      pendingOps: Array.isArray(parsed.pendingOps) ? parsed.pendingOps : [],
      drafts: parsed.drafts ?? {},
      selectedRouteId: parsed.selectedRouteId || state.selectedRouteId,
      selectedSegmentId: parsed.selectedSegmentId || state.selectedSegmentId,
      simulateFailure: parsed.simulateFailure ?? false,
      hydrated: true,
    }
  } catch {
    return state
  }
}

function applySnapshot(state: RouteState, snapshot: ServerSnapshot): RouteState {
  const routes = snapshot.routes
  const sections = snapshot.sections
  return {
    ...state,
    routes,
    sections,
    comments: snapshot.comments,
    queue: recomputeQueue(routes, sections),
    selectedRouteId: state.selectedRouteId || routes[0]?.id || '',
    selectedSegmentId: state.selectedSegmentId || routes[0]?.segments[0]?.id || '',
    version: state.version + 1,
  }
}

function upsertOp(state: RouteState, opId: string, patch: Partial<PendingOp>): RouteState {
  return {
    ...state,
    pendingOps: state.pendingOps.map((op) => (op.opId === opId ? { ...op, ...patch } : op)),
  }
}

export const initialState = buildInitialState()

export const routeReducer = createReducer(
  initialState,
  on(RouteActions.loadRoutes, (state) => ({ ...state, loading: true, error: '' })),
  on(RouteActions.loadRoutesSuccess, (state, { snapshot }) => ({ ...applySnapshot(state, snapshot), loading: false, error: '', hydrated: true })),
  on(RouteActions.loadRoutesFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(RouteActions.commitOpRequest, (state, { op }) => ({
    ...state,
    pendingOps: [op, ...state.pendingOps],
    error: '',
  })),
  on(RouteActions.commitOpSuccess, (state, { opId, snapshot }) => {
    const next = applySnapshot(state, snapshot)
    // 仅清除版本号发生变化的区段草稿（本次写入涉及的区段）
    const changedSectionIds = new Set(
      next.sections
        .filter((section) => state.sections.find((old) => old.id === section.id)?.version !== section.version)
        .map((section) => section.id),
    )
    return {
      ...next,
      pendingOps: next.pendingOps.map((op) =>
        op.opId === opId ? { ...op, status: '已写入' as const, attempts: op.attempts + 1, appliedAt: new Date().toISOString(), error: undefined } : op,
      ),
      drafts: Object.fromEntries(Object.entries(next.drafts).filter(([sectionId]) => !changedSectionIds.has(sectionId))),
    }
  }),
  on(RouteActions.commitOpFailure, (state, { opId, error, simulated }) => {
    const attempts = (state.pendingOps.find((op) => op.opId === opId)?.attempts ?? 0) + 1
    return {
      ...upsertOp(state, opId, { status: '写入失败', error, attempts }),
      simulateFailure: simulated ? false : state.simulateFailure,
      error: '',
    }
  }),
  on(RouteActions.commitOpConflict, (state, { opId, conflictReason }) => {
    const op = state.pendingOps.find((item) => item.opId === opId)
    return {
      ...upsertOp(state, opId, { status: '冲突', conflictReason, draft: op?.payload, attempts: (op?.attempts ?? 0) + 1 }),
    }
  }),
  on(RouteActions.recoverOp, (state, { opId }) =>
    upsertOp(state, opId, { status: '待写入', error: undefined, conflictReason: undefined, attempts: (state.pendingOps.find((op) => op.opId === opId)?.attempts ?? 0) + 1 }),
  ),
  on(RouteActions.discardOp, (state, { opId }) => ({
    ...state,
    pendingOps: state.pendingOps.filter((op) => op.opId !== opId),
  })),

  on(RouteActions.setSectionDraft, (state, { sectionId, capacity, baseVersion }) => ({
    ...state,
    drafts: { ...state.drafts, [sectionId]: { capacity, baseVersion } },
  })),
  on(RouteActions.clearSectionDraft, (state, { sectionId }) => {
    const { [sectionId]: _removed, ...rest } = state.drafts
    void _removed
    return { ...state, drafts: rest }
  }),

  on(RouteActions.selectRoute, (state, { id }) => ({
    ...state,
    selectedRouteId: id,
    selectedSegmentId: state.routes.find((route) => route.id === id)?.segments[0]?.id ?? '',
  })),
  on(RouteActions.selectSegment, (state, { id }) => ({ ...state, selectedSegmentId: id })),
  on(RouteActions.setSimulateFailure, (state, { on }) => ({ ...state, simulateFailure: on })),
)
