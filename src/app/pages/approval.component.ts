import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTabsModule } from '@angular/material/tabs'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatChipsModule } from '@angular/material/chips'
import * as RouteActions from '../store/route.actions'
import {
  selectComments,
  selectPendingOps,
  selectReviewItems,
  selectRoutes,
  selectSimulateFailure,
} from '../store/route.selectors'
import { createOp } from '../services/snapshot-logic'
import type { ReviewComment, RoutePackage } from '../types'
import { ReviewSummaryComponent } from '../components/review-summary.component'

@Component({
  selector: 'app-approval',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTabsModule, MatSlideToggleModule, MatChipsModule, ReviewSummaryComponent],
  template: `
    <main class="page">
      <div class="page-head"><div><p class="eyebrow">安全 · 运营 · 应急会签</p><h1>逐区段审批与退回</h1><p>限值或编组变更后相关会签立即失效，必须重新确认；所有写入按操作号恢复，不出现半份快照。</p></div><button mat-flat-button color="primary" (click)="lockBaseline()">确认并锁定基线</button></div>
      <mat-tab-group>
        <mat-tab label="待处理意见">
          <section class="card comment-list">
            @for (comment of comments$ | async; track comment.id) {
              <div class="comment" [class.invalidated]="comment.invalidated">
                <div class="comment-head">
                  <div><b>{{comment.role}} · {{comment.author}}</b><small>{{comment.routeId}} · {{comment.segmentId}} · {{comment.id}}</small></div>
                  <span class="status-wrap">
                    @if (comment.invalidated) { <mat-chip class="invalid-chip">已失效 · 需重新确认</mat-chip> }
                    <span>{{comment.status}}</span>
                  </span>
                </div>
                @if (comment.invalidated) { <p class="invalid-reason">{{comment.invalidReason}}</p> }
                <p>{{comment.content}}</p>
                <div class="actions">
                  <button mat-stroked-button color="warn" (click)="resolve(comment.id,'已退回')">退回补件</button>
                  <button mat-flat-button color="primary" (click)="resolve(comment.id,'已接受')">{{ comment.invalidated ? '重新确认' : '接受条件' }}</button>
                </div>
              </div>
            }
          </section>
        </mat-tab>
        <mat-tab label="发表区段意见">
          <section class="card form-card">
            <div class="two">
              <mat-form-field><mat-label>专业角色</mat-label><mat-select [(ngModel)]="role"><mat-option>安全</mat-option><mat-option>运营</mat-option><mat-option>应急</mat-option></mat-select></mat-form-field>
              <mat-form-field><mat-label>区段</mat-label><mat-select [(ngModel)]="segmentId"><mat-option *ngFor="let segment of segments" [value]="segment.id">{{segment.id}} · {{segment.name}}</mat-option></mat-select></mat-form-field>
            </div>
            <mat-form-field class="wide"><mat-label>审批条件与依据</mat-label><textarea matInput rows="5" [(ngModel)]="content" placeholder="明确区段、约束、时限与验收证据"></textarea></mat-form-field>
            <button mat-flat-button color="primary" [disabled]="!content.trim()" (click)="addComment()">提交意见</button>
          </section>
        </mat-tab>
        <mat-tab label="写入与恢复">
          <section class="card ops-card">
            <div class="ops-head">
              <div><h2>写操作日志</h2><p>每份写入有操作号；失败或冲突时快照不变，可按操作号恢复。</p></div>
              <mat-slide-toggle [checked]="simulateFailure$ | async" (change)="toggleSimulate($event.checked)">演练：写入失败</mat-slide-toggle>
            </div>
            @if ((pendingOps$ | async)?.length === 0) { <p class="empty">暂无写操作</p> }
            @for (op of pendingOps$ | async; track op.opId) {
              <div class="op" [class.op-failed]="op.status==='写入失败'" [class.op-conflict]="op.status==='冲突'">
                <div class="op-head"><b>{{ op.opId }}</b><mat-chip [class]="statusClass(op.status)">{{ op.status }}</mat-chip></div>
                <small>{{ op.type }} · {{ op.createdAt }} · 尝试 {{ op.attempts }} 次</small>
                @if (op.error) { <p class="op-error">失败原因：{{ op.error }}</p> }
                @if (op.conflictReason) { <p class="op-error">冲突原因：{{ op.conflictReason }}</p> }
                @if (op.status === '写入失败' || op.status === '冲突') {
                  <div class="op-actions">
                    <button mat-flat-button color="primary" (click)="recover(op.opId)">按操作号恢复</button>
                    <button mat-stroked-button (click)="discard(op.opId)">放弃草稿</button>
                  </div>
                }
              </div>
            }
          </section>
        </mat-tab>
        <mat-tab label="审计时间线">
          <section class="card timeline">
            <div><i></i><b>16:42 · 韩洁新增 S-203 限速与吸附物资要求</b><p>安全专业 · 修改前记录保留</p></div>
            <div><i></i><b>16:18 · 罗晋接受隧道出口监护条件</b><p>应急专业 · 审批意见已签章</p></div>
            <div><i></i><b>15:50 · 系统生成替代路径 R-ALT-02</b><p>规则引擎 · 风险分由 78 降至 71</p></div>
          </section>
        </mat-tab>
      </mat-tab-group>
      <app-review-summary [items]="(reviewItems$ | async) || []" />
    </main>
  `,
  styles: [`
    h2{margin:0 0 4px;font-size:16px}.comment-list{padding:0}.comment{padding:18px;border-bottom:1px solid #e7ebf1}.comment.invalidated{background:#fef2f2}.comment-head{display:flex;justify-content:space-between;gap:10}.comment-head small{display:block;color:#7a8798;margin-top:4px}.comment p{color:#475569}.invalid-reason{color:#b91c1c;font-size:13px;margin:6px 0}.status-wrap{display:flex;align-items:center;gap:8px}.invalid-chip{background:#fecaca !important;color:#991b1b !important;font-size:11px}.actions{display:flex;gap:10px}.actions button{margin:8px 8px 0 0}.form-card{max-width:780px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.two mat-form-field,.wide{width:100%}
    .ops-card{padding:16px}.ops-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}.ops-head p{color:#7a8798;font-size:12px;margin:4px 0 0}.empty{color:#7a8798}
    .op{border:1px solid #e1e7ef;border-radius:6px;padding:12px;margin-bottom:10px}.op-failed{border-color:#fca5a5;background:#fef2f2}.op-conflict{border-color:#fcd34d;background:#fffbeb}.op-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.op small{color:#7a8798}.op-error{color:#b91c1c;font-size:12px;margin:6px 0 0}.op-actions{display:flex;gap:8px;margin-top:8px}.op-actions button{font-size:12px}
    .timeline{padding:8px 18px}.timeline>div{position:relative;padding:14px 10px 14px 28px;border-left:2px solid #cbd5e1}.timeline i{position:absolute;width:9px;height:9px;border-radius:50%;background:#2563eb;left:-5.5px;top:20px}.timeline p{color:#7a8798;margin:5px 0 0}
    .chip-ok{background:#bbf7d0 !important;color:#166534 !important}.chip-fail{background:#fecaca !important;color:#991b1b !important}.chip-conflict{background:#fde68a !important;color:#92400e !important}.chip-pending{background:#e2e8f0 !important;color:#475569 !important}
    @media(max-width:620px){.two{grid-template-columns:1fr}}
  `],
})
export class ApprovalComponent {
  private readonly store = inject(Store)
  readonly comments$ = this.store.select(selectComments)
  readonly pendingOps$ = this.store.select(selectPendingOps)
  readonly reviewItems$ = this.store.select(selectReviewItems)
  readonly simulateFailure$ = this.store.select(selectSimulateFailure)

