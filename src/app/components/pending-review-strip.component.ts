import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Store } from '@ngrx/store'
import type { RouteState } from '../store/route.reducer'
import { selectPendingReview } from '../store/route.selectors'

/** 待复核结果条：工作台、风险地图、审批页共用同一份选择器，显示必然一致 */
@Component({
  selector: 'app-pending-review-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (pending$ | async; as pending) {
      <section class="strip" [class.clear]="pending.total === 0">
        <b class="title">待复核</b>
        <span class="item">区段 <strong>{{ pending.segments.length }}</strong></span>
        <span class="item">失效会签 <strong>{{ pending.invalidated.length }}</strong></span>
        <span class="item">排队运输单 <strong>{{ pending.queued.length }}</strong></span>
        @if (pending.total > 0) {
          <span class="chips">
            @for (segment of pending.segments; track segment.segmentId) { <em class="chip" [title]="segment.name">{{ segment.segmentId }}</em> }
            @for (comment of pending.invalidated; track comment.id) { <em class="chip warn" [title]="comment.invalidReason">{{ comment.id }}</em> }
            @for (order of pending.queued; track order.routeId) { <em class="chip danger" [title]="order.cargo">{{ order.routeId }}</em> }
          </span>
        } @else {
          <span class="ok">全部复核完成</span>
        }
      </section>
    }
  `,
  styles: [`
    .strip{display:flex;align-items:center;flex-wrap:wrap;gap:14px;background:#fff;border:1px solid #e1e7ef;border-left:4px solid #d97706;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:#475569}
    .strip.clear{border-left-color:#15803d}
    .title{color:#182230}
    .item strong{font-size:16px;margin-left:2px;color:#182230}
    .chips{display:flex;flex-wrap:wrap;gap:6px}
    .chip{font-style:normal;background:#eef2ff;color:#3730a3;border-radius:4px;padding:2px 8px;font-size:12px}
    .chip.warn{background:#fef3c7;color:#92400e}
    .chip.danger{background:#fee2e2;color:#b91c1c}
    .ok{color:#15803d;font-weight:600}
  `],
})
export class PendingReviewStripComponent {
  private readonly store = inject(Store<{ routes: RouteState }>)
  readonly pending$ = this.store.select(selectPendingReview)
}
