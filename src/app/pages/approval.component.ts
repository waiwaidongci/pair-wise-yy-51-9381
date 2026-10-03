import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTabsModule } from '@angular/material/tabs'
import { RouteState, initialState } from '../store/route.reducer'
import * as RouteActions from '../store/route.actions'
import { PendingReviewStripComponent } from '../components/pending-review-strip.component'
import type { RiskSegment } from '../types'

@Component({
  selector: 'app-approval',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTabsModule, PendingReviewStripComponent],
  template: `
    <main class="page">
      <div class="page-head"><div><p class="eyebrow">安全 · 运营 · 应急会签</p><h1>逐区段审批与退回</h1><p>每条意见锚定运输区段，原记录不可覆盖，所有确认写入审计时间线。</p></div><button mat-flat-button color="primary" (click)="lockBaseline()">确认并锁定基线</button></div>
      <app-pending-review-strip />
      <mat-tab-group>
        <mat-tab label="待处理意见"><section class="card comment-list">
          @for (comment of snapshot.comments; track comment.id) {
            <div class="comment" [class.invalid]="comment.status === '已失效'">
              <div class="comment-head"><div><b>{{comment.role}} · {{comment.author}}</b><small>{{comment.segmentId}} · {{comment.id}} · 依据快照 v{{comment.basisVersion}}</small></div><span class="status" [class.st-invalid]="comment.status==='已失效'" [class.st-ok]="comment.status==='已接受'" [class.st-back]="comment.status==='已退回'">{{comment.status}}</span></div>
              <p>{{comment.content}}</p>
              @if (comment.status === '已失效') {
                <p class="invalid-reason">失效原因：{{comment.invalidReason}}</p>
                <div class="actions"><button mat-flat-button color="primary" (click)="reconfirm(comment.id)">重新确认</button></div>
              } @else {
                <div class="actions"><button mat-stroked-button color="warn" (click)="resolve(comment.id,'已退回')">退回补件</button><button mat-flat-button color="primary" (click)="resolve(comment.id,'已接受')">接受条件</button></div>
              }
            </div>
          }
          @if (!snapshot.comments.length) { <p class="empty">暂无会签意见。</p> }
        </section></mat-tab>
        <mat-tab label="发表区段意见"><section class="card form-card">
          <div class="two"><mat-form-field><mat-label>专业角色</mat-label><mat-select [(ngModel)]="role"><mat-option>安全</mat-option><mat-option>运营</mat-option><mat-option>应急</mat-option></mat-select></mat-form-field><mat-form-field><mat-label>区段</mat-label><mat-select [(ngModel)]="segmentId"><mat-option *ngFor="let segment of segments" [value]="segment.id">{{segment.id}} · {{segment.name}}</mat-option></mat-select></mat-form-field></div>
          <mat-form-field class="wide"><mat-label>审批条件与依据</mat-label><textarea matInput rows="5" [(ngModel)]="content" placeholder="明确区段、约束、时限与验收证据"></textarea></mat-form-field>
          <button mat-flat-button color="primary" [disabled]="!content.trim()" (click)="addComment()">提交意见</button>
        </section></mat-tab>
        <mat-tab label="审计时间线"><section class="card timeline">
          @for (entry of snapshot.journal; track entry.op) {
            <div><i [class.rolled]="entry.status==='已回滚'" [class.rejected]="entry.status==='未生效'"></i><b>OP-{{entry.op}} · {{entry.at}} · {{entry.actor}} · {{entry.action}}</b><p>{{entry.detail}} · {{entry.status}}</p></div>
          }
          @if (!snapshot.journal.length) { <p class="empty">暂无审计记录。</p> }
        </section></mat-tab>
      </mat-tab-group>
    </main>
  `,
  styles: [`
    h2{margin:0}.comment-list{padding:0}.comment{padding:18px;border-bottom:1px solid #e7ebf1}.comment.invalid{background:#fff7f7}.comment-head{display:flex;justify-content:space-between}.comment-head small{display:block;color:#7a8798;margin-top:4px}.comment p{color:#475569}.status{font-size:12px;color:#b45309}.status.st-ok{color:#15803d}.status.st-back{color:#7a8798}.status.st-invalid{color:#b91c1c;font-weight:700}.invalid-reason{color:#b91c1c !important;font-size:13px}.empty{padding:18px;color:#7a8798}.actions{display:flex;gap:10px}.actions button{margin:8px 8px 0 0}.form-card{max-width:780px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.two mat-form-field,.wide{width:100%}.timeline{padding:8px 18px}.timeline>div{position:relative;padding:14px 10px 14px 28px;border-left:2px solid #cbd5e1}.timeline i{position:absolute;width:9px;height:9px;border-radius:50%;background:#2563eb;left:-5.5px;top:20px}.timeline i.rolled{background:#b91c1c}.timeline i.rejected{background:#b45309}.timeline p{color:#7a8798;margin:5px 0 0}
    @media(max-width:620px){.two{grid-template-columns:1fr}}
  `],
})
export class ApprovalComponent {
  private readonly store = inject(Store<{ routes: RouteState }>)
  snapshot: RouteState = initialState
  role = '安全'
  segmentId = 'S-203'
  content = ''
  segments: RiskSegment[] = []

  constructor() {
    this.store.select('routes').subscribe((state) => {
      this.snapshot = state
      this.segments = state.routes.flatMap((route: { segments: RiskSegment[] }) => route.segments)
    })
  }

  addComment() {
    this.store.dispatch(RouteActions.addComment({ comment: { id: `RV-${Date.now().toString().slice(-4)}`, segmentId: this.segmentId, role: this.role, author: '当前审阅人', content: this.content, status: '待确认' } }))
    this.content = ''
  }

  resolve(id: string, status: '已接受' | '已退回') { this.store.dispatch(RouteActions.resolveComment({ id, status })) }
  reconfirm(id: string) { this.store.dispatch(RouteActions.reconfirmComment({ id, actor: '当前审阅人' })) }
  lockBaseline() { alert('基线已锁定：审批意见、路径版本和原始附件将只读保存。') }
}
