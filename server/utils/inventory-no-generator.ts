import uuid from 'uuid/v4'

export class InventoryNoGenerator {
  static inventoryName(locationName: String, productName: String) {
    return `${locationName}-${productName}-${uuid()}`
  }
}
