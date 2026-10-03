import { Component, OnInit, inject } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { Store } from '@ngrx/store'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatButtonModule } from '@angular/material/button'
import { MatChipsModule } from '@angular/material/chips'
import { AsyncPipe } from '@angular/common'
import * as RouteActions from './store/route.actions'
import { selectError, selectLoading, selectPendingActionCount } from './store/route.selectors'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatChipsModule, AsyncPipe],
  template: `
    <mat-toolbar class="topbar">
      <div class="brand"><span>铁</span><div><b>危险货物运输审批台</b><small>RAIL HAZMAT CONTROL</small></div></div>
      <nav><a mat-button routerLink="/workspace" routerLinkActive="active">路径编组</a><a mat-button routerLink="/risk-map" routerLinkActive="active">风险地图</a><a mat-button routerLink="/approval" routerLinkActive="active">多角色审批</a></nav>
      <span class="spacer"></span>
      @if (pendingCount$ | async; as pendingCount) { @if (pendingCount > 0) { <mat-chip highlighted class="op-chip">{{ pendingCount }} 项写入待处理</mat-chip> } }
      <mat-chip highlighted>协同在线 8</mat-chip><button mat-flat-button color="primary">提交审批</button>
    </mat-toolbar>
    @if (error$ | async; as error) { @if (error) { <div class="banner">快照读取失败：{{ error }}（已显示本地快照，可在审批页按操作号恢复）</div> } }
    @if (loading$ | async) { <div class="loading-bar"></div> }
    <router-outlet />
  `,
  styles: [`
    .topbar{height:68px;background:#0f172a;color:#fff;padding:0 22px;position:sticky;top:0;z-index:700}
    .brand{display:flex;align-items:center;gap:11px;min-width:260px}.brand>span{width:36px;height:36px;border-radius:7px;background:#2563eb;display:grid;place-items:center;font-weight:800}.brand b,.brand small{display:block}.brand small{font-size:9px;color:#94a3b8;letter-spacing:1px;margin-top:2px}
    nav{display:flex;gap:4px}nav a{color:#cbd5e1}nav a.active{background:#1e293b;color:#fff}
    .op-chip{background:#b45309 !important;color:#fff !important}
    .banner{background:#fef3c7;color:#92400e;padding:10px 22px;font-size:13px;border-bottom:1px solid #fcd34d}
    .loading-bar{height:2px;background:#2563eb;width:100%;animation:slide 1s ease-in-out infinite}
    @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
    @media(max-width:900px){.topbar{height:auto;min-height:64px;padding:10px;flex-wrap:wrap}.brand{min-width:210px}nav{order:3;width:100%}.brand small,.topbar mat-chip{display:none}}
  `],
})
export class AppComponent implements OnInit {
  private readonly store = inject(Store)
  readonly loading$ = this.store.select(selectLoading)
  readonly error$ = this.store.select(selectError)
  readonly pendingCount$ = this.store.select(selectPendingActionCount)

  ngOnInit() {
    // 首次打开（新电脑）即在根节点加载快照，任意路由都不空白
    this.store.dispatch(RouteActions.loadRoutes())
  }
}
