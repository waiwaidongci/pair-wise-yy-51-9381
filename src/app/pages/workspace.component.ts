import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { MatTableModule } from '@angular/material/table'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatDividerModule } from '@angular/material/divider'
import { MatChipsModule } from '@angular/material/chips'
import * as RouteActions from '../store/route.actions'
import {
  selectLoading,
  selectQueue,
  selectReviewCount,
  selectReviewItems,
  selectRoutes,
  selectSectionMargins,
  selectSelectedRoute,
  selectVersion,
} from '../store/route.selectors'
import { createOp } from '../services/snapshot-logic'
import type { RoutePackage } from '../types'
import { ReviewSummaryComponent } from '../components/review-summary.component'

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressBarModule, MatDividerModule, MatChipsModule, ReviewSummaryComponent,
  ],
  template: `
    <main class="page">
      <div class="page-head"><div><p class="eyebrow">运输许可与路径编组</p><h1>危险货物运输路径审批</h1><p>核对货物类别、编组、区段容量与会签，逐段计算通行余量。</p></div><div><button mat-stroked-button (click)="createAlternative()">生成替代方案</button> <button mat-flat-button color="primary" (click)="refresh()">重新校验</button></div></div>
      <div class="grid-4">
        <article class="card metric"><span>待复核</span><strong>{{ reviewCount$ | async }}</strong><small>工作台 · 地图 · 审批页一致</small></article>
        <article class="card metric"><span>高风险区段</span><strong class="risk-high">{{ highRiskCount }}</strong><small>需安全与应急会签</small></article>
        <article class="card metric"><span>许可缺失</span><strong class="risk-mid">{{ missingPermissionCount }}</strong><small>不得进入审批通过态</small></article>
        <article class="card metric"><span>当前快照</span><strong>v{{ version$ | async }}</strong><small>编组/容量/会签同一份</small></article>
      </div>
      @if (loading$ | async) { <mat-progress-bar mode="indeterminate" /> }
      <div class="grid-2">
        <section class="card table-wrap">
          <div class="toolbar"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>货物类别</mat-label><mat-select><mat-option>全部类别</mat-option><mat-option>第 3 类 易燃液体</mat-option><mat-option>第 8 类 腐蚀品</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>审批状态</mat-label><mat-select><mat-option>全部状态</mat-option><mat-option>待安全复核</mat-option><mat-option>待应急复核</mat-option></mat-select></mat-form-field><span class="spacer"></span><button mat-stroked-button>导出审批包</button></div>
          <table mat-table [dataSource]="(routes$ | async) || []">
            <ng-container matColumnDef="id"><th mat-header-cell *matHeaderCellDef>运输单</th><td mat-cell *matCellDef="let row"><b>{{row.id}}</b><small class="block">{{row.updatedAt}}</small></td></ng-container>
            <ng-container matColumnDef="cargo"><th mat-header-cell *matHeaderCellDef>货物 / 车次</th><td mat-cell *matCellDef="let row"><b>{{row.cargo}}</b><small class="block">{{row.hazardClass}} · {{row.trainCode}}</small></td></ng-container>
            <ng-container matColumnDef="consist"><th mat-header-cell *matHeaderCellDef>编组</th><td mat-cell *matCellDef="let row">{{row.wagonCount}} 辆<small class="block">{{row.tonnage}} 吨</small></td></ng-container>
            <ng-container matColumnDef="route"><th mat-header-cell *matHeaderCellDef>起终点</th><td mat-cell *matCellDef="let row">{{row.origin}} → {{row.destination}}</td></ng-container>
            <ng-container matColumnDef="permission"><th mat-header-cell *matHeaderCellDef>许可</th><td mat-cell *matCellDef="let row"><span [class.risk-high]="row.permission!=='有效'">{{row.permission}}</span></td></ng-container>
            <ng-container matColumnDef="score"><th mat-header-cell *matHeaderCellDef>风险分</th><td mat-cell *matCellDef="let row"><b [class.risk-high]="row.score>=70" [class.risk-mid]="row.score>=45 && row.score<70">{{row.score}}</b> / 100</td></ng-container>
            <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button color="primary" (click)="select(row)">审核</button></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected-row]="row.id === selectedId"></tr>
          </table>
        </section>
        <aside class="side">
          <section class="card">
            <h2>规则引擎结论</h2>
            @for (route of (routes$ | async) || []; track route.id) {
              <div class="rule" [class.active]="route.id === selectedId"><div><b>{{route.trainCode}}</b><span>{{route.segments.length}} 个运行区段 · {{route.wagonCount}} 辆</span></div><strong [class.risk-high]="route.score >= 70" [class.risk-mid]="route.score < 70">{{route.score >= 70 ? '高风险' : '需复核' }}</strong></div>
            }
          </section>
          @if (selectedRoute$ | async; as route) {
            <section class="card">
              <h2>逐段编组余量 · {{ route.id }}</h2>
              <div class="consist-row">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="consist-field">
                  <mat-label>当前编组（辆）</mat-label>
                  <input matInput type="number" [ngModel]="draftWagonCount" (ngModelChange)="draftWagonCount = $event" min="1" />
                </mat-form-field>
                <button mat-flat-button color="primary" (click)="commitConsist(route)" [disabled]="draftWagonCount === route.wagonCount || draftWagonCount < 1">调整编组</button>
              </div>
              @for (margin of (margins$ | async) || []; track margin.section.id) {
                <div class="margin-row" [class.queued]="!margin.accepted">
                  <div class="margin-head"><b>{{ margin.section.id }}</b><span>{{ margin.section.name }}</span></div>
                  <div class="margin-bar"><span>容量 {{ margin.section.capacity }}</span><span>已排 {{ margin.load }}</span><span [class.risk-high]="!margin.accepted">余量 {{ margin.accepted ? margin.marginAfter : margin.marginBefore }}</span></div>
                  <small class="margin-status" [class.risk-high]="!margin.accepted">{{ margin.accepted ? '✓ 可排入' : '⚠ 超出容量 · 排队中' }}</small>
                </div>
              }
            </section>
          }
          <app-review-summary [items]="(reviewItems$ | async) || []" />
        </aside>
      </div>
    </main>
  `,
  styles: [`
    h2{margin:0 0 12px;font-size:16px}.table-wrap{overflow:auto}.block{display:block;color:#7a8798;margin-top:3px}.selected-row{background:#eff6ff}
    .rule{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #edf0f5}.rule span{display:block;color:#7a8798;font-size:12px;margin-top:4px}.rule.active{padding-left:10px;border-left:3px solid #2563eb}.rule strong{font-size:12px}
    .toolbar{margin-bottom:10px}.toolbar mat-form-field{width:160px}
    .side{display:flex;flex-direction:column;gap:16px}
    .consist-row{display:flex;gap:10px;align-items:center;margin-bottom:10px}.consist-field{width:160px}
    .margin-row{padding:10px 0;border-bottom:1px solid #edf0f5}.margin-row.queued{background:#fef2f2;margin:0 -8px;padding:10px 8px;border-radius:6px}
    .margin-head{display:flex;gap:8px;align-items:baseline}.margin-head span{color:#475569;font-size:13px}
    .margin-bar{display:flex;gap:14px;font-size:12px;color:#667085;margin-top:4px}.margin-bar span:last-child{margin-left:auto}
    .margin-status{display:block;margin-top:4px;font-size:12px;color:#15803d}
  `],
})
export class WorkspaceComponent {
  private readonly store = inject(Store)
  readonly routes$ = this.store.select(selectRoutes)
  readonly queue$ = this.store.select(selectQueue)
  readonly loading$ = this.store.select(selectLoading)
  readonly version$ = this.store.select(selectVersion)
  readonly reviewCount$ = this.store.select(selectReviewCount)
  readonly reviewItems$ = this.store.select(selectReviewItems)
  readonly selectedRoute$ = this.store.select(selectSelectedRoute)
  margins$ = this.store.select(selectSectionMargins(''))

