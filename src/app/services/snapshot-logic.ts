import type { PendingOp, QueueEntry, ReviewComment, ReviewItem, RoutePackage, Section } from '../types'

/**
 * 按当前编组逐段计算余量，超出容量即进入排队。
 * 规则：按计划顺序依次把运输单编组排入区段容量池；
 * 若排入后超过区段最大编组容量，则该单在该区段排队（不占用容量）。
 */
export function recomputeQueue(routes: RoutePackage[], sections: Section[]): QueueEntry[] {
  const load = new Map<string, number>()
  const queue: QueueEntry[] = []
  const ordered = [...routes].sort((a, b) => a.scheduleOrder - b.scheduleOrder || a.id.localeCompare(b.id))
  for (const route of ordered) {
    for (const segment of route.segments) {
      const section = sections.find((item) => item.id === segment.sectionId)
      if (!section) continue
      const current = load.get(section.id) ?? 0
      if (current + route.wagonCount <= section.capacity) {
        load.set(section.id, current + route.wagonCount)
      } else {
        queue.push({
          id: `${route.id}@${section.id}`,
          routeId: route.id,
          sectionId: section.id,
          requiredWagons: route.wagonCount,
          loadBefore: current,
          margin: section.capacity - current,
          capacity: section.capacity,
          reason: `编组 ${route.wagonCount} 辆超出区段容量（已排 ${current} / 限 ${section.capacity}）`,
        })
      }
    }
  }
  return queue
}

export interface SectionMargin {
  section: Section
  load: number
  /** 排入后余量（含本单） */
  marginAfter: number
  /** 排入前余量 */
  marginBefore: number
  accepted: boolean
}

/** 逐段计算某运输单的编组余量 */
export function routeMargins(routes: RoutePackage[], sections: Section[], queue: QueueEntry[], routeId: string): SectionMargin[] {
  const route = routes.find((item) => item.id === routeId)
  if (!route) return []
  const load = new Map<string, number>()
  const ordered = [...routes].sort((a, b) => a.scheduleOrder - b.scheduleOrder || a.id.localeCompare(b.id))
  for (const item of ordered) {
    for (const segment of item.segments) {
      const section = sections.find((sec) => sec.id === segment.sectionId)
      if (!section) continue
      const current = load.get(section.id) ?? 0
      if (current + item.wagonCount <= section.capacity) load.set(section.id, current + item.wagonCount)
    }
  }
  return route.segments.map((segment) => {
    const section = sections.find((sec) => sec.id === segment.sectionId)!
    const current = load.get(section.id) ?? 0
    const isQueued = queue.some((q) => q.routeId === routeId && q.sectionId === section.id)
    const loadBefore = isQueued ? current : current - route.wagonCount
    return {
      section,
      load: current,
      marginBefore: section.capacity - loadBefore,
      marginAfter: section.capacity - current,
      accepted: !isQueued,
    }
  })
}

/**
 * 限值或编组一变，相关会签立即失效并重新确认。
 * 相关 = 锚定区段属于被改区段，或运输单被改编组。
 */
export function invalidateComments(
  comments: ReviewComment[],
  routes: RoutePackage[],
  changed: { sectionIds?: string[]; routeIds?: string[] },
): ReviewComment[] {
  const sectionIds = new Set(changed.sectionIds ?? [])
  const routeIds = new Set(changed.routeIds ?? [])
  return comments.map((comment) => {
    const route = routes.find((item) => item.id === comment.routeId)
    const sectionId = route?.segments.find((segment) => segment.id === comment.segmentId)?.sectionId
    const hitSection = sectionId !== undefined && sectionIds.has(sectionId)
    const hitRoute = routeIds.has(comment.routeId)
    if (!hitSection && !hitRoute) return comment
    const reason = hitSection ? `区段 ${sectionId} 编组容量已调整` : `运输单 ${comment.routeId} 编组已变更`
    return { ...comment, status: '待确认' as const, invalidated: true, invalidReason: `${reason}，会签失效需重新确认` }
  })
}

/** 待复核结果：工作台、风险地图、审批页共用同一份清单 */
export function buildReviewItems(routes: RoutePackage[], comments: ReviewComment[], queue: QueueEntry[]): ReviewItem[] {
  const items: ReviewItem[] = []
  for (const route of routes) {
    if (route.permission !== '有效') {
      items.push({ kind: '许可缺失', refId: route.id, routeId: route.id, reason: `${route.permit} · ${route.permission}`, severity: '高' })
    }
    for (const segment of route.segments) {
      if (segment.level === '高' || segment.status === '待复核') {
        items.push({
          kind: '风险区段', refId: segment.id, routeId: route.id, sectionId: segment.sectionId,
          reason: `${segment.name} · ${segment.level}风险 · ${segment.risks.join(' / ')}`,
          severity: segment.level === '高' ? '高' : '中',
        })
      }
    }
  }
  for (const comment of comments) {
    if (comment.status === '待确认' || comment.invalidated) {
      items.push({
        kind: '会签意见', refId: comment.id, routeId: comment.routeId, sectionId: comment.segmentId,
        reason: comment.invalidated ? `${comment.role}会签已失效：${comment.invalidReason ?? ''}` : `${comment.role} · ${comment.author}：${comment.content}`,
        severity: comment.invalidated ? '高' : '中',
      })
    }
  }
  for (const entry of queue) {
    items.push({
      kind: '通行排队', refId: entry.id, routeId: entry.routeId, sectionId: entry.sectionId,
      reason: `${entry.routeId} 在 ${entry.sectionId} 排队：${entry.reason}`, severity: '高',
    })
  }
  return items
}

/** 生成操作号（客户端生成，服务端按操作号幂等去重） */
export function createOpId(): string {
  return `OP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createOp(type: PendingOp['type'], payload: any, baseVersion?: number): PendingOp {
  return {
    opId: createOpId(),
    type,
    payload,
    baseVersion,
    status: '待写入',
    attempts: 0,
    createdAt: new Date().toISOString(),
  }
}
