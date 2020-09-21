import { renderDO } from './controllers/render-do'
import { renderElcclGRN } from './controllers/render-elccl-grn'
import { renderKimedaGRN } from './controllers/render-kimeda-grn'
import { renderJobSheet } from './controllers/render-job-sheet'

process.on('bootstrap-module-history-fallback' as any, (app, fallbackOption) => {
  /*
   * fallback white list를 추가할 수 있다
   *
   * ex)
   * var paths = [
   *   'aaa',
   *   'bbb'
   * ]
   * fallbackOption.whiteList.push(`^\/(${paths.join('|')})($|[/?#])`)
   */
  var paths = ['view_document_do', 'view_elccl_grn', 'view_job_sheet', 'view_kimeda_grn']
  fallbackOption.whiteList.push(`^\/(${paths.join('|')})($|[/?#])`)
})

process.on('bootstrap-module-route' as any, (app, routes) => {
  routes.get('/view_document_do/:domain/:doNo', async (context, next) => {
    context.body = await renderDO(context.params)
  })

  routes.get('/view_elccl_grn/:domain/:grnNo', async (context, next) => {
    context.body = await renderElcclGRN(context.params)
  })

  routes.get('/view_kimeda_grn/:domain/:grnNo', async (context, next) => {
    context.body = await renderKimedaGRN(context.params)
  })

  routes.get('/view_job_sheet/:domain/:ganNo', async (context, next) => {
    context.body = await renderJobSheet(context.params)
  })
})
