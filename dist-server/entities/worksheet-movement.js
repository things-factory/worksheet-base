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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const worksheet_1 = require("./worksheet");
let WorksheetMovement = class WorksheetMovement {
};
__decorate([
    typeorm_1.PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], WorksheetMovement.prototype, "id", void 0);
__decorate([
    typeorm_1.ManyToOne(type => shell_1.Domain),
    __metadata("design:type", typeof (_a = typeof shell_1.Domain !== "undefined" && shell_1.Domain) === "function" ? _a : Object)
], WorksheetMovement.prototype, "domain", void 0);
__decorate([
    typeorm_1.Column({
        nullable: true
    }),
    __metadata("design:type", Date)
], WorksheetMovement.prototype, "date", void 0);
__decorate([
    typeorm_1.ManyToOne(type => worksheet_1.Worksheet),
    __metadata("design:type", worksheet_1.Worksheet)
], WorksheetMovement.prototype, "worksheet", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", Date)
], WorksheetMovement.prototype, "startTime", void 0);
__decorate([
    typeorm_1.Column(),
    __metadata("design:type", Date)
], WorksheetMovement.prototype, "endTime", void 0);
__decorate([
    typeorm_1.Column('text', {
        nullable: true
    }),
    __metadata("design:type", String)
], WorksheetMovement.prototype, "description", void 0);
WorksheetMovement = __decorate([
    typeorm_1.Entity(),
    typeorm_1.Index('ix_worksheet-movement_0', (worksheetMovement) => [worksheetMovement.domain], {
        unique: true
    })
], WorksheetMovement);
exports.WorksheetMovement = WorksheetMovement;
//# sourceMappingURL=worksheet-movement.js.map