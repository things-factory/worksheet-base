"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const sales_base_1 = require("@things-factory/sales-base");
exports.palletOutbound = {
    async palletOutbound(_, { refOrderNo, patches }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const releaseGood = await typeorm_1.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { name: refOrderNo },
                relations: ['bizplace']
            });
            let palletPatches = patches.length > 0
                ? await typeorm_1.getRepository(warehouse_base_1.Pallet).find({
                    where: { id: typeorm_1.In(patches.map(pallet => pallet.id)) },
                    relations: ['owner', 'holder', 'domain', 'creator', 'updater']
                })
                : [];
            let releasedPallets = await typeorm_1.getRepository(warehouse_base_1.Pallet).find({
                where: { refOrderNo: refOrderNo },
                relations: ['owner', 'holder', 'domain', 'creator', 'updater']
            });
            // get added pallets
            let addedPallets = palletPatches
                .filter(e => e.refOrderNo == null)
                .map(pallet => {
                return Object.assign(Object.assign({}, pallet), { holder: releaseGood.bizplace, refOrderNo: refOrderNo, seq: pallet.seq + 1 });
            });
            // get removed pallets
            let removedPallets = releasedPallets
                .filter(e => !palletPatches.find(patch => patch.id == e.id))
                .map(pallet => {
                return Object.assign(Object.assign({}, pallet), { holder: pallet.owner, refOrderNo: null, seq: pallet.seq - 1 });
            });
            // Add into pallet history for outbound
            await Promise.all(addedPallets.map(async (pallet) => {
                let newHistory = Object.assign(Object.assign({}, pallet), { pallet: pallet, domain: context.state.domain, creator: context.state.user, updater: context.state.user, transactionType: 'OUTBOUND' });
                delete newHistory.id;
                await trxMgr.getRepository(warehouse_base_1.PalletHistory).save(Object.assign({}, newHistory));
            }));
            // Roll back pallet history
            await Promise.all(removedPallets.map(async (item) => {
                trxMgr.getRepository(warehouse_base_1.PalletHistory).delete({ name: item.name, seq: item.seq + 1 });
            }));
            // Update Pallet data
            await Promise.all([...addedPallets, ...removedPallets].map(async (item) => {
                await trxMgr.getRepository(warehouse_base_1.Pallet).save(Object.assign({}, item));
            }));
            return true;
        });
    }
};
//# sourceMappingURL=pallet-outbound.js.map