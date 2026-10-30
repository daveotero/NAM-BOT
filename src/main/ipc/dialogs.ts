import {
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue
} from 'electron'

// Attach pickers to the window that asked for them. On Windows a parentless picker is not
// modal: the app stays clickable behind it, Browse can open a second one, and it can open
// behind the app.

export function showOpenDialogFor(event: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const owner = BrowserWindow.fromWebContents(event.sender)
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)
}

export function showSaveDialogFor(event: IpcMainInvokeEvent, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const owner = BrowserWindow.fromWebContents(event.sender)
  return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
}
