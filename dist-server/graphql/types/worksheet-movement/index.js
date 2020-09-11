"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const new_worksheet_movement_1 = require("./new-worksheet-movement");
const worksheet_movement_1 = require("./worksheet-movement");
const worksheet_movement_list_1 = require("./worksheet-movement-list");
const worksheet_movement_patch_1 = require("./worksheet-movement-patch");
exports.Mutation = `
  createWorksheetMovement (
    worksheetMovement: NewWorksheetMovement!
  ): WorksheetMovement

  updateWorksheetMovement (
    id: String!
    patch: WorksheetMovementPatch!
  ): WorksheetMovement

  deleteWorksheetMovement (
    id: String!
  ): WorksheetMovement

  publishWorksheetMovement (
    id: String!
  ): WorksheetMovement
`;
exports.Query = `
  worksheetMovements(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetMovementList
  worksheetMovement(id: String!): WorksheetMovement
`;
exports.Types = [worksheet_movement_1.WorksheetMovement, new_worksheet_movement_1.NewWorksheetMovement, worksheet_movement_patch_1.WorksheetMovementPatch, worksheet_movement_list_1.WorksheetMovementList];
//# sourceMappingURL=index.js.map