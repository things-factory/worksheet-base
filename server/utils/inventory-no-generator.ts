import uuid from 'uuid/v4'

export class InventoryNoGenerator {
  static inventoryName(locationName: String, batchId: String) {
    return `${locationName}-${batchId}-${uuid()}`
  }

  static inventoryHistoryName() {
    return uuid()
  }
}
