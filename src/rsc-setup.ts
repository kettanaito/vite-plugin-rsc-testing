import './rsc-mocker-stub'
import * as ReactRsc from '@vitejs/plugin-rsc/react/rsc'

declare let __vite_rsc_raw_import__: (id: string) => Promise<unknown>

ReactRsc.setRequireModule({
  load: (id) => __vite_rsc_raw_import__(/* @vite-ignore */ id),
})

export const {
  createTemporaryReferenceSet,
  decodeReply,
  decodeAction,
  decodeFormState,
  loadServerAction,
  renderToReadableStream,
} = ReactRsc
