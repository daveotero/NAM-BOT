// ipcRenderer.invoke reports a main-process failure as
// "Error invoking remote method '<channel>': Error: <message>". Only <message> is for people.
const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/

export function stripIpcErrorPrefix(message: string): string {
  return message.replace(IPC_ERROR_PREFIX, '')
}
