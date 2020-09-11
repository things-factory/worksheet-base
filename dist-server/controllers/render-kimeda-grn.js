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
const form_data_1 = __importDefault(require("form-data"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const typeorm_1 = require("typeorm");
const constants_1 = require("../constants");
const entities_1 = require("../entities");
const datetime_util_1 = require("../utils/datetime-util");
const REPORT_API_URL = env_1.config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html');
async function renderKimedaGRN({ domain: domainName, grnNo }) {
    var _a, _b, _c;
    // 1. find domain
    const domain = await typeorm_1.getRepository(shell_1.Domain).findOne({
        where: { subdomain: domainName }
    });
    // 2. find grn
    const foundGRN = await typeorm_1.getRepository(sales_base_1.GoodsReceivalNote).findOne({
        where: { domain, name: grnNo },
        relations: ['domain', 'bizplace', 'arrivalNotice']
    });
    // 3. find GAN
    const foundGAN = foundGRN.arrivalNotice;
    const ownRefNo = foundGAN.refNo;
    // 4. find customer bizplace
    const partnerBiz = foundGRN.bizplace;
    // 5. find domain bizplace id
    const foundDomainBizId = await typeorm_1.getRepository(biz_base_1.Partner).findOne({
        where: { partnerBizplace: partnerBiz.id },
        relations: ['domainBizplace']
    });
    // 6. found domain bizplace object
    const foundDomainBiz = await typeorm_1.getRepository(biz_base_1.Bizplace).findOne({
        where: { id: foundDomainBizId.domainBizplace.id }
    });
    // 7. find domain contact point
    const foundCP = await typeorm_1.getRepository(biz_base_1.ContactPoint).findOne({
        where: { domain, bizplace: foundDomainBiz }
    });
    // 8. find unloading worksheet
    const foundWS = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
        where: { domain, arrivalNotice: foundGAN, type: sales_base_1.ORDER_PRODUCT_STATUS.UNLOADING, status: sales_base_1.ORDER_STATUS.DONE },
        relations: ['worksheetDetails']
    });
    const targetProducts = await typeorm_1.getRepository(sales_base_1.OrderProduct).find({
        where: { domain, arrivalNotice: foundGAN, actualPalletQty: typeorm_1.Not(typeorm_1.IsNull()), actualPackQty: typeorm_1.Not(typeorm_1.IsNull()) },
        relations: ['product']
    });
    // 9. find grn template based on category
    const foundTemplate = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: { domain, category: constants_1.TEMPLATE_TYPE.GRN_TEMPLATE }
    });
    // 10. find grn logo
    const foundLogo = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: {
            domain,
            category: constants_1.TEMPLATE_TYPE.LOGO
        }
    });
    // 11. find signature
    const foundSignature = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: {
            domain,
            category: constants_1.TEMPLATE_TYPE.SIGNATURE
        }
    });
    const foundCop = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: {
            domain,
            category: constants_1.TEMPLATE_TYPE.COP
        }
    });
    const template = await attachment_base_1.STORAGE.readFile(foundTemplate.path, 'utf-8');
    let logo = null;
    if ((_a = foundLogo) === null || _a === void 0 ? void 0 : _a.path) {
        logo = 'data:' + foundLogo.mimetype + ';base64,' + (await attachment_base_1.STORAGE.readFile(foundLogo.path, 'base64'));
    }
    let signature = null;
    if ((_b = foundSignature) === null || _b === void 0 ? void 0 : _b.path) {
        signature = 'data:' + foundSignature.mimetype + ';base64,' + (await attachment_base_1.STORAGE.readFile(foundSignature.path, 'base64'));
    }
    let cop = null;
    if ((_c = foundCop) === null || _c === void 0 ? void 0 : _c.path) {
        cop = 'data:' + foundSignature.mimetype + ';base64,' + (await attachment_base_1.STORAGE.readFile(foundCop.path, 'base64'));
    }
    const data = {
        logo_url: logo,
        sign_url: signature,
        cop_url: cop,
        customer_biz: partnerBiz.name,
        customer_address: partnerBiz.address,
        company_domain: foundDomainBiz.name,
        company_phone: foundCP.phone,
        company_email: foundCP.email,
        company_brn: foundDomainBiz.description,
        company_address: foundDomainBiz.address,
        order_no: foundGRN.name,
        unload_date: datetime_util_1.DateTimeConverter.date(foundWS.endedAt),
        ref_no: ownRefNo ? `${foundGAN.name} / ${foundGAN.refNo}` : `${foundGAN.name}`,
        received_date: datetime_util_1.DateTimeConverter.date(foundWS.endedAt),
        truck_no: foundGAN.truckNo || '',
        container_no: foundGAN.containerNo || '',
        product_list: targetProducts.map((item, idx) => {
            return {
                list_no: idx + 1,
                product_name: `${item.product.name}(${item.product.description})`,
                product_type: item.packingType,
                product_batch: item.batchId,
                product_qty: item.actualPackQty,
                unit_weight: item.weight,
                pallet_qty: item.actualPalletQty,
                remark: item.remark
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
exports.renderKimedaGRN = renderKimedaGRN;
//# sourceMappingURL=render-kimeda-grn.js.map