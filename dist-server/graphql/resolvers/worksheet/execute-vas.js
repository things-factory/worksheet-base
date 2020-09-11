"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.executeVasResolver = {
    async executeVas(_, { worksheetDetail, palletId }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const domain = context.state.domain;
            const user = context.state.user;
            /**
             * @description If pallet id param is exists.
             * Meaning, the VAS order have been requested with Arrival Notice or Release Order
             * Those types of VAS doesn't have flow to assign specific vas target inventory
             * Assignment should be done within executeVas transaction.
             */
            await executeVas(trxMgr, worksheetDetail, domain, user, palletId);
        });
    }
};
async function checkPalletAcceptable(trxMgr, palletId, vasWS, vasWSD, domain) {
    var _a;
    // inventory가 존재해야함
    const inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
        where: { domain, palletId },
        relations: ['product']
    });
    if (!inventory)
        throw new Error(`Can't find inventory by pallet ID (${palletId})`);
    // 현재 작업 set에서 하나라도 모두 완료된 유형의 VAS가 존재할 경우
    // 해당 VAS를 처리한 pallet 리스트에 한하여 작업을 수행 해야함 (동일한 SET는 동일한 군집의 Pallet을 대상으로 처리되어야 하기 때문에)
    vasWS = await trxMgr.getRepository(entities_1.Worksheet).findOne(vasWS.id, {
        relations: [
            'worksheetDetails',
            'worksheetDetails.targetVas',
            'worksheetDetails.targetVas.inventory',
            'worksheetDetails.targetVas.vas'
        ]
    });
    const vasIds = vasWS.worksheetDetails
        .filter((wsd) => wsd.targetVas.set === vasWSD.targetVas.set)
        .map((wsd) => wsd.targetVas.vas.id);
    let completedCnt = {};
    vasIds.forEach((vasId) => (completedCnt[vasId] = 0));
    vasWS.worksheetDetails.forEach((wsd) => {
        if (wsd.status !== constants_1.WORKSHEET_STATUS.DONE) {
            completedCnt[wsd.targetVas.vas.id]++;
        }
    });
    let finishedVasId;
    for (let vasId in completedCnt) {
        if (completedCnt[vasId] === 0) {
            finishedVasId = vasId;
            break;
        }
    }
    if (finishedVasId) {
        const availPalletIds = vasWS.worksheetDetails
            .filter((wsd) => wsd.targetVas.vas.id === finishedVasId)
            .map((wsd) => wsd.targetVas.inventory.palletId);
        if (availPalletIds.indexOf(inventory.palletId) >= 0) {
            return inventory;
        }
        else {
            throw new Error(`Pallet (${palletId} is not suitable for doing this VAS)`);
        }
    }
    // refOrder에 따라 적절한 상태를 가지고 있어야함
    // Arrival Notice = 'PARTIALLY_UNLOADED or PUTTING_AWAY
    const refOrder = vasWS.arrivalNotice || vasWS.releaseGood;
    if (refOrder instanceof sales_base_1.ArrivalNotice) {
        const acceptableStatus = [warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED, warehouse_base_1.INVENTORY_STATUS.PUTTING_AWAY];
        if (acceptableStatus.indexOf(inventory.status) < 0)
            throw new Error(`The pallet doesn't have right status for doing VAS`);
    }
    else if (refOrder instanceof sales_base_1.ReleaseGood) {
        throw new Error('TODO: Status check for Release Good');
    }
    // target vas의 조건에 충족해야 함 (targetBatchId, targetProduct)
    const { targetBatchId, targetProduct } = vasWSD.targetVas;
    if (targetBatchId && targetBatchId !== inventory.batchId) {
        throw new Error(`The pallet (${inventory.palletId}) doesn't have correct batch ID (${targetBatchId})`);
    }
    if (((_a = targetProduct) === null || _a === void 0 ? void 0 : _a.id) && targetProduct.id !== inventory.product.id) {
        throw new Error(`The pallet (${inventory.palletId}) doesn't have correct product (${targetProduct.name})`);
    }
    // reference order와 관계되어 있는 inventory여야 함
    if (refOrder instanceof sales_base_1.ArrivalNotice) {
        if (inventory.refOrderId !== refOrder.id)
            throw new Error(`The pallet ${inventory.palletId} is not related with GAN (${refOrder.name})`);
    }
    // 다른 vas order set에 포함되어 있지 않아야함
    const relatedInvs = vasWS.worksheetDetails
        .filter((wsd // 현재 작업대상이 아니고 현재 작업 대상과 같은 세트가 아니고 인벤토리 값이 있는
    ) => wsd.id !== vasWSD.id && wsd.targetVas.set !== vasWSD.targetVas.set && wsd.targetVas.inventory)
        .map((wsd) => wsd.targetVas.inventory);
    if (relatedInvs.find((relInv) => relInv.palletId === inventory.palletId)) {
        throw new Error(`The pallet (${inventory.palletId}) is already assigned for another VAS SET`);
    }
    // 현재 작업유형에 동이한 pallet으로 처리된 이력이 없어야함
    const completedWSD = vasWS.worksheetDetails.filter((wsd) => wsd.status === constants_1.WORKSHEET_STATUS.DONE &&
        wsd.targetVas.set === vasWSD.targetVas.set &&
        wsd.targetVas.vas.id === vasWSD.targetVas.vas.id);
    if (completedWSD.find((wsd) => wsd.targetVas.inventory.palletId === palletId)) {
        throw new Error(`This VAS is finished for pallet (${palletId}) already.`);
    }
    return inventory;
}
async function executeVas(trxMgr, worksheetDetail, domain, user, palletId) {
    const worksheetDetailName = worksheetDetail.name;
    const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
        where: {
            domain,
            name: worksheetDetailName,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            type: constants_1.WORKSHEET_TYPE.VAS
        },
        relations: [
            'bizplace',
            'worksheet',
            'worksheet.arrivalNotice',
            'worksheet.releaseGood',
            'targetVas',
            'targetVas.vas',
            'targetVas.arrivalNotice',
            'targetVas.releaseGood',
            'targetVas.vasOrder',
            'targetVas.targetProduct'
        ]
    });
    if (!foundWorksheetDetail)
        throw new Error("Worksheet doesn't exists");
    const bizplace = foundWorksheetDetail.bizplace;
    const worksheet = foundWorksheetDetail.worksheet;
    if (palletId) {
        const inventory = await checkPalletAcceptable(trxMgr, palletId, worksheet, foundWorksheetDetail, domain);
        let targetVas = foundWorksheetDetail.targetVas;
        const totalTargetQty = targetVas.qty;
        // inventory assigment
        targetVas.inventory = inventory;
        // 현재 작업 대상 target vas의 수량을 inventory의 수량 만큼 감소 시킴
        targetVas.qty = inventory.qty;
        targetVas = await trxMgr.getRepository(sales_base_1.OrderVas).save(targetVas);
        // 남은 수량이 있다면 새로운 worksheet detail과 target vas를 생성
        const remainQty = totalTargetQty - inventory.qty;
        if (remainQty > 0) {
            let copiedWSD = Object.assign({}, foundWorksheetDetail);
            delete copiedWSD.id;
            let copiedOV = Object.assign({}, targetVas);
            delete copiedOV.id;
            copiedOV = await trxMgr.getRepository(sales_base_1.OrderVas).save(Object.assign(Object.assign({}, copiedOV), { domain,
                bizplace, name: sales_base_1.OrderNoGenerator.orderVas(), qty: remainQty, creator: user, updater: user }));
            // Create new worksheet detail
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, copiedWSD), { domain,
                bizplace, name: utils_1.WorksheetNoGenerator.vasDetail(), targetVas: copiedOV, creator: user, updater: user }));
        }
    }
    let targetVas = foundWorksheetDetail.targetVas;
    if (!targetVas)
        throw new Error("VAS doesn't exists");
    // 1. update status of worksheetDetail (EXECUTING => DONE)
    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign(Object.assign({}, foundWorksheetDetail), worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: user }));
    // 2. update vas
    await trxMgr.getRepository(sales_base_1.OrderVas).save(Object.assign(Object.assign({}, targetVas), { status: sales_base_1.ORDER_VAS_STATUS.COMPLETED, updater: user }));
}
exports.executeVas = executeVas;
//# sourceMappingURL=execute-vas.js.map