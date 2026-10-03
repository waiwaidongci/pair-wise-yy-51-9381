import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import type { ReviewComment, RoutePackage, SectionCapacity } from '../types'

export interface RouteDataPayload {
  items: RoutePackage[]
  capacities: SectionCapacity[]
  comments: ReviewComment[]
}

@Injectable({ providedIn: 'root' })
export class RouteApiService {
  private readonly http = inject(HttpClient)

  getRoutePackages() {
    return this.http.get<RouteDataPayload>('route-data.json')
  }
}
