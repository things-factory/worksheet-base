"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const generate_release_good_worksheet_1 = require("./generate-release-good-worksheet");
const picking_1 = require("./picking");
exports.crossDockPickingResolver = {
    async crossDockPicking(_, { worksheetDetailName, palletId, releaseQty }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const { domain, user } = context.state;
            const wsd = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: { domain, name: worksheetDetailName },
                relations: [
                    'targetInventory',
                    'targetInventory.domain',
                    'targetInventory.bizplace',
                    'targetInventory.releaseGood',
                    'targetInventory.product',
                    'worksheet',
                    'worksheet.releaseGood',
                    'worksheet.releaseGood.arrivalNotice'
                ]
            });
            if (!wsd)
                throw new Error(`Failed to find picking worksheet detail by passed worksheet detail name`);
            const worksheet = wsd.worksheet;
            const releaseGood = worksheet.releaseGood;
            let targetInv = wsd.targetInventory;
            const bizplace = targetInv.bizplace;
            let inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: {
                    domain,
                    bizplace,
                    palletId,
                    status: typeorm_1.In([warehouse_base_1.INVENTORY_STATUS.STORED, warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED, warehouse_base_1.INVENTORY_STATUS.UNLOADED])
                },
                relations: ['product', 'location']
            });
            if (!inventory)
                throw new Error(`Failed to find inventory by passed pallet ID (${palletId})`);
            const hasSameCondition = inventory.batchId === targetInv.batchId &&
                inventory.product.id === targetInv.product.id &&
                inventory.packingType === targetInv.packingType;
            if (!hasSameCondition)
                throw new Error(`Pallet (${palletId}) doesn't have same condition compared with order has`);
            if (inventory.qty < releaseQty)
                throw new Error(`Release qty is bigger than what pallet has`);
            if (targetInv.releaseQty < releaseQty)
                throw new Error(`Release qty is bigger than required qty`);
            const unitWeight = inventory.weight / inventory.qty;
            const releaseWeight = releaseQty * unitWeight;
            const remainQty = targetInv.releaseQty - releaseQty;
            const remainWeight = targetInv.releaseWeight - releaseWeight;
            const originWSD = await fetchOriginalWSD(trxMgr, domain.id, releaseGood.id, targetInv.batchId, targetInv.packingType, targetInv.product.id, inventory.id);
            if (!originWSD) {
                // Update target inventory information
                // 1. update release amount
                // 2. assign inventory
                targetInv.releaseQty = releaseQty;
                targetInv.releaseWeight = releaseWeight;
                targetInv.inventory = inventory;
                targetInv = await trxMgr.getRepository(sales_base_1.OrderInventory).save(targetInv);
                if (remainQty > 0 || remainWeight > 0) {
                    // Need to create order inventory and worksheet detail without inventory assignment
                    let newTargetInv = Object.assign({}, targetInv);
                    delete newTargetInv.id;
                    newTargetInv.name = sales_base_1.OrderNoGenerator.orderInventory();
                    newTargetInv.releaseQty = remainQty;
                    newTargetInv.releaseWeight = remainWeight;
                    newTargetInv.inventory = null;
                    newTargetInv.creator = user;
                    newTargetInv.updater = user;
                    newTargetInv = await trxMgr.getRepository(sales_base_1.OrderInventory).save(newTargetInv);
                    await generate_release_good_worksheet_1.generatePickingWorksheetDetail(trxMgr, domain, bizplace, user, worksheet, newTargetInv, constants_1.WORKSHEET_STATUS.EXECUTING);
                }
            }
            else {
                let { targetInventory: originOrdInv } = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne(originWSD.id, {
                    relations: ['targetInventory']
                });
                originOrdInv.releaseQty += releaseQty;
                originOrdInv.releaseWeight += releaseWeight;
                originOrdInv.updater = user;
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(originOrdInv);
                targetInv.releaseQty -= releaseQty;
                targetInv.releaseWeight -= releaseWeight;
                targetInv.updater = user;
                if (targetInv.releaseQty === 0 || targetInv.releaseWeight === 0) {
                    // Delete worksheet detail
                    await trxMgr.getRepository(entities_1.WorksheetDetail).delete(wsd.id);
                    // Delete order inventory
                    await trxMgr.getRepository(sales_base_1.OrderInventory).delete(targetInv.id);
                }
                else {
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(targetInv);
                }
            }
            await picking_1.executePicking(worksheetDetailName, inventory.palletId, inventory.location.name, releaseQty, domain, user, trxMgr);
        });
    }
};
async function fetchOriginalWSD(trxMgr, domainId, releaseGoodId, batchId, packingType, productId, inventoryId) {
    let qb = trxMgr.createQueryBuilder(entities_1.WorksheetDetail, 'wsd');
    return qb
        .leftJoin(sales_base_1.OrderInventory, 'oi', 'wsd.target_inventory_id = oi.id')
        .leftJoin(warehouse_base_1.Inventory, 'inv', 'oi.inventory_id = inv.id')
        .andWhere('wsd.domain_id = :domainId')
        .andWhere('wsd.status = :status')
        .andWhere('oi.release_good_id = :releaseGoodId')
        .andWhere('oi.batch_id = :batchId')
        .andWhere('oi.packing_type = :packingType')
        .andWhere('oi.product_id = :productId')
        .andWhere('inv.id = :inventoryId')
        .setParameters({
        domainId,
        status: constants_1.WORKSHEET_STATUS.DONE,
        releaseGoodId,
        batchId,
        packingType,
        productId,
        inventoryId
    })
        .getOne();
}
exports.fetchOriginalWSD = fetchOriginalWSD;
//# sourceMappingURL=cross-dock-picking.js.map