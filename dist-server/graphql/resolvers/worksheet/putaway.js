"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.putaway = {
    async putaway(_, { worksheetDetailName, palletId, toLocation }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // inventory has reusable pallet id
            // client side passed in single worksheetDetail
            let foundReusablePallet;
            foundReusablePallet = await trxMgr.getRepository(warehouse_base_1.Pallet).findOne({
                where: {
                    domain: context.state.domain,
                    name: palletId
                },
                relations: ['domain']
            });
            const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetDetailName,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.PUTAWAY
                },
                relations: [
                    'worksheet',
                    'worksheet.arrivalNotice',
                    'targetInventory',
                    'targetInventory.inventory',
                    'targetInventory.inventory.reusablePallet'
                ]
            });
            if (!worksheetDetail)
                throw new Error(`Worksheet Details doesn't exists`);
            let arrivalNotice = worksheetDetail.worksheet.arrivalNotice;
            if (foundReusablePallet) {
                let inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).find({
                    where: {
                        domain: context.state.domain,
                        reusablePallet: foundReusablePallet,
                        refOrderId: arrivalNotice.id,
                        status: typeorm_1.In([warehouse_base_1.INVENTORY_STATUS.PUTTING_AWAY, warehouse_base_1.INVENTORY_STATUS.UNLOADED])
                    }
                });
                // use GAN find worksheet
                const foundWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                    where: {
                        domain: context.state.domain,
                        arrivalNotice,
                        type: constants_1.WORKSHEET_TYPE.PUTAWAY,
                        status: constants_1.WORKSHEET_STATUS.EXECUTING
                    },
                    relations: [
                        'worksheetDetails',
                        'worksheetDetails.targetInventory',
                        'worksheetDetails.targetInventory.inventory'
                    ]
                });
                await Promise.all(inventory.map(async (inv) => {
                    const foundWSD = foundWS.worksheetDetails.filter((wsd) => wsd.targetInventory.inventory.name === inv.name);
                    await executePutaway(foundWSD[0], arrivalNotice, inv.palletId, toLocation, context.state.domain, context.state.user, trxMgr);
                }));
            }
            else {
                let inReusablePallet = worksheetDetail.targetInventory.inventory.reusablePallet;
                if (inReusablePallet) {
                    let inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).find({
                        where: {
                            domain: context.state.domain,
                            reusablePallet: inReusablePallet,
                            refOrderId: arrivalNotice.id,
                            status: typeorm_1.In([warehouse_base_1.INVENTORY_STATUS.PUTTING_AWAY, warehouse_base_1.INVENTORY_STATUS.UNLOADED])
                        }
                    });
                    // use GAN find worksheet
                    const foundWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                        where: {
                            domain: context.state.domain,
                            arrivalNotice,
                            type: constants_1.WORKSHEET_TYPE.PUTAWAY,
                            status: constants_1.WORKSHEET_STATUS.EXECUTING
                        },
                        relations: [
                            'worksheetDetails',
                            'worksheetDetails.targetInventory',
                            'worksheetDetails.targetInventory.inventory'
                        ]
                    });
                    await Promise.all(inventory.map(async (inv) => {
                        const foundWSD = foundWS.worksheetDetails.filter((wsd) => wsd.targetInventory.inventory.name === inv.name);
                        await executePutaway(foundWSD[0], arrivalNotice, inv.palletId, toLocation, context.state.domain, context.state.user, trxMgr);
                    }));
                }
                else {
                    await executePutaway(worksheetDetail, arrivalNotice, palletId, toLocation, context.state.domain, context.state.user, trxMgr);
                }
            }
        });
    }
};
async function executePutaway(worksheetDetail, arrivalNotice, palletId, locationName, domain, user, trxMgr) {
    // 1. get worksheet detail
    let targetInventory = worksheetDetail.targetInventory;
    let inventory = targetInventory.inventory;
    if (inventory.palletId !== palletId)
        throw new Error('Pallet ID is invalid');
    // 3. get to location object
    const location = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
        where: {
            domain,
            name: locationName,
            type: typeorm_1.In([warehouse_base_1.LOCATION_TYPE.SHELF, warehouse_base_1.LOCATION_TYPE.BUFFER, warehouse_base_1.LOCATION_TYPE.FLOOR])
        },
        relations: ['warehouse']
    });
    if (!location)
        throw new Error(`Location doesn't exists`);
    // 4. update location of inventory (buffer location => toLocation)
    inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { location, status: warehouse_base_1.INVENTORY_STATUS.STORED, warehouse: location.warehouse, zone: location.warehouse.zone, updater: user }));
    // 4. 1) Update status of location
    if (location.status === warehouse_base_1.LOCATION_STATUS.EMPTY) {
        await trxMgr.getRepository(warehouse_base_1.Location).save(Object.assign(Object.assign({}, location), { status: warehouse_base_1.LOCATION_STATUS.OCCUPIED, updater: user }));
    }
    // 5. add inventory history
    await utils_1.generateInventoryHistory(inventory, arrivalNotice, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.PUTAWAY, 0, 0, user, trxMgr);
    // 6. update status of order inventory
    await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: user }));
    // 7. update status of worksheet details (EXECUTING => DONE)
    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: user }));
}
//# sourceMappingURL=putaway.js.map