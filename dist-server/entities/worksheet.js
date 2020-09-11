"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const worksheet_detail_1 = require("./worksheet-detail");
let Worksheet = class Worksheet {
};
__decorate([
    typeorm_1.PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], Worksheet.prototype, "id", void 0);
__decorate([
    typeorm_1.ManyToOne(type => shell_1.Domain, {
        nullable: false
    }),
    __metadata("design:type", typeof (_a = typeof shell_1.Domain !== "undefined" && shell_1.Domain) === "function" ? _a : Object)
], Worksheet.prototype, "domain", void 0);
__decorate([
    typeorm_1.ManyToOne(type => biz_base_1.Bizplace, {
        nullable: false
    }),
    __metadata("design:type", typeof (_b = typeof biz_base_1.Bizplace !== "undefined" && biz_base_1.Bizplace) === "function" ? _b : Object)
], Worksheet.prototype, "bizplace", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.ArrivalNotice),
    __metadata("design:type", typeof (_c = typeof sales_base_1.ArrivalNotice !== "undefined" && sales_base_1.ArrivalNotice) === "function" ? _c : Object)
], Worksheet.prototype, "arrivalNotice", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.ReleaseGood),
    __metadata("design:type", typeof (_d = typeof sales_base_1.ReleaseGood !== "undefined" && sales_base_1.ReleaseGood) === "function" ? _d : Object)
], Worksheet.prototype, "releaseGood", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.InventoryCheck),
    __metadata("design:type", typeof (_e = typeof sales_base_1.InventoryCheck !== "undefined" && sales_base_1.InventoryCheck) === "function" ? _e : Object)
], Worksheet.prototype, "inventoryCheck", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.VasOrder),
    __metadata("design:type", typeof (_f = typeof sales_base_1.VasOrder !== "undefined" && sales_base_1.VasOrder) === "function" ? _f : Object)
], Worksheet.prototype, "vasOrder", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.ShippingOrder),
    __metadata("design:type", typeof (_g = typeof sales_base_1.ShippingOrder !== "undefined" && sales_base_1.ShippingOrder) === "function" ? _g : Object)
], Worksheet.prototype, "shippingOrder", void 0);
__decorate([
    typeorm_1.ManyToOne(type => warehouse_base_1.Location),
    __metadata("design:type", typeof (_h = typeof warehouse_base_1.Location !== "undefined" && warehouse_base_1.Location) === "function" ? _h : Object)
], Worksheet.prototype, "bufferLocation", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", String)
], Worksheet.prototype, "name", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", String)
], Worksheet.prototype, "description", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", String)
], Worksheet.prototype, "type", void 0);
__decorate([
    typeorm_1.OneToMany(type => worksheet_detail_1.WorksheetDetail, worksheetDetail => worksheetDetail.worksheet),
    __metadata("design:type", Array)
], Worksheet.prototype, "worksheetDetails", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", String)
], Worksheet.prototype, "status", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", Date)
], Worksheet.prototype, "startedAt", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", Date)
], Worksheet.prototype, "endedAt", void 0);
__decorate([
    typeorm_1.ManyToOne(type => auth_base_1.User, {
        nullable: true
    }),
    __metadata("design:type", typeof (_j = typeof auth_base_1.User !== "undefined" && auth_base_1.User) === "function" ? _j : Object)
], Worksheet.prototype, "creator", void 0);
__decorate([
    typeorm_1.ManyToOne(type => auth_base_1.User, {
        nullable: true
    }),
    __metadata("design:type", typeof (_k = typeof auth_base_1.User !== "undefined" && auth_base_1.User) === "function" ? _k : Object)
], Worksheet.prototype, "updater", void 0);
__decorate([
    typeorm_1.CreateDateColumn(),
    __metadata("design:type", Date)
], Worksheet.prototype, "createdAt", void 0);
__decorate([
    typeorm_1.UpdateDateColumn(),
    __metadata("design:type", Date)
], Worksheet.prototype, "updatedAt", void 0);
Worksheet = __decorate([
    typeorm_1.Entity(),
    typeorm_1.Index('ix_worksheet_0', (worksheet) => [worksheet.domain, worksheet.bizplace, worksheet.name], {
        unique: true
    })
], Worksheet);
exports.Worksheet = Worksheet;
//# sourceMappingURL=worksheet.js.map