import { Component, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { MatChipsModule } from '@angular/material/chips'
import type { ReviewItem } from '../types'

/**
 * 待复核结果面板：工作台、风险地图、审批页共用同一份清单，
 * 三处显示的待复核数量与条目完全一致。
 */
@Component({
  selector: 'app-review-summary',
  standalone: true,
  imports: [CommonModule, MatChipsModule],
  template: `
    <section class="card review-panel">
      <div class="review-head">
        <div><h2>待复核结果</h2><p class="review-sub">工作台 · 风险地图 · 审批页共用同一份清单</p></div>
        <mat-chip [highlighted]="items.length > 0">{{ items.length }} 项</mat-chip>
      </div>
      @if (items.length === 0) { <p class="empty">暂无待复核项</p> }
      @for (item of items; track item.kind + item.refId) {
        <div class="review-item" [class.sev-high]="item.severity === '高'">
          <span class="kind">{{ item.kind }}</span>
          <div class="body"><b>{{ item.refId }}</b><p>{{ item.reason }}</p></div>
        </div>
      }
    </section>
  `,
  styles: [`
    .review-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
    h2{margin:0 0 2px;font-size:16px}.review-sub{color:#7a8798;font-size:12px;margin:0 0 10px}
    .empty{color:#7a8798;padding:8px 0;margin:0}
    .review-item{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #edf0f5}
    .review-item:last-child{border-bottom:none}
    .kind{flex:0 0 auto;font-size:11px;font-weight:700;color:#2563eb;background:#eff4ff;border-radius:4px;padding:2px 7px;height:fit-content;margin-top:2px}
    .sev-high .kind{color:#dc2626;background:#fef2f2}
    .body{min-width:0}.body b{font-size:13px}.body p{margin:2px 0 0;font-size:12px;color:#475569;word-break:break-all}
  `],
})
export class ReviewSummaryComponent {
  @Input() items: ReviewItem[] = []
}
