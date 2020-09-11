"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
exports.deliveryOrderByWorksheetResolver = {
    async deliveryOrderByWorksheet(_, { name }, context) {
        const foundDO = await typeorm_1.getRepository(sales_base_1.DeliveryOrder).findOne({
            where: {
                domain: context.state.domain,
                name
            },
            relations: ['domain', 'bizplace', 'transportDriver', 'transportVehicle', 'releaseGood', 'creator', 'updater']
        });
        if (!foundDO)
            throw new Error('Delivery order not found!');
        const partnerBiz = await typeorm_1.getRepository(biz_base_1.Bizplace).findOne({
            where: { id: foundDO.bizplace.id }
        });
        const partnerContactPoint = await typeorm_1.getRepository(biz_base_1.ContactPoint).find({
            where: { domain: context.state.domain, bizplace: partnerBiz }
        });
        return {
            deliveryOrderInfo: {
                ownCollection: foundDO.ownCollection,
                doStatus: foundDO.status,
                truckNo: foundDO.truckNo
            },
            contactPointInfo: partnerContactPoint.map(async (cp) => {
                return {
                    id: cp.id,
                    address: cp.address || '',
                    email: cp.email || '',
                    fax: cp.fax || '',
                    phone: cp.phone || '',
                    contactName: cp.name || ''
                };
            })
        };
    }
};
//# sourceMappingURL=delivery-order-by-worksheet.js.map