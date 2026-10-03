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
import { RouteState, initialState } from '../store/route.reducer'
import * as RouteActions from '../store/route.actions'
import { selectQueuedOrders, selectSegmentMargins } from '../store/route.selectors'
import type { QueuedOrderView, SegmentMarginView } from '../store/route.selectors'
import { PendingReviewStripComponent } from '../components/pending-review-strip.component'
import { SnapshotPersistenceService } from '../services/snapshot-persistence.service'
import type { RiskSegment, RoutePackage } from '../types'

interface CapacitySeat {
  label: string
  actor: string
  segmentId: string
  /** 后到者未生效的草稿保留在输入框里 */
  draft: number | null
  /** 开始编辑时捕获的限值版本，先到者生效判定依据 */
  baseVersion: number
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, MatDividerModule, PendingReviewStripComponent],
  template: `
    <main class="page">
      <div class="page-head"><div><p class="eyebrow">运输许可与路径编组</p><h1>危险货物运输路径审批</h1><p>核对货物类别、编组、许可与区段约束，生成可比较的候选路径。</p></div><div><button mat-stroked-button (click)="createAlternative()">生成替代方案</button> <button mat-flat-button color="primary" (click)="refresh()">重新校验</button></div></div>
      <app-pending-review-strip />
      @if (snapshot.error) { <div class="banner error"><b>数据加载失败</b><p>{{ snapshot.error }}</p></div> }
      @if (snapshot.lastRecovery) { <div class="banner recovery"><b>快照恢复</b><p>{{ snapshot.lastRecovery }}</p></div> }
      @if (snapshot.conflict; as conflict) {
        <div class="banner conflict"><div><b>限值冲突 · {{ conflict.segmentId }} · 草稿已保留</b><p>{{ conflict.reason }}</p></div><button mat-stroked-button (click)="dismissConflict()">知道了</button></div>
      }
      <div class="grid-4">
        <article class="card metric"><span>待审批路径</span><strong>{{ snapshot.routes.length }}</strong><small>今日新增 2 条</small></article>
        <article class="card metric"><span>高风险区段</span><strong class="risk-high">{{ highRiskCount }}</strong><small>需安全与应急会签</small></article>
        <article class="card metric"><span>排队运输单</span><strong class="risk-mid">{{ queued.length }}</strong><small>编组超出区段限值</small></article>
        <article class="card metric"><span>当前快照</span><strong>v{{ snapshot.version }}</strong><small>操作号 OP-{{ snapshot.opSeq }} · 修改均入审计</small></article>
      </div>
      @if (snapshot.loading) { <mat-progress-bar mode="indeterminate" /> }
      <div class="grid-2">
        <section class="stack">
          <div class="card table-wrap">
            <div class="toolbar"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>货物类别</mat-label><mat-select><mat-option>全部类别</mat-option><mat-option>第 3 类 易燃液体</mat-option><mat-option>第 8 类 腐蚀品</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>审批状态</mat-label><mat-select><mat-option>全部状态</mat-option><mat-option>待安全复核</mat-option><mat-option>待应急复核</mat-option></mat-select></mat-form-field><span class="spacer"></span><button mat-stroked-button>导出审批包</button></div>
            <table mat-table [dataSource]="snapshot.routes">
              <ng-container matColumnDef="id"><th mat-header-cell *matHeaderCellDef>运输单</th><td mat-cell *matCellDef="let row"><b>{{row.id}}</b><small class="block">{{row.updatedAt}}</small></td></ng-container>
              <ng-container matColumnDef="cargo"><th mat-header-cell *matHeaderCellDef>货物 / 车次</th><td mat-cell *matCellDef="let row"><b>{{row.cargo}}</b><small class="block">{{row.hazardClass}} · {{row.trainCode}}</small></td></ng-container>
              <ng-container matColumnDef="route"><th mat-header-cell *matHeaderCellDef>起终点</th><td mat-cell *matCellDef="let row">{{row.origin}} → {{row.destination}}</td></ng-container>
              <ng-container matColumnDef="marshalling"><th mat-header-cell *matHeaderCellDef>编组</th><td mat-cell *matCellDef="let row"><b>{{row.wagonCount}}</b> 辆</td></ng-container>
              <ng-container matColumnDef="passage"><th mat-header-cell *matHeaderCellDef>通行状态</th><td mat-cell *matCellDef="let row"><span [class.risk-mid]="queuedMap[row.id] !== undefined" [class.risk-low]="queuedMap[row.id] === undefined">{{ passageLabel(row.id) }}</span></td></ng-container>
              <ng-container matColumnDef="permission"><th mat-header-cell *matHeaderCellDef>许可</th><td mat-cell *matCellDef="let row"><span [class.risk-high]="row.permission!=='有效'">{{row.permission}}</span></td></ng-container>
              <ng-container matColumnDef="score"><th mat-header-cell *matHeaderCellDef>风险分</th><td mat-cell *matCellDef="let row"><b [class.risk-high]="row.score>=70" [class.risk-mid]="row.score>=45 && row.score<70">{{row.score}}</b> / 100</td></ng-container>
              <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button color="primary" (click)="select(row)">审核</button></td></ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected-row]="row.id === snapshot.selectedRouteId"></tr>
            </table>
          </div>
          <div class="card">
            <h2>运输单编组调整</h2>
            <div class="form-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>运输单</mat-label><mat-select [(ngModel)]="marshallingRouteId">@for (route of snapshot.routes; track route.id) { <mat-option [value]="route.id">{{ route.id }} · {{ route.trainCode }}（现 {{ route.wagonCount }} 辆）</mat-option> }</mat-select></mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>新编组（辆）</mat-label><input matInput type="number" min="1" [(ngModel)]="marshallingDraft"></mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>当前席位</mat-label><mat-select [(ngModel)]="seatActor"><mat-option value="调度甲">调度甲</mat-option><mat-option value="调度乙">调度乙</mat-option></mat-select></mat-form-field>
              <button mat-flat-button color="primary" (click)="submitMarshalling()">提交编组</button>
            </div>
            <p class="hint">编组变更后逐段重算余量，超容量区段自动进入排队，相关会签立即失效并等待重新确认。</p>
          </div>
          <div class="card">
            <h2>区段通行能力登记 <small class="h-note">两席可同时登记同一区段，先到者生效，后到者保留草稿与冲突原因</small></h2>
            <div class="seats">
              @for (seat of seats; track seat.label) {
                <div class="seat">
                  <div class="seat-head"><b>{{ seat.label }}</b><span>{{ capacityLabel(seat.segmentId) }}</span></div>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>调度员</mat-label><input matInput [(ngModel)]="seat.actor"></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>区段</mat-label><mat-select [(ngModel)]="seat.segmentId" (ngModelChange)="captureBase(seat)">@for (segment of allSegments; track segment.id) { <mat-option [value]="segment.id">{{ segment.id }} · {{ segment.name }}</mat-option> }</mat-select></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>最大编组（辆）</mat-label><input matInput type="number" min="1" [(ngModel)]="seat.draft" (focus)="captureBase(seat)"></mat-form-field>
                  <div class="seat-foot"><small>登记基线 v{{ seat.baseVersion }}</small><button mat-stroked-button color="primary" (click)="submitCapacity(seat)">登记限值</button></div>
                </div>
              }
            </div>
          </div>
        </section>
        <aside class="stack">
          <div class="card">
            <h2>区段通行余量 · {{ snapshot.selectedRouteId || '—' }}</h2>
            @for (margin of selectedMargins; track margin.segmentId) {
              <div class="margin-row">
                <div><b>{{ margin.segmentId }} · {{ margin.segmentName }}</b><small>限值 {{ margin.capacity === null ? '未登记' : margin.capacity + ' 辆' }} · 当前编组 {{ margin.wagonCount }} 辆</small></div>
                <strong [class.risk-high]="margin.over" [class.risk-low]="!margin.over && margin.margin !== null">{{ marginLabel(margin) }}</strong>
              </div>
            }
            @if (!selectedMargins.length) { <p>请选择运输单查看逐段余量。</p> }
          </div>
          <div class="card">
            <h2>排队运输单</h2>
            @if (!queued.length) { <p>当前无排队运输单，各区段余量充足。</p> }
            @for (order of queued; track order.routeId) {
              <div class="queue-item">
                <b>{{ order.routeId }} · {{ order.trainCode }}</b><small>{{ order.cargo }}</small>
                @for (block of order.blocks; track block.segmentId) {
                  <p class="risk-mid">在 {{ block.segmentId }}（{{ block.segmentName }}）超编 {{ block.overBy }} 辆，等待限值调整或减编</p>
                }
              </div>
            }
          </div>
          <div class="card">
            <h2>规则引擎结论</h2>
            @for (route of snapshot.routes; track route.id) {
              <div class="rule" [class.active]="route.id === snapshot.selectedRouteId"><div><b>{{route.trainCode}}</b><span>{{route.segments.length}} 个运行区段</span></div><strong [class.risk-high]="route.score >= 70" [class.risk-mid]="route.score < 70">{{route.score >= 70 ? '高风险' : '需复核' }}</strong></div>
            }
            <mat-divider />
            <h3>强制校验项</h3>
            <p>✓ 罐车编组隔离与押运资质</p><p class="risk-high">! S-203 水源地保护段缺少属地放行函</p><p>✓ 替代路径具备接卸条件</p>
            <button mat-flat-button color="primary" style="width:100%" (click)="createAlternative()">要求补充替代方案</button>
          </div>
          <div class="card">
            <h2>操作日志 <small class="h-note">按操作号审计 · 写入失败按操作号恢复</small></h2>
            <div class="journal">
              @for (entry of snapshot.journal; track entry.op) {
                <div class="op">
                  <span class="op-no">OP-{{ entry.op }}</span>
                  <div class="op-body"><b>{{ entry.at }} · {{ entry.actor }} · {{ entry.action }}</b><p>{{ entry.detail }}</p></div>
                  <span class="op-status" [class.rolled]="entry.status === '已回滚'" [class.rejected]="entry.status === '未生效'">{{ entry.status }}</span>
                </div>
              }
              @if (!snapshot.journal.length) { <p>暂无操作记录。</p> }
            </div>
            <button mat-stroked-button color="warn" (click)="drill()">{{ drillArmed ? '演练已待命：下一次写入将失败' : '演练：模拟下次写入失败' }}</button>
          </div>
        </aside>
      </div>
    </main>
  `,
  styles: [`
    h2,h3{margin:0 0 12px}.h-note{font-size:12px;color:#7a8798;font-weight:400;margin-left:8px}
    .stack>*+*{margin-top:16px}.table-wrap{overflow:auto}.block{display:block;color:#7a8798;margin-top:3px}.selected-row{background:#eff6ff}
    .rule{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #edf0f5}.rule span{display:block;color:#7a8798;font-size:12px;margin-top:4px}.rule.active{padding-left:10px;border-left:3px solid #2563eb}.rule strong{font-size:12px}
    .toolbar{margin-bottom:10px}.toolbar mat-form-field{width:160px}
    .banner{display:flex;justify-content:space-between;align-items:center;gap:12px;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px}
    .banner p{margin:4px 0 0;color:#475569}.banner b{display:block}
    .banner.recovery{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
    .banner.conflict{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .banner.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;display:block}
    .form-row{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:12px;align-items:center}
    .hint{color:#7a8798;font-size:12px;margin:8px 0 0}
    .seats{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .seat{border:1px solid #e1e7ef;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}
    .seat-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.seat-head span{font-size:12px;color:#7a8798}
    .seat-foot{display:flex;justify-content:space-between;align-items:center}.seat-foot small{color:#7a8798}
    .margin-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #edf0f5}
    .margin-row small{display:block;color:#7a8798;margin-top:3px}.margin-row strong{font-size:13px}
    .queue-item{padding:10px 0;border-bottom:1px solid #edf0f5}.queue-item small{display:block;color:#7a8798;margin:3px 0}.queue-item p{margin:4px 0 0;font-size:13px}
    .journal{max-height:300px;overflow:auto;margin-bottom:12px}
    .op{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #edf0f5}
    .op-no{font-family:monospace;font-size:12px;background:#eef2ff;color:#3730a3;border-radius:4px;padding:2px 6px;white-space:nowrap}
    .op-body{flex:1}.op-body b{font-size:13px}.op-body p{margin:2px 0 0;font-size:12px;color:#667085}
    .op-status{font-size:12px;color:#15803d;white-space:nowrap}.op-status.rolled{color:#b91c1c}.op-status.rejected{color:#b45309}
    @media(max-width:900px){.seats{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}}
  `],
})
export class WorkspaceComponent {
  private readonly store = inject(Store<{ routes: RouteState }>)
  private readonly persistence = inject(SnapshotPersistenceService)
  readonly columns = ['id', 'cargo', 'route', 'marshalling', 'passage', 'permission', 'score', 'action']
  snapshot: RouteState = initialState
  allSegments: RiskSegment[] = []
  queued: QueuedOrderView[] = []
  queuedMap: Record<string, QueuedOrderView> = {}
  selectedMargins: SegmentMarginView[] = []
  highRiskCount = 0
  seatActor = '调度甲'
  marshallingRouteId = ''
  marshallingDraft: number | null = null
  drillArmed = false
  readonly seats: CapacitySeat[] = [
    { label: '登记席 A', actor: '调度甲', segmentId: '', draft: null, baseVersion: 0 },
    { label: '登记席 B', actor: '调度乙', segmentId: '', draft: null, baseVersion: 0 },
  ]
  private margins: SegmentMarginView[] = []

