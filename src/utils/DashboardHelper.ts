/*

MIT License

Copyright (c) 2023 Looker Data Sciences, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import { Looker40SDK } from '@looker/sdk'
import { ExploreParams } from '../slices/assistantSlice'

export class DashboardHelper {
  /**
   * Get all dashboards accessible to the current user
   */
  static async getUserDashboards(sdk: Looker40SDK) {
    try {
      const dashboards = await sdk.ok(
        sdk.all_dashboards('id,title,description,folder,created_at')
      )
      return dashboards
    } catch (error) {
      console.error('Error fetching dashboards:', error)
      throw error
    }
  }

  /**
   * Create a new dashboard
   */
  static async createDashboard(
    sdk: Looker40SDK,
    title: string,
    description?: string
  ) {
    try {
      // get the current user's personal folder
      const me = await sdk.ok(sdk.me('personal_folder_id'))
      const personalFolderId = me.personal_folder_id

      const dashboard = await sdk.ok(
        sdk.create_dashboard({
          title,
          description: description || '',
          folder_id: personalFolderId?.toString(),
        })
      )
      return dashboard
    } catch (error) {
      console.error('Error creating dashboard:', error)
      throw error
    }
  }

  /**
   * Create a query from explore parameters
   */
  static async createQuery(
    sdk: Looker40SDK,
    modelName: string,
    exploreId: string,
    exploreParams: ExploreParams
  ) {
    try {
      // Sanitize filters: convert arrays to strings and remove empty values
      const filters: Record<string, string> = {}
      if (exploreParams.filters) {
        Object.entries(exploreParams.filters).forEach(([key, value]) => {
          if (!value) return
          
          if (typeof value === 'string' && value.trim()) {
            filters[key] = value
          } else if (Array.isArray(value)) {
            // Filter out empty strings and join with comma (Looker's OR separator)
            const validFilters = value.filter(f => f && typeof f === 'string' && f.trim())
            if (validFilters.length > 0) {
              filters[key] = validFilters.join(',')
            }
          }
        })
      }

      console.log('DashboardHelper.createQuery: params', {
        modelName,
        exploreId,
        fields: exploreParams.fields,
        filters,
        sorts: exploreParams.sorts,
        limit: exploreParams.limit,
        vis_config: exploreParams.vis_config,
        pivots: exploreParams.pivots
      })

      const query = await sdk.ok(
        sdk.create_query({
          model: modelName,
          view: exploreId,
          fields: exploreParams.fields || [],
          filters: filters,
          sorts: exploreParams.sorts || [],
          limit: exploreParams.limit || '500',
          vis_config: Object.keys(exploreParams.vis_config || {}).length > 0 ? exploreParams.vis_config : { type: 'looker_grid' },
          pivots: exploreParams.pivots || [],
        })
      )
      return query
    } catch (error) {
      console.error('Error creating query:', error)
      throw error
    }
  }

  /**
   * Add a tile to a dashboard
   */
  static async addTileToDashboard(
    sdk: Looker40SDK,
    dashboardId: string,
    queryId: string,
    title: string
  ) {
    try {
      // Create dashboard element with proper SDK request structure
      const element = await sdk.ok(
        sdk.create_dashboard_element({
          body: {
            dashboard_id: dashboardId,
            query_id: queryId,
            title: title,
            type: 'vis',
          }
        })
      )

      return element
    } catch (error) {
      console.error('Error adding tile to dashboard:', error)
      throw error
    }
  }

  /**
   * Complete workflow: Create query and add to dashboard
   */
  static async addExploreToDashboard(
    sdk: Looker40SDK,
    dashboardId: string,
    modelName: string,
    exploreId: string,
    exploreParams: ExploreParams,
    tileTitle: string
  ) {
    try {
      // Step 1: Create the query
      const query = await this.createQuery(
        sdk,
        modelName,
        exploreId,
        exploreParams
      )

      if (!query.id) {
        throw new Error('Failed to create query')
      }

      // Step 2: Add the query as a tile to the dashboard
      const element = await this.addTileToDashboard(
        sdk,
        dashboardId,
        String(query.id),
        tileTitle
      )

      return {
        query,
        element,
      }
    } catch (error) {
      console.error('Error adding explore to dashboard:', error)
      throw error
    }
  }

  /**
   * Create a scheduled plan for a query
   */
  static async createScheduledPlan(
    sdk: Looker40SDK,
    queryId: string,
    title: string,
    destination: string, // email address
    format: string = 'csv_zip'
  ) {
    try {
      const plan = await sdk.ok(
        sdk.create_scheduled_plan({
          name: title,
          query_id: queryId,
          scheduled_plan_destination: [
            {
              format: format,
              type: 'email',
              address: destination,
            },
          ],
          // Default to daily at 6am
          crontab: '0 6 * * *',
          run_once: false,
        })
      )
      return plan
    } catch (error) {
      console.error('Error creating scheduled plan:', error)
      throw error
    }
  }
}
