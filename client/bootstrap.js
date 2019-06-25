import { store } from '@things-factory/shell'
import worksheetBase from './reducers/main'

export default function bootstrap() {
  store.addReducers({
    worksheetBase
  })
}