  constructor() {
    this.store.select('routes').subscribe((state) => {
      this.snapshot = state
      this.allSegments = state.routes.flatMap((route: RoutePackage) => route.segments)
      this.highRiskCount = this.allSegments.filter((segment) => segment.level === '高').length
      if (!this.marshallingRouteId && state.routes.length) this.marshallingRouteId = state.selectedRouteId || state.routes[0].id
      for (const seat of this.seats) {
        if (!seat.segmentId && this.allSegments.length) {
          seat.segmentId = this.allSegments.find((segment) => segment.id === 'S-203')?.id ?? this.allSegments[0].id
          this.captureBase(seat)
        }
      }
      if (state.lastRecovery) this.drillArmed = false
      this.updateSelectedMargins()
    })
    this.store.select(selectQueuedOrders).subscribe((queued) => {
      this.queued = queued
      this.queuedMap = Object.fromEntries(queued.map((order) => [order.routeId, order]))
    })
    this.store.select(selectSegmentMargins).subscribe((margins) => {
      this.margins = margins
      this.updateSelectedMargins()
    })
  }

  refresh() { this.store.dispatch(RouteActions.loadRoutes()) }
  select(row: RoutePackage) { this.store.dispatch(RouteActions.selectRoute({ id: row.id })) }
  createAlternative() { this.store.dispatch(RouteActions.createAlternative()) }
  dismissConflict() { this.store.dispatch(RouteActions.dismissConflict()) }
  drill() { this.persistence.armFailureDrill(); this.drillArmed = true }