  readonly columns = ['id', 'cargo', 'consist', 'route', 'permission', 'score', 'action']
  selectedId = ''
  highRiskCount = 0
  missingPermissionCount = 0
  draftWagonCount = 0

  constructor() {
    this.store.select(selectRoutes).subscribe((routes) => {
      this.highRiskCount = routes.flatMap((route) => route.segments).filter((segment) => segment.level === '高').length
      this.missingPermissionCount = routes.filter((route) => route.permission !== '有效').length
    })
    this.store.select(selectSelectedRoute).subscribe((route) => {
      this.selectedId = route?.id ?? ''
      this.draftWagonCount = route?.wagonCount ?? 0
      this.margins$ = this.store.select(selectSectionMargins(this.selectedId))
    })
  }

  refresh() { this.store.dispatch(RouteActions.loadRoutes()) }
  select(row: RoutePackage) { this.store.dispatch(RouteActions.selectRoute({ id: row.id })) }
  createAlternative() { this.store.dispatch(RouteActions.commitOpRequest({ op: createOp('CREATE_ALTERNATIVE', { routeId: this.selectedId }) })) }

  commitConsist(route: RoutePackage) {
    const wagonCount = Math.max(1, Math.floor(this.draftWagonCount))
    const op = createOp('UPDATE_CONSIST', { routeId: route.id, wagonCount, tonnage: wagonCount * 66 })
    this.store.dispatch(RouteActions.commitOpRequest({ op }))
  }
}
