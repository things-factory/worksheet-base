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
const worksheet_1 = require("./worksheet");
let WorksheetDetail = class WorksheetDetail {
};
__decorate([
    typeorm_1.PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "id", void 0);
__decorate([
    typeorm_1.ManyToOne(type => shell_1.Domain),
    __metadata("design:type", typeof (_a = typeof shell_1.Domain !== "undefined" && shell_1.Domain) === "function" ? _a : Object)
], WorksheetDetail.prototype, "domain", void 0);
__decorate([
    typeorm_1.ManyToOne(type => biz_base_1.Bizplace),
    __metadata("design:type", typeof (_b = typeof biz_base_1.Bizplace !== "undefined" && biz_base_1.Bizplace) === "function" ? _b : Object)
], WorksheetDetail.prototype, "bizplace", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "name", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "description", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true,
        type: 'smallint',
        default: 0
    }),
    __metadata("design:type", Number)
], WorksheetDetail.prototype, "seq", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "type", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "status", void 0);
__decorate([
    typeorm_1.ManyToOne(type => worksheet_1.Worksheet, {
        nullable: false
    }),
    __metadata("design:type", worksheet_1.Worksheet)
], WorksheetDetail.prototype, "worksheet", void 0);
__decorate([
    typeorm_1.ManyToOne(type => biz_base_1.Worker),
    __metadata("design:type", typeof (_c = typeof biz_base_1.Worker !== "undefined" && biz_base_1.Worker) === "function" ? _c : Object)
], WorksheetDetail.prototype, "worker", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.OrderProduct),
    __metadata("design:type", typeof (_d = typeof sales_base_1.OrderProduct !== "undefined" && sales_base_1.OrderProduct) === "function" ? _d : Object)
], WorksheetDetail.prototype, "targetProduct", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.OrderVas),
    __metadata("design:type", typeof (_e = typeof sales_base_1.OrderVas !== "undefined" && sales_base_1.OrderVas) === "function" ? _e : Object)
], WorksheetDetail.prototype, "targetVas", void 0);
__decorate([
    typeorm_1.ManyToOne(type => sales_base_1.OrderInventory),
    __metadata("design:type", typeof (_f = typeof sales_base_1.OrderInventory !== "undefined" && sales_base_1.OrderInventory) === "function" ? _f : Object)
], WorksheetDetail.prototype, "targetInventory", void 0);
__decorate([
    typeorm_1.ManyToOne(type => warehouse_base_1.Location),
    __metadata("design:type", typeof (_g = typeof warehouse_base_1.Location !== "undefined" && warehouse_base_1.Location) === "function" ? _g : Object)
], WorksheetDetail.prototype, "fromLocation", void 0);
__decorate([
    typeorm_1.ManyToOne(type => warehouse_base_1.Location),
    __metadata("design:type", typeof (_h = typeof warehouse_base_1.Location !== "undefined" && warehouse_base_1.Location) === "function" ? _h : Object)
], WorksheetDetail.prototype, "toLocation", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "remark", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", String)
], WorksheetDetail.prototype, "issue", void 0);
__decorate([
    typeorm_1.ManyToOne(type => auth_base_1.User, {
        nullable: true
    }),
    __metadata("design:type", typeof (_j = typeof auth_base_1.User !== "undefined" && auth_base_1.User) === "function" ? _j : Object)
], WorksheetDetail.prototype, "creator", void 0);
__decorate([
    typeorm_1.ManyToOne(type => auth_base_1.User, {
        nullable: true
    }),
    __metadata("design:type", typeof (_k = typeof auth_base_1.User !== "undefined" && auth_base_1.User) === "function" ? _k : Object)
], WorksheetDetail.prototype, "updater", void 0);
__decorate([
    typeorm_1.CreateDateColumn(),
    __metadata("design:type", Date)
], WorksheetDetail.prototype, "createdAt", void 0);
__decorate([
    typeorm_1.UpdateDateColumn(),
    __metadata("design:type", Date)
], WorksheetDetail.prototype, "updatedAt", void 0);
WorksheetDetail = __decorate([
    typeorm_1.Entity(),
    typeorm_1.Index('ix_worksheet-detail_0', (worksheetDetail) => [worksheetDetail.domain, worksheetDetail.bizplace, worksheetDetail.name], { unique: true })
], WorksheetDetail);
exports.WorksheetDetail = WorksheetDetail;
//# sourceMappingURL=worksheet-detail.js.map