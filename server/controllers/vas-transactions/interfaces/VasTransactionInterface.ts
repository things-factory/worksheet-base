export interface VasTransactionInterface<T> {
  exec(): Promise<void>

  getUpdatedOperationGuideData(): {
    data: T
    completed: boolean
  }
}
