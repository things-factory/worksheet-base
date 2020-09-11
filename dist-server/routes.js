"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const render_do_1 = require("./controllers/render-do");
const render_elccl_grn_1 = require("./controllers/render-elccl-grn");
const render_kimeda_grn_1 = require("./controllers/render-kimeda-grn");
const render_job_sheet_1 = require("./controllers/render-job-sheet");
process.on('bootstrap-module-history-fallback', (app, fallbackOption) => {
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
    var paths = ['view_document_do', 'view_elccl_grn', 'view_job_sheet', 'view_kimeda_grn'];
    fallbackOption.whiteList.push(`^\/(${paths.join('|')})($|[/?#])`);
});
process.on('bootstrap-module-route', (app, routes) => {
    routes.get('/view_document_do/:domain/:doNo', async (context, next) => {
        context.body = await render_do_1.renderDO(context.params);
    });
    routes.get('/view_elccl_grn/:domain/:grnNo', async (context, next) => {
        context.body = await render_elccl_grn_1.renderElcclGRN(context.params);
    });
    routes.get('/view_kimeda_grn/:domain/:grnNo', async (context, next) => {
        context.body = await render_kimeda_grn_1.renderKimedaGRN(context.params);
    });
    routes.get('/view_job_sheet/:domain/:ganNo', async (context, next) => {
        context.body = await render_job_sheet_1.renderJobSheet(context.params);
    });
});
//# sourceMappingURL=routes.js.map