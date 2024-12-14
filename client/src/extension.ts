import { existsSync } from 'fs';
import * as path from 'path';
import { ExtensionContext, workspace, commands, window, Uri, extensions } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;
let extensionBinFolder = ""
export function activate(context: ExtensionContext) {

	extensionBinFolder = context.asAbsolutePath(path.join('out','bin'))

	const serverModule = context.asAbsolutePath(
		path.join('out', 'server.js')
	);

	const memoryOption = '--max-old-space-size=8192';
	const debugOptions = {
		execArgv: [memoryOption, '--nolazy', '--inspect=6010']
	};
	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: {
				execArgv: [memoryOption]
			}
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions,
		}
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'unrealscript' }],
		synchronize: {
			configurationSection: 'unrealscript',
			fileEvents: [
				workspace.createFileSystemWatcher('**/*.{uc,uci}'),
				// Let's not watch for upk changes, just u files because those are expected to change often.
				workspace.createFileSystemWatcher('**/*.{u}')
			]
		},
		diagnosticCollectionName: 'UnrealScript',
		outputChannelName: 'UnrealScript',
	};

	client = new LanguageClient(
		'ucLanguageServer',
		'UnrealScript',
		serverOptions,
		clientOptions
	);
	client.start();

	let disposable = commands.registerCommand('extension.unrealscript-debugger-install-interface', installInterface);
	context.subscriptions.push(disposable);
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}


// Copy the debugger folder interface DLL from the given subpath within the extension to the given destination
// folder.
function copyInterfaceFile(folder: Uri, interfacePath: string) {
	const dllPath = path.join(extensionBinFolder, interfacePath, "interface.dll");
	let source = Uri.file(dllPath);
	let destination = Uri.file(folder.path + "/DebuggerInterface.dll");
	workspace.fs.copy(source, destination, { overwrite: true }).then(
		() => {

			function copyVaDebugger() {
				workspace.fs.copy(source,Uri.file(vaDebuggerDllPath),{overwrite:true}).then(
					()=>{
						window.showInformationMessage("Unrealscript debugger interface installed");
					},
					(reason)=>{
						window.showInformationMessage("Unrealscript debugger interface installation failed: " + reason);
					}
				)
			}

			const vaDebuggerDirPath = path.join(folder.fsPath,"WTDebugger");
			const vaDebuggerDllPath = path.join(vaDebuggerDirPath,"UCDebuggerSocket.dll");
			const dirExist = existsSync(vaDebuggerDirPath);

			if (dirExist) {
				if(existsSync(vaDebuggerDllPath)){
					//backup old va debugger
					const oldUri = Uri.file(vaDebuggerDllPath);
					const backupUri = Uri.file(path.join(vaDebuggerDirPath,`UCDebuggerSocket_${new Date().getTime()}.bck`));
					workspace.fs.copy(oldUri,backupUri,{overwrite:true}).then(
						()=>{
						copyVaDebugger();
					},(reason)=>{
						window.showInformationMessage("Unrealscript debugger interface installation failed: " + reason);
					})
				}
			}else{
				copyVaDebugger();
			}
		},
		(reason) => {
			window.showInformationMessage("Unrealscript debugger interface installation failed: " + reason);
		}
	);
}

// Show an open dialog to pick a destination folder for the debugger interface. Returns a promise for
// the selected folder.
function chooseGameFolder() {
	return window.showOpenDialog({
		"canSelectFiles": false,
		"canSelectFolders": true,
		"canSelectMany": false,
		"openLabel": "Choose game binary folder"
	});
}

// Entry point to copy the debugger interface DLL into a game folder. First prompts the user for
// 32 or 64 bit, then opens an open dialog box to choose the destination directory. Finally copies
// the file to that directory.
function installInterface() {
	window.showQuickPick(
		[
			{ "label": "Install 32-bit debugger interface", "interfacePath": "win32" },
			{ "label": "Install 64-bit debugger interface", "interfacePath": "win64" }
		],
		{ canPickMany: false }
	).then((pick) => {
		if (pick)
			chooseGameFolder().then((folders) => {
				if (folders)
					copyInterfaceFile(folders[0], pick.interfacePath);
			});
	});
}
