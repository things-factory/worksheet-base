"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const attachment_base_1 = require("@things-factory/attachment-base");
const biz_base_1 = require("@things-factory/biz-base");
const env_1 = require("@things-factory/env");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const form_data_1 = __importDefault(require("form-data"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const typeorm_1 = require("typeorm");
const constants_1 = require("../constants");
const entities_1 = require("../entities");
const datetime_util_1 = require("../utils/datetime-util");
const REPORT_API_URL = env_1.config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html');
async function renderJobSheet({ domain: domainName, ganNo }) {
    var _a, _b, _c, _d, _e, _f, _g;
    const domain = await typeorm_1.getRepository(shell_1.Domain).findOne({
        where: { subdomain: domainName }
    }); //.. find domain
    // find GAN
    const foundGAN = await typeorm_1.getRepository(sales_base_1.ArrivalNotice).findOne({
        where: { domain, name: ganNo },
        relations: ['bizplace', 'jobSheet']
    });
    // find job sheet
    const foundJS = foundGAN.jobSheet;
    // customer bizplace
    const partnerBiz = foundGAN.bizplace;
    // find domain bizplace name, address, brn
    const foundDomainBizId = await typeorm_1.getRepository(biz_base_1.Partner).findOne({
        where: { partnerBizplace: partnerBiz.id },
        relations: ['domainBizplace']
    });
    // owner domain bizplace
    const foundDomainBiz = await typeorm_1.getRepository(biz_base_1.Bizplace).findOne({
        where: { id: foundDomainBizId.domainBizplace.id }
    });
    const foundTemplate = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: { domain, category: constants_1.TEMPLATE_TYPE.JOB_TEMPLATE }
    });
    const foundLogo = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: {
            domain,
            category: constants_1.TEMPLATE_TYPE.LOGO
        }
    });
    const template = await attachment_base_1.STORAGE.readFile(foundTemplate.path, 'utf-8');
    let logo = null;
    if ((_a = foundLogo) === null || _a === void 0 ? void 0 : _a.path) {
        logo = 'data:' + foundLogo.mimetype + ';base64,' + (await attachment_base_1.STORAGE.readFile(foundLogo.path, 'base64'));
    }
    // find unloading worksheet for getting unloading time
    const foundWS = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
        where: { domain, arrivalNotice: foundGAN, type: constants_1.WORKSHEET_TYPE.UNLOADING },
        relations: ['updater']
    });
    // find list of unloaded product
    const targetProducts = await typeorm_1.getRepository(sales_base_1.OrderProduct).find({
        where: { domain, arrivalNotice: foundGAN, actualPalletQty: typeorm_1.Not(typeorm_1.IsNull()) },
        relations: ['product']
    });
    const products = targetProducts.map((op) => op.product);
    const prodType = products.map(prod => prod.type);
    const subQueryInvHis = await typeorm_1.getRepository(warehouse_base_1.InventoryHistory)
        .createQueryBuilder('invHis')
        .select('invHis.palletId')
        .addSelect('invHis.domain')
        .addSelect('invHis.status')
        .addSelect('MAX(invHis.seq)', 'seq')
        .where("invHis.transactionType IN ('UNLOADING','ADJUSTMENT','TERMINATED')")
        .andWhere('invHis.domain = :domainId', { domainId: domain.id })
        .groupBy('invHis.palletId')
        .addGroupBy('invHis.status')
        .addGroupBy('invHis.domain');
    const query = await typeorm_1.getRepository(warehouse_base_1.Inventory)
        .createQueryBuilder('inv')
        .select('inv.id')
        .addSelect(subQuery => {
        return subQuery
            .select('COALESCE("invh".qty, 0)', 'unloadedQty')
            .from('inventory_histories', 'invh')
            .innerJoin('(' + subQueryInvHis.getQuery() + ')', 'invhsrc', '"invhsrc"."invHis_pallet_id" = "invh"."pallet_id" AND "invhsrc"."seq" = "invh"."seq" AND "invhsrc"."domain_id" = "invh"."domain_id"')
            .where('"invhsrc"."invHis_status" = \'UNLOADED\'')
            .andWhere('"invh"."pallet_id" = "inv"."pallet_id"')
            .andWhere('"invh"."domain_id" = "inv"."domain_id"');
    }, 'unloadedQty')
        .addSelect(subQuery => {
        return subQuery
            .select('COALESCE("invh".created_at, null)', 'outboundAt')
            .from('inventory_histories', 'invh')
            .innerJoin('(' + subQueryInvHis.getQuery() + ')', 'invhsrc', '"invhsrc"."invHis_pallet_id" = "invh"."pallet_id" AND "invhsrc"."seq" = "invh"."seq" AND "invhsrc"."domain_id" = "invh"."domain_id"')
            .where('"invhsrc"."invHis_status" = \'TERMINATED\'')
            .andWhere('"invh"."pallet_id" = "inv"."pallet_id"')
            .andWhere('"invh"."domain_id" = "inv"."domain_id"');
    }, 'outboundAt')
        .addSelect('inv.palletId', 'palletId')
        .addSelect('inv.packingType', 'packingType')
        .addSelect('inv.createdAt', 'createdAt')
        .addSelect('product.name', 'productName')
        .addSelect('STRING_AGG ("do2".name, \', \')', 'doName')
        .addSelect('do2.own_collection', 'ownTransport')
        .addSelect('STRING_AGG ("vas".name, \', \')', 'vasName')
        .leftJoin('order_inventories', 'orderInv', '"orderInv"."inventory_id" = "inv"."id" AND "orderInv"."release_good_id" is not null')
        .leftJoin('order_vass', 'orderVass', '"orderVass"."inventory_id" = "inv"."id"')
        .leftJoin('vass', 'vas', '"vas"."id" = "orderVass"."vas_id"')
        .leftJoin('delivery_orders', 'do2', '"do2"."id" = "orderInv"."delivery_order_id"')
        .leftJoin('inv.product', 'product')
        .where(qb => {
        const subQuery = qb
            .subQuery()
            .select('oi.inventory_id')
            .from('order_inventories', 'oi')
            .where('oi.arrival_notice_id = :arrivalNoticeId', { arrivalNoticeId: foundGAN.id })
            .getQuery();
        return 'inv.id IN ' + subQuery;
    })
        .andWhere('inv.domain_id = :domainId', { domainId: domain.id })
        .groupBy('inv.id')
        .addGroupBy('product.name')
        .addGroupBy('do2.own_collection')
        .addOrderBy('product.name');
    const invItems = await query.getRawMany();
    const sumPackQty = targetProducts.map((op) => op.actualPackQty).reduce((a, b) => a + b, 0);
    let sumPalletQty = 0;
    if ((_b = foundJS) === null || _b === void 0 ? void 0 : _b.sumPalletQty) {
        sumPalletQty = foundJS.sumPalletQty;
    }
    const data = {
        logo_url: logo,
        customer_biz: partnerBiz.name,
        company_domain: foundDomainBiz.name,
        company_brn: foundDomainBiz.description,
        company_address: foundDomainBiz.address,
        container_no: ((_c = foundGAN) === null || _c === void 0 ? void 0 : _c.containerNo) ? foundGAN.containerNo : null,
        container_size: foundJS ? foundJS.containerSize : null,
        eta: ((_d = foundGAN) === null || _d === void 0 ? void 0 : _d.ata) ? datetime_util_1.DateTimeConverter.datetime(foundGAN.ata) : null,
        ata: ((_e = foundGAN) === null || _e === void 0 ? void 0 : _e.ata) ? datetime_util_1.DateTimeConverter.date(foundGAN.ata) : null,
        unloading_date: ((_f = foundWS) === null || _f === void 0 ? void 0 : _f.startedAt) ? datetime_util_1.DateTimeConverter.date(foundWS.startedAt) : '',
        mt_date: ((_g = foundJS) === null || _g === void 0 ? void 0 : _g.containerMtDate) ? datetime_util_1.DateTimeConverter.date(foundJS.containerMtDate) : '',
        advise_mt_date: foundJS.adviseMtDate ? datetime_util_1.DateTimeConverter.datetime(foundJS.adviseMtDate) : '',
        loose_item: foundGAN.looseItem ? 'N' : 'Y',
        no_of_pallet: (sumPalletQty > 1 ? `${sumPalletQty} PALLETS` : `${sumPalletQty} PALLET`) +
            `, ` +
            (sumPackQty ? `${sumPackQty} CTN` : 0),
        commodity: prodType.filter((a, b) => prodType.indexOf(a) === b).join(', '),
        created_on: datetime_util_1.DateTimeConverter.date(foundJS.createdAt),
        job_no: foundJS ? foundJS.name : null,
        ref_no: foundGAN.name,
        product_list: invItems.map((item, idx) => {
            var _a, _b;
            return {
                idx: idx + 1,
                pallet_id: item.palletId,
                product_name: item.productName,
                product_type: item.packingType,
                in_pallet: datetime_util_1.DateTimeConverter.date(item.createdAt),
                out_pallet: ((_a = item) === null || _a === void 0 ? void 0 : _a.outboundAt) ? datetime_util_1.DateTimeConverter.date(item.outboundAt) : null,
                do_list: item.doName,
                transport: ((_b = item) === null || _b === void 0 ? void 0 : _b.doName) ? (item.ownTransport ? 'Y' : 'N') : null,
                product_qty: item.unloadedQty,
                remark: foundGAN.looseItem ? 'STRETCH FILM' : null
            };
        })
    };
    const formData = new form_data_1.default();
    formData.append('template', template);
    formData.append('jsonString', JSON.stringify(data));
    const response = await node_fetch_1.default(REPORT_API_URL, {
        method: 'POST',
        body: formData
    });
    return await response.text();
}
exports.renderJobSheet = renderJobSheet;
//# sourceMappingURL=render-job-sheet.js.map