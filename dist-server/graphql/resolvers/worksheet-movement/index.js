"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worksheet_movement_1 = require("./worksheet-movement");
const worksheet_movements_1 = require("./worksheet-movements");
const update_worksheet_movement_1 = require("./update-worksheet-movement");
const create_worksheet_movement_1 = require("./create-worksheet-movement");
const delete_worksheet_movement_1 = require("./delete-worksheet-movement");
exports.Query = Object.assign(Object.assign({}, worksheet_movements_1.worksheetMovementsResolver), worksheet_movement_1.worksheetMovementResolver);
exports.Mutation = Object.assign(Object.assign(Object.assign({}, update_worksheet_movement_1.updateWorksheetMovement), create_worksheet_movement_1.createWorksheetMovement), delete_worksheet_movement_1.deleteWorksheetMovement);
//# sourceMappingURL=index.js.map