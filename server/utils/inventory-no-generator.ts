import uuid from 'uuid/v4'

export class InventoryNoGenerator {
  static inventoryName() {
    return uuid()
  }

  static inventoryHistoryName() {
    return uuid()
  }
}