  role = '安全'
  segmentId = 'S-203'
  content = ''
  segments: RoutePackage['segments'] = []

  constructor() {
    this.store.select(selectRoutes).subscribe((routes) => {
      this.segments = routes.flatMap((route) => route.segments)
      if (!this.segments.some((segment) => segment.id === this.segmentId)) this.segmentId = this.segments[0]?.id ?? ''
    })
  }

  addComment() {
    const routeId = this.segments.find((segment) => segment.id === this.segmentId)?.id ?? ''
    const comment: ReviewComment = {
      id: `RV-${Date.now().toString().slice(-4)}`,
      routeId,
      segmentId: this.segmentId,
      role: this.role,
      author: '当前审阅人',
      content: this.content,
      status: '待确认',
    }
    this.store.dispatch(RouteActions.commitOpRequest({ op: createOp('ADD_COMMENT', { comment }) }))
    this.content = ''
  }

  resolve(id: string, status: '已接受' | '已退回') {
    this.store.dispatch(RouteActions.commitOpRequest({ op: createOp('RESOLVE_COMMENT', { commentId: id, status }) }))
  }

  recover(opId: string) { this.store.dispatch(RouteActions.recoverOp({ opId })) }
  discard(opId: string) { this.store.dispatch(RouteActions.discardOp({ opId })) }
  toggleSimulate(on: boolean) { this.store.dispatch(RouteActions.setSimulateFailure({ on })) }

  statusClass(status: string): string {
    return status === '已写入' ? 'chip-ok' : status === '写入失败' ? 'chip-fail' : status === '冲突' ? 'chip-conflict' : 'chip-pending'
  }

  lockBaseline() { alert('基线已锁定：审批意见、路径版本和原始附件将只读保存。') }
}
