import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { MatButtonModule } from '@angular/material/button'
import { MatSelectModule } from '@angular/material/select'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDividerModule } from '@angular/material/divider'
import maplibregl, { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl'
import { length, lineString } from '@turf/turf'
import type { RoutePackage, RiskSegment, Section } from '../types'
import type { RouteState } from '../store/route.reducer'
import * as RouteActions from '../store/route.actions'
import {
  selectDrafts,
  selectFailedOps,
  selectQueue,
  selectReviewItems,
  selectRoutes,
  selectSections,
  selectSelectedRoute,
  selectSelectedSegmentId,
} from '../store/route.selectors'
import { createOp } from '../services/snapshot-logic'
import { ReviewSummaryComponent } from '../components/review-summary.component'

@Component({
  selector: 'app-risk-map',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatSelectModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatDividerModule, ReviewSummaryComponent],
  template: `
    <main class="page">
      <div class="page-head"><div><p class="eyebrow">地理风险叠加</p><h1>路网与风险图层复核</h1><p>逐区段登记最大编组容量，超限运输单进入排队；容量或编组变更后相关会签立即失效。</p></div><button mat-stroked-button (click)="fitRoute()">定位整条路径</button></div>
      @if (failedOps.length > 0) { <div class="op-banner">有 {{ failedOps.length }} 项写入失败或冲突，快照未变更，请到审批页按操作号恢复。</div> }
      <div class="toolbar">
        <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>运输单</mat-label><mat-select [ngModel]="selectedRouteId" (ngModelChange)="selectRoute($event)">@for (route of routes; track route.id) { <mat-option [value]="route.id">{{route.id}} · {{route.trainCode}}</mat-option> }</mat-select></mat-form-field>
        <mat-checkbox [(ngModel)]="layers.tunnel" (change)="refreshLayers()">隧道</mat-checkbox><mat-checkbox [(ngModel)]="layers.bridge" (change)="refreshLayers()">桥梁</mat-checkbox><mat-checkbox [(ngModel)]="layers.water" (change)="refreshLayers()">水源地</mat-checkbox><mat-checkbox [(ngModel)]="layers.population" (change)="refreshLayers()">人口密集区</mat-checkbox>
      </div>
      <div class="grid-2">
        <div #mapEl class="map"></div>
        <aside class="card">
          <div class="panel-head"><div><h2>区段容量与风险清单</h2><p>已按风险等级排序 · 共 {{ queue.length }} 单排队</p></div><strong [class.risk-high]="selectedRoute !== undefined && selectedRoute.score >= 70">总风险 {{selectedRoute?.score}}</strong></div>
          @for (segment of selectedRoute?.segments || []; track segment.id) {
            <div class="segment" [class.active]="segment.id === selectedSegmentId" (click)="selectSegment(segment)">
              <span class="seg-body">
                <b>{{segment.name}}</b>
                <small>{{segment.from}} → {{segment.to}} · {{segment.km}} km · {{segment.speed}}</small>
                <em>{{segment.risks.join(' / ')}}</em>
                <span class="capacity-line" (click)="$event.stopPropagation()">
                  <label>容量</label>
                  <input matInput type="number" min="1" [ngModel]="draftCapacity(sectionOf(segment))" (ngModelChange)="setDraft(sectionOf(segment), $event)" />
                  <label>辆</label>
                  <span class="version">v{{ sectionOf(segment).version }}</span>
                  <button mat-button color="primary" (click)="saveCapacity(sectionOf(segment))">保存</button>
                  <button mat-button (click)="simulateConcurrent(sectionOf(segment))" title="模拟另一名调度员基于同一基线抢先提交">模拟抢先</button>
                </span>
                @if (isQueued(segment)) { <small class="queue-badge">⚠ 编组超出容量 · 排队中</small> }
                @if (conflictFor(sectionOf(segment)); as conflict) { <small class="conflict-badge">冲突（草稿已保留）：{{ conflict.conflictReason }} <button mat-button color="primary" (click)="refreshDraft(sectionOf(segment))">刷新基线</button></small> }
              </span>
              <strong [class.risk-high]="segment.level==='高'" [class.risk-mid]="segment.level==='中'" [class.risk-low]="segment.level==='低'">{{segment.level}}</strong>
            </div>
          }
          <mat-divider />
          <h3>路径测算</h3><p>实测里程：{{routeLength}} km</p><p>预计运行：{{estimatedTime}}</p><p>限制区段：{{restrictedCount}} 处</p>
          <button mat-flat-button color="primary" style="width:100%" (click)="requireAlternative()">要求补充绕行方案</button>
        </aside>
      </div>
      <app-review-summary [items]="(reviewItems$ | async) || []" />
    </main>
  `,
  styles: [`
    h2,h3{margin:0 0 10px}.panel-head{display:flex;justify-content:space-between}.segment{display:flex;justify-content:space-between;text-align:left;gap:10px;padding:13px;margin:6px 0;border:1px solid #e1e7ef;background:#fff;border-radius:6px;color:inherit;cursor:pointer}
    .segment.active{border-color:#2563eb;background:#f5f8ff}.segment b,.segment small,.segment em{display:block}.segment small{color:#7a8798;margin:4px 0}.segment em{font-size:12px;color:#475569;font-style:normal}
    .seg-body{min-width:0;flex:1}.capacity-line{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap}.capacity-line label{font-size:12px;color:#667085}.capacity-line input{width:64px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px}.capacity-line .version{font-size:11px;color:#94a3b8}.capacity-line button{font-size:12px;line-height:1.2}
    .queue-badge{display:block;margin-top:6px;color:#b45309;font-weight:700}.conflict-badge{display:block;margin-top:6px;color:#b91c1c;font-size:12px}.conflict-badge button{font-size:12px}
    .op-banner{background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:13px}
    .review-panel{margin-top:16px}
  `],
})
export class RiskMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>
  private readonly store = inject(Store)
  readonly reviewItems$ = this.store.select(selectReviewItems)
  private map?: MapLibreMap
  routes: RoutePackage[] = []
  sections: Section[] = []
  queue: RouteState['queue'] = []
  drafts: Record<string, { capacity: number; baseVersion: number }> = {}
  failedOps: RouteState['pendingOps'] = []
  selectedRoute: RoutePackage | undefined
  selectedRouteId = ''
  selectedSegmentId = ''
  layers = { tunnel: true, bridge: true, water: true, population: true }

  constructor() {
    this.store.select(selectRoutes).subscribe((routes) => { this.routes = routes; this.syncSelectedRoute(); if (this.map) this.drawRoute() })
    this.store.select(selectSections).subscribe((sections) => (this.sections = sections))
    this.store.select(selectQueue).subscribe((queue) => (this.queue = queue))
    this.store.select(selectDrafts).subscribe((drafts) => (this.drafts = drafts))
    this.store.select(selectFailedOps).subscribe((ops) => (this.failedOps = ops))
    this.store.select(selectSelectedRoute).subscribe((route) => { this.selectedRoute = route; this.selectedRouteId = route?.id ?? ''; if (this.map) this.drawRoute() })
    this.store.select(selectSelectedSegmentId).subscribe((id) => (this.selectedSegmentId = id))
  }

  private syncSelectedRoute() {
    if (!this.selectedRoute && this.routes.length) this.selectedRoute = this.routes[0]
  }

  get routeLength() { return this.selectedRoute ? length(lineString(this.selectedRoute.segments.flatMap((segment) => segment.coordinates)), { units: 'kilometers' }).toFixed(1) : '0.0' }
  get estimatedTime() { return `${Math.round(Number(this.routeLength) / 55 * 60 + this.restrictedCount * 8)} 分钟` }
  get restrictedCount() { return this.selectedRoute?.segments.filter((segment) => segment.status === '需绕行').length ?? 0 }

  ngAfterViewInit() {
    this.map = new maplibregl.Map({
      container: this.mapEl.nativeElement,
      style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
      center: [112.2, 34.5], zoom: 5,
    })
    this.map.addControl(new maplibregl.NavigationControl(), 'top-right')
    this.map.on('load', () => { this.addRiskLayers(); this.drawRoute() })
  }
  ngOnDestroy() { this.map?.remove() }

  selectRoute(id: string) { this.store.dispatch(RouteActions.selectRoute({ id })) }
  selectSegment(segment: RiskSegment) { this.store.dispatch(RouteActions.selectSegment({ id: segment.id })); this.map?.flyTo({ center: segment.coordinates[0], zoom: 8 }) }
  requireAlternative() { this.store.dispatch(RouteActions.commitOpRequest({ op: createOp('CREATE_ALTERNATIVE', { routeId: this.selectedRouteId }) })) }
  fitRoute() { if (!this.map || !this.selectedRoute) return; const bounds = new LngLatBounds(); this.selectedRoute.segments.flatMap((segment) => segment.coordinates).forEach((point) => bounds.extend(point)); this.map.fitBounds(bounds, { padding: 50 }) }
  refreshLayers() { for (const [id, visible] of Object.entries(this.layers)) { if (this.map?.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') } }

  sectionOf(segment: RiskSegment): Section {
    return this.sections.find((section) => section.id === segment.sectionId) ?? { id: segment.sectionId, name: segment.name, capacity: 0, version: 0 }
  }
  draftCapacity(section: Section): number {
    return this.drafts[section.id]?.capacity ?? section.capacity
  }
  setDraft(section: Section, capacity: number) {
    this.store.dispatch(RouteActions.setSectionDraft({ sectionId: section.id, capacity: Number(capacity) || 0, baseVersion: section.version }))
  }
  saveCapacity(section: Section) {
    const draft = this.drafts[section.id]
    const capacity = draft?.capacity ?? section.capacity
    // 以草稿记录的基线版本提交：基线已变则触发乐观并发冲突（先到者生效）
    const baseVersion = draft?.baseVersion ?? section.version
    this.store.dispatch(RouteActions.commitOpRequest({ op: createOp('UPDATE_SECTION', { sectionId: section.id, capacity }, baseVersion) }))
  }
  /** 演示：另一名调度员基于同一基线抢先提交（先到者生效） */
  simulateConcurrent(section: Section) {
    this.store.dispatch(RouteActions.commitOpRequest({ op: createOp('UPDATE_SECTION', { sectionId: section.id, capacity: section.capacity + 8 }, section.version) }))
  }
  refreshDraft(section: Section) {
    this.store.dispatch(RouteActions.clearSectionDraft({ sectionId: section.id }))
    const conflict = this.conflictFor(section)
    if (conflict) this.store.dispatch(RouteActions.discardOp({ opId: conflict.opId }))
  }
  isQueued(segment: RiskSegment): boolean {
    return this.queue.some((entry) => entry.routeId === this.selectedRouteId && entry.sectionId === segment.sectionId)
  }
  conflictFor(section: Section) {
    return this.failedOps.find((op) => op.type === 'UPDATE_SECTION' && op.status === '冲突' && op.payload.sectionId === section.id)
  }

  private addRiskLayers() {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [
      { type: 'Feature', properties: { kind: 'tunnel' }, geometry: { type: 'Point', coordinates: [114.3, 35.2] } },
      { type: 'Feature', properties: { kind: 'bridge' }, geometry: { type: 'Point', coordinates: [116.1, 34.2] } },
      { type: 'Feature', properties: { kind: 'water' }, geometry: { type: 'Point', coordinates: [110.4, 34.8] } },
      { type: 'Feature', properties: { kind: 'population' }, geometry: { type: 'Point', coordinates: [118.0, 35.8] } },
    ]
    const colors: Record<string, string> = { tunnel: '#4f46e5', bridge: '#d97706', water: '#0891b2', population: '#dc2626' }
    Object.entries(colors).forEach(([kind, color]) => {
      this.map?.addSource(kind, { type: 'geojson', data: { type: 'FeatureCollection', features: features.filter((feature) => feature.properties?.['kind'] === kind) } })
      this.map?.addLayer({ id: kind, type: 'circle', source: kind, paint: { 'circle-radius': 10, 'circle-color': color, 'circle-opacity': .75, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
    })
  }
  private drawRoute() {
    if (!this.map?.isStyleLoaded() || !this.selectedRoute) return
    if (this.map.getLayer('route-line')) { this.map.removeLayer('route-line'); this.map.removeSource('route') }
    this.map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: this.selectedRoute.segments.map((segment) => segment.coordinates) } } })
    this.map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': .9 } })
  }
}
