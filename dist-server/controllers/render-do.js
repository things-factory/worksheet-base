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
const REPORT_API_URL = env_1.config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html');
async function renderDO({ domain: domainName, doNo }) {
    var _a, _b, _c, _d;
    const domain = await typeorm_1.getRepository(shell_1.Domain).findOne({
        where: { subdomain: domainName }
    }); //.. find domain
    const foundDO = await typeorm_1.getRepository(sales_base_1.DeliveryOrder).findOne({
        where: { domain, name: doNo },
        relations: ['domain', 'bizplace', 'transportDriver', 'transportVehicle', 'releaseGood', 'creator', 'updater']
    }); // .. find do from deliveryOrderId
    const ownTransportFlag = foundDO.ownCollection;
    let foundCP = null;
    if ((_a = foundDO) === null || _a === void 0 ? void 0 : _a.contactPointRefId) {
        foundCP = await typeorm_1.getRepository(biz_base_1.ContactPoint).findOne({
            where: { domain, id: foundDO.contactPointRefId }
        });
    }
    const foundRO = foundDO.releaseGood;
    const partnerBiz = foundDO.bizplace; //customer bizplace
    const ownRefNo = foundRO.refNo;
    // find domain bizplace name, address, brn
    const foundDomainBizId = await typeorm_1.getRepository(biz_base_1.Partner).findOne({
        where: { partnerBizplace: partnerBiz.id },
        relations: ['domainBizplace']
    });
    const foundDomainBiz = await typeorm_1.getRepository(biz_base_1.Bizplace).findOne({
        where: { id: foundDomainBizId.domainBizplace.id }
    });
    const foundDomainCP = await typeorm_1.getRepository(biz_base_1.ContactPoint).findOne({
        where: { domain, bizplace: foundDomainBiz }
    });
    const foundWS = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
        where: { domain, releaseGood: foundRO },
        relations: ['updater']
    });
    //find reusable pallet
    const foundRP = await typeorm_1.getRepository(warehouse_base_1.Pallet).find({
        where: { domain, refOrderNo: foundRO.name }
    });
    //find list of loaded inventory
    const targetInventories = await typeorm_1.getRepository(sales_base_1.OrderInventory).find({
        where: { domain, deliveryOrder: foundDO },
        relations: ['inventory']
    });
    const orderInvIds = targetInventories.map((oi) => oi.id);
    const foundWSD = await typeorm_1.getRepository(entities_1.WorksheetDetail).find({
        where: {
            domain,
            targetInventory: typeorm_1.In(orderInvIds),
            type: constants_1.WORKSHEET_TYPE.LOADING,
            status: typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE)
        },
        relations: [
            'targetInventory',
            'targetInventory.inventory',
            'targetInventory.inventory.location',
            'targetInventory.inventory.product',
            'updater'
        ]
    });
    const foundTemplate = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: { domain, category: constants_1.TEMPLATE_TYPE.DO_TEMPLATE }
    });
    const foundLogo = await typeorm_1.getRepository(attachment_base_1.Attachment).findOne({
        where: {
            domain,
            category: constants_1.TEMPLATE_TYPE.LOGO
        }
    });
    let foundDriver = null;
    if (foundDO.status !== sales_base_1.ORDER_STATUS.READY_TO_DISPATCH) {
        if (((_b = foundDO) === null || _b === void 0 ? void 0 : _b.ownCollection) && ((_c = foundDO) === null || _c === void 0 ? void 0 : _c.otherDriver)) {
            foundDriver = foundDO.otherDriver;
        }
        else {
            foundDriver = foundDO.transportDriver.name;
        }
    }
    const template = await attachment_base_1.STORAGE.readFile(foundTemplate.path, 'utf-8');
    let logo = null;
    if ((_d = foundLogo) === null || _d === void 0 ? void 0 : _d.path) {
        logo = 'data:' + foundLogo.mimetype + ';base64,' + (await attachment_base_1.STORAGE.readFile(foundLogo.path, 'base64'));
    }
    const productList = foundWSD
        .map((wsd) => {
        const targetInventory = wsd.targetInventory;
        const inventory = targetInventory.inventory;
        return {
            product_name: `${inventory.product.name} (${inventory.product.description})`,
            product_type: inventory.packingType,
            product_batch: inventory.batchId,
            product_qty: targetInventory.releaseQty,
            product_weight: targetInventory.releaseWeight,
            remark: targetInventory.remark,
            cross_docking: targetInventory.crossDocking
        };
    })
        .reduce((newItem, item) => {
        var foundItem = newItem.find(newItem => newItem.product_name === item.product_name &&
            newItem.product_batch === item.product_batch &&
            newItem.cross_docking === item.cross_docking);
        if (!foundItem) {
            foundItem = {
                product_name: item.product_name,
                product_type: item.product_type,
                product_batch: item.product_batch,
                product_qty: item.product_qty,
                product_weight: item.product_weight,
                remark: 1,
                cross_docking: item.cross_docking
            };
            newItem.push(foundItem);
            return newItem;
        }
        else {
            return newItem.map(ni => {
                if (ni.product_name === item.product_name &&
                    ni.product_batch === item.product_batch &&
                    ni.cross_docking === item.cross_docking) {
                    return Object.assign(Object.assign({}, ni), { remark: ni.remark + 1, product_qty: ni.product_qty + item.product_qty, product_weight: ni.product_weight + item.product_weight });
                }
                else {
                    return ni;
                }
            });
        }
    }, []);
    const data = {
        logo_url: logo,
        customer_biz: partnerBiz.name,
        delivery_company: foundCP ? foundCP.name : null,
        company_domain: foundDomainBiz.name,
        company_brn: foundDomainBiz.description,
        company_address: foundDomainBiz.address,
        company_phone: foundDomainCP.phone,
        company_email: foundDomainCP.email,
        own_collection: ownTransportFlag ? '[SELF-COLLECTION]' : `[${domain.brandName} TRANSPORT]`,
        destination: foundDO.to || '',
        ref_no: ownRefNo ? `${foundRO.name} / ${foundRO.refNo}` : `${foundRO.name}`,
        order_no: foundDO.name,
        delivery_date: foundDO.deliveryDate || '',
        truck_no: foundDO.truckNo,
        driver_name: foundDriver || '',
        pallet_qty: foundDO.palletQty,
        worker_name: foundWS.updater.name,
        do_remark: foundDO.remark,
        reusable_pallet: foundDO.reusablePallet,
        pallet_list: foundRP.map(rp => rp.name).join(', '),
        product_list: productList.map((prod, idx) => {
            return Object.assign(Object.assign({}, prod), { list_no: idx + 1, remark: prod.cross_docking ?
                    prod.remark > 1 ? `${prod.remark} PALLETS [C/D]` : `${prod.remark} PALLET [C/D]` :
                    prod.remark > 1 ? `${prod.remark} PALLETS` : `${prod.remark} PALLET` });
        })
    }; //.. make data from do
    const formData = new form_data_1.default();
    formData.append('template', template);
    formData.append('jsonString', JSON.stringify(data));
    const response = await node_fetch_1.default(REPORT_API_URL, {
        method: 'POST',
        body: formData
    });
    return await response.text();
}
exports.renderDO = renderDO;
//# sourceMappingURL=render-do.js.map