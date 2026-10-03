import type { RoutePackage, Section, ReviewComment } from '../types'

/**
 * 初始快照数据（新电脑首次打开即同步可用，不依赖网络往返）。
 * 区段为全网共享容量池：多份运输单共用同一区段容量，逐段计算余量。
 */
export const SEED_SECTIONS: Section[] = [
  { id: 'S-201', name: '兰州枢纽东联络线', capacity: 60, version: 1 },
  { id: 'S-203', name: '西峡水源保护区段', capacity: 45, version: 1 },
  { id: 'S-207', name: '郑州北至商丘区段', capacity: 46, version: 1 },
  { id: 'S-211', name: '徐州东至南京东', capacity: 70, version: 1 },
  { id: 'S-301', name: '西安国际港联络线', capacity: 55, version: 1 },
  { id: 'S-304', name: '三门峡至洛阳区段', capacity: 40, version: 1 },
]

export const SEED_ROUTES: RoutePackage[] = [
  {
    id: 'HG-260929-018', cargo: '甲醇（UN1230）', hazardClass: '第 3 类 · 易燃液体', trainCode: 'X8021',
    origin: '兰州西', destination: '南京东', tonnage: 1860, wagonCount: 28,
    permit: '甘危运〔2026〕0831 号', permission: '待补充', score: 78, updatedAt: '今天 16:42', scheduleOrder: 1,
    segments: [
      { id: 'S-201', sectionId: 'S-201', name: '兰州枢纽东联络线', from: '兰州西', to: '桑园子', km: '24.6', speed: '限速 60', risks: ['高架桥', '人员密集'], level: '中', status: '已确认', coordinates: [[103.78, 36.06], [103.92, 36.04], [104.02, 36.00]] },
      { id: 'S-203', sectionId: 'S-203', name: '西峡水源保护区段', from: '天水', to: '宝鸡西', km: '132.4', speed: '限速 45', risks: ['水源地', '长隧道'], level: '高', status: '需绕行', coordinates: [[105.72, 34.58], [106.54, 34.36], [107.2, 34.36]] },
      { id: 'S-207', sectionId: 'S-207', name: '郑州北至商丘区段', from: '郑州北', to: '商丘', km: '188.2', speed: '限速 80', risks: ['人口密集', '桥梁群'], level: '高', status: '需绕行', coordinates: [[113.65, 34.75], [114.55, 34.5], [115.65, 34.42]] },
      { id: 'S-211', sectionId: 'S-211', name: '徐州东至南京东', from: '徐州东', to: '南京东', km: '316.8', speed: '限速 80', risks: ['隧道群'], level: '低', status: '已确认', coordinates: [[117.28, 34.26], [118.08, 33.78], [118.8, 32.08]] },
    ],
  },
  {
    id: 'HG-260930-006', cargo: '氢氧化钠溶液（UN1824）', hazardClass: '第 8 类 · 腐蚀性物质', trainCode: 'X9116',
    origin: '西安国际港', destination: '宁波北', tonnage: 1240, wagonCount: 20,
    permit: '陕危运〔2026〕1022 号', permission: '有效', score: 42, updatedAt: '今天 14:20', scheduleOrder: 2,
    segments: [
      { id: 'S-301', sectionId: 'S-301', name: '西安国际港联络线', from: '西安国际港', to: '新丰镇', km: '31.2', speed: '限速 60', risks: ['枢纽密集'], level: '低', status: '已确认', coordinates: [[109.16, 34.4], [109.42, 34.38], [109.68, 34.34]] },
      { id: 'S-304', sectionId: 'S-304', name: '三门峡至洛阳区段', from: '三门峡西', to: '洛阳东', km: '122.3', speed: '限速 80', risks: ['隧道', '跨河桥'], level: '中', status: '待复核', coordinates: [[111.18, 34.76], [112.18, 34.68], [112.86, 34.66]] },
      { id: 'S-207', sectionId: 'S-207', name: '郑州北至商丘区段', from: '郑州北', to: '商丘', km: '188.2', speed: '限速 80', risks: ['人口密集', '桥梁群'], level: '高', status: '需绕行', coordinates: [[113.65, 34.75], [114.55, 34.5], [115.65, 34.42]] },
      { id: 'S-211', sectionId: 'S-211', name: '徐州东至南京东', from: '徐州东', to: '南京东', km: '316.8', speed: '限速 80', risks: ['隧道群'], level: '低', status: '已确认', coordinates: [[117.28, 34.26], [118.08, 33.78], [118.8, 32.08]] },
    ],
  },
]

export const SEED_COMMENTS: ReviewComment[] = [
  { id: 'RV-31', routeId: 'HG-260929-018', segmentId: 'S-203', role: '安全', author: '韩洁', content: '水源地保护段限速 45 km/h，并要求随车配置吸附围油栏。', status: '待确认' },
  { id: 'RV-32', routeId: 'HG-260929-018', segmentId: 'S-207', role: '应急', author: '罗晋', content: '长隧道出口需增加 15 分钟现场监护窗口，接受后方可放行。', status: '已接受' },
]

export const SNAPSHOT_SCHEMA = 1