  captureBase(seat: CapacitySeat) {
    seat.baseVersion = this.snapshot.capacities[seat.segmentId]?.version ?? 0
  }

  submitCapacity(seat: CapacitySeat) {
    if (seat.draft === null || seat.draft < 1 || !seat.segmentId) return
    this.store.dispatch(RouteActions.updateSectionCapacity({ segmentId: seat.segmentId, maxWagons: seat.draft, baseVersion: seat.baseVersion, actor: seat.actor.trim() || seat.label }))
  }

  submitMarshalling() {
    if (!this.marshallingRouteId || this.marshallingDraft === null || this.marshallingDraft < 1) return
    this.store.dispatch(RouteActions.updateMarshalling({ routeId: this.marshallingRouteId, wagonCount: this.marshallingDraft, actor: this.seatActor }))
  }

  capacityLabel(segmentId: string) {
    const capacity = this.snapshot.capacities[segmentId]
    return capacity ? `当前登记 ${capacity.maxWagons} 辆 · v${capacity.version} · ${capacity.updatedBy} ${capacity.updatedAt}` : '未登记'
  }

  marginLabel(margin: SegmentMarginView) {
    if (margin.margin === null) return '限值未登记'
    return margin.over ? `超 ${-margin.margin} 辆 · 排队` : `余量 ${margin.margin} 辆`
  }

  passageLabel(routeId: string) {
    const queued = this.queuedMap[routeId]
    if (!queued) return '可通行'
    return `排队中（${queued.blocks.map((block) => `${block.segmentId} 超 ${block.overBy} 辆`).join('、')}）`
  }

  private updateSelectedMargins() {
    this.selectedMargins = this.margins.filter((margin) => margin.routeId === this.snapshot.selectedRouteId)
  }
}
