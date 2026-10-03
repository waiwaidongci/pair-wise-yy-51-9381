import { inject, Injectable } from '@angular/core'
import { Actions, createEffect, ofType } from '@ngrx/effects'
import { Store } from '@ngrx/store'
import { catchError, map, of, switchMap, withLatestFrom } from 'rxjs'
import { RouteApiService } from '../services/route-api.service'
import { SnapshotPersistenceService } from '../services/snapshot-persistence.service'
import type { SnapshotRecord } from '../types'
import * as RouteActions from './route.actions'
import type { RouteState } from './route.reducer'
import { selectRouteState } from './route.selectors'

@Injectable()
export class RouteEffects {
  private readonly actions$ = inject(Actions)
  private readonly api = inject(RouteApiService)
  private readonly persistence = inject(SnapshotPersistenceService)
  private readonly store = inject(Store<{ routes: RouteState }>)

  loadRoutes$ = createEffect(() => this.actions$.pipe(
    ofType(RouteActions.loadRoutes),
    switchMap(() => this.api.getRoutePackages().pipe(
      map((payload) => {
        const saved = this.persistence.load()
        if (saved) return RouteActions.snapshotRestored({ record: saved })
        return RouteActions.loadRoutesSuccess({ routes: payload.items, capacities: payload.capacities, comments: payload.comments })
      }),
      catchError((error: unknown) => of(RouteActions.loadRoutesFailure({ error: error instanceof Error ? error.message : '无法读取路径数据' }))),
    )),
  ))

  /** 每次提交后把完整快照整体落盘；失败则按操作号回滚恢复 */
  persistSnapshot$ = createEffect(() => this.actions$.pipe(
    ofType(
      RouteActions.loadRoutesSuccess,
      RouteActions.updateSectionCapacity,
      RouteActions.updateMarshalling,
      RouteActions.addComment,
      RouteActions.resolveComment,
      RouteActions.reconfirmComment,
      RouteActions.updateSegmentLevel,
      RouteActions.createAlternative,
    ),
    withLatestFrom(this.store.select(selectRouteState)),
    switchMap(([, state]) => {
      const record: SnapshotRecord = {
        op: state.opSeq,
        version: state.version,
        savedAt: new Date().toISOString(),
        core: {
          routes: state.routes,
          capacities: state.capacities,
          comments: state.comments,
          marshallingVersions: state.marshallingVersions,
        },
        journal: state.journal,
      }
      return this.persistence.save(record).pipe(
        map(() => RouteActions.writeSucceeded({ op: record.op })),
        catchError((error: unknown) => of(RouteActions.writeFailed({ op: record.op, reason: error instanceof Error ? error.message : '未知写入错误' }))),
      )
    }),
  ))
}
