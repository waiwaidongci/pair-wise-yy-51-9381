import { inject, Injectable } from '@angular/core'
import { Actions, createEffect, ofType } from '@ngrx/effects'
import { Store } from '@ngrx/store'
import { catchError, concatMap, map, mergeMap, of, tap, withLatestFrom } from 'rxjs'
import { RouteApiService, type CommitResult } from '../services/route-api.service'
import * as RouteActions from './route.actions'
import { selectPendingOps } from './route.selectors'
import type { PendingOp } from '../types'

function toResultAction(opId: string, result: CommitResult) {
  if (result.ok) return RouteActions.commitOpSuccess({ opId, snapshot: result.snapshot })
  if (result.kind === 'conflict') return RouteActions.commitOpConflict({ opId, conflictReason: result.reason })
  return RouteActions.commitOpFailure({ opId, error: result.error, simulated: result.simulated })
}

@Injectable()
export class RouteEffects {
  private readonly actions$ = inject(Actions)
  private readonly api = inject(RouteApiService)
  private readonly store = inject(Store)

  /** 启动即拉取快照；新电脑首次打开也有种子数据，不出现空白 */
  loadRoutes$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RouteActions.loadRoutes),
      concatMap(() =>
        this.api.getSnapshot().pipe(
          map((snapshot) => RouteActions.loadRoutesSuccess({ snapshot })),
          catchError((error: unknown) =>
            of(RouteActions.loadRoutesFailure({ error: error instanceof Error ? error.message : '无法读取快照' })),
          ),
        ),
      ),
    ),
  )

  /** 写操作：按操作号提交，失败/冲突不改变快照 */
  commitOp$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RouteActions.commitOpRequest),
      concatMap(({ op }) => this.api.commitOp(op).pipe(map((result) => toResultAction(op.opId, result)))),
    ),
  )

  /** 按操作号恢复：同一操作号幂等重放 */
  recoverOp$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RouteActions.recoverOp),
      withLatestFrom(this.store.select(selectPendingOps)),
      concatMap(([{ opId }, ops]) => {
        const op: PendingOp | undefined = ops.find((item) => item.opId === opId)
        if (!op) return of(RouteActions.discardOp({ opId }))
        return this.api.commitOp(op).pipe(map((result) => toResultAction(opId, result)))
      }),
    ),
  )

  /** 上次关闭时未完成的写入（待写入）在快照加载后自动按操作号恢复 */
  autoRecover$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RouteActions.loadRoutesSuccess),
      withLatestFrom(this.store.select(selectPendingOps)),
      mergeMap(([, ops]) =>
        ops.filter((op) => op.status === '待写入').map((op) => RouteActions.recoverOp({ opId: op.opId })),
      ),
    ),
  )

  /** 演练开关同步到服务端 */
  syncSimulate$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RouteActions.setSimulateFailure),
        tap(({ on }) => this.api.setSimulateFailure(on)),
      ),
    { dispatch: false },
  )
}
