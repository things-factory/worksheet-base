import { renderDO } from './controllers/render-do'
import { renderGRN } from './controllers/render-grn'

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
  var paths = ['view_document_do', 'view_document_grn']
  fallbackOption.whiteList.push(`^\/(${paths.join('|')})($|[/?#])`)
})

process.on('bootstrap-module-route' as any, (app, routes) => {
  routes.get('/view_document_do/:domain/:doNo', async (context, next) => {
    context.body = await renderDO(context.params)
  })

  routes.get('/view_document_grn/:domain/:grnNo', async (context, next) => {
    context.body = await renderGRN(context.params)
  })
})
