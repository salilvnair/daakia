/**
 * DaakiaSMConsumer — wires @salilvnair/state-machine to Daakia's extension host.
 *
 * Register once at app startup:
 *   await useSMWorkspaceStore.getState().registerConsumer(new DaakiaSMConsumer())
 *
 * Storage: ~/.salilvnair/daakia-vsce/sm-workflows.json (written by extension host)
 */
import { SMConsumerBase } from '@salilvnair/state-machine'
import type { SMWorkspaceData } from '@salilvnair/state-machine'
import type { SMachine, SMachineFolder } from '@salilvnair/state-machine'
import type { SMTodoItem } from '@salilvnair/state-machine'
import { postMsg } from '../vscode'

export class DaakiaSMConsumer extends SMConsumerBase {
  async onLoadWorkspace(): Promise<SMWorkspaceData> {
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'smWorkflow:init') {
          window.removeEventListener('message', handler)
          resolve({
            machines: (event.data.machines ?? []) as SMachine[],
            folders:  (event.data.folders  ?? []) as SMachineFolder[],
            todos:    (event.data.todos    ?? []) as SMTodoItem[],
          })
        }
      }
      window.addEventListener('message', handler)
      postMsg({ type: 'smWorkflow:getAll' })
      // Timeout safety — resolve empty after 5s if extension host doesn't respond
      setTimeout(() => {
        window.removeEventListener('message', handler)
        resolve({ machines: [], folders: [], todos: [] })
      }, 5000)
    })
  }

  override onSaveMachine(machine: SMachine) {
    postMsg({ type: 'smWorkflow:save', machine })
  }

  override onDeleteMachine(id: string) {
    postMsg({ type: 'smWorkflow:delete', id })
  }

  override onSaveFolder(folder: SMachineFolder) {
    postMsg({ type: 'smWorkflow:saveFolder', folder })
  }

  override onDeleteFolder(id: string) {
    postMsg({ type: 'smWorkflow:deleteFolder', id })
  }

  override onSaveTodos(todos: SMTodoItem[]) {
    postMsg({ type: 'smWorkflow:saveTodos', todos })
  }
}
