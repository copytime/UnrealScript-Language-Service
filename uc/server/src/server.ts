import * as path from 'path';
import * as fs from 'fs';

import URI from 'vscode-uri';
import {
	createConnection,
	TextDocuments,
	TextDocument,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	RemoteWorkspace,
	Hover,
	Location,
	Diagnostic,
	Definition,
	DocumentSymbolParams,
	SymbolInformation,
	ReferenceParams,
	SymbolKind,
	WorkspaceSymbolParams,
	DiagnosticSeverity,
	DocumentSymbolRequest,
	Position,
	TextDocumentPositionParams} from 'vscode-languageserver';

import {
	DocumentParser, UCDocument, UCSymbol, UCPropertySymbol, UCStructSymbol, UCClassSymbol,
	UCFunctionSymbol, UCScriptStructSymbol, UCPackage, UCSymbolRef, NATIVE_SYMBOLS, UCFieldSymbol
} from './parser';
import { FUNCTION_MODIFIERS, CLASS_DECLARATIONS, PRIMITIVE_TYPE_NAMES, VARIABLE_MODIFIERS, FUNCTION_DECLARATIONS, STRUCT_DECLARATIONS, STRUCT_MODIFIERS } from "./keywords";

let connection = createConnection(ProposedFeatures.all);

let workspaceUCFiles: string[] = [];

let documents: TextDocuments = new TextDocuments();
let projectDocuments: Map<string, UCDocument> = new Map<string, UCDocument>();

let documentItems: CompletionItem[] = [];
let projectClassTypes: CompletionItem[] = [];

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
	hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			hoverProvider: true,
			completionProvider: {
				triggerCharacters: ['.']
			},
			definitionProvider: true,
			documentSymbolProvider: true,
			referencesProvider: true
		}
	};
});

async function scanWorkspaceForClasses(workspace: RemoteWorkspace) {
	function scanPath(filePath: string, cb: (filePath: string) => void): Promise<boolean> {
		let promise = new Promise<boolean>((resolve) => {
			if (!fs.existsSync(filePath)) {
				resolve(false);
				return;
			}

			fs.lstat(filePath, (err, stats) => {
				if (stats.isDirectory()) {
					fs.readdir(filePath, (err, filePaths) => {
						for (let fileName of filePaths) {
							resolve(scanPath(path.join(filePath, fileName), cb));
						}
					});
				} else {
					if (path.extname(filePath) === '.uc') {
						cb(filePath);
					}
					resolve(true);
				}
			});
		});
		return promise;
	}

	let filePaths = [];
	let folders = await workspace.getWorkspaceFolders();
	for (let folder of folders) {
		let folderPath = URI.parse(folder.uri).fsPath;
		await scanPath(folderPath, (filePath => {
			filePaths.push(filePath);
		}));
	}
	return filePaths;
}

function initializeClassTypes(classFilePaths: string[]) {
	projectClassTypes = classFilePaths
		.map((document => {
			return {
				label: path.basename(document, '.uc'),
				kind: CompletionItemKind.Class,
				data: document
			};
		}));
}

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(async _event => {
			workspaceUCFiles = await scanWorkspaceForClasses(connection.workspace);
			initializeClassTypes(workspaceUCFiles);
		});
	}
});

interface UCSettings {

}

let documentSettings: Map<string, Thenable<UCSettings>> = new Map();

connection.onDidChangeConfiguration(() => {
	if (hasConfigurationCapability) {
		documentSettings.clear();
	} else {
	}
	documents.all().forEach(validateTextDocument);
});


documents.onDidOpen(async e => {
	if (workspaceUCFiles.length === 0) {
		workspaceUCFiles = await scanWorkspaceForClasses(connection.workspace);
		initializeClassTypes(workspaceUCFiles);
	}
	validateTextDocument(e.document);
});

documents.onDidChangeContent(async e => {
	if (workspaceUCFiles.length === 0) {
		workspaceUCFiles = await scanWorkspaceForClasses(connection.workspace);
		initializeClassTypes(workspaceUCFiles);
	}
	validateTextDocument(e.document);
});

documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

function invalidateDocument(uri: string) {
	projectDocuments.delete(uri);
}

var WorkspacePackage = new UCPackage('Workspace');
NATIVE_SYMBOLS.forEach(symbol => WorkspacePackage.addSymbol(symbol));

function parseClassDocument(className: string): UCDocument {
	// connection.console.log('Looking for external document ' + className);

	// Try the shorter route first before we scan the entire workspace!
	if (WorkspacePackage) {
		let classSymbol = WorkspacePackage.symbols.get(className.toLowerCase());
		if (classSymbol && classSymbol instanceof UCClassSymbol) {
			return classSymbol.document;
		}
	}

	let filePaths = workspaceUCFiles;
	let filePath = filePaths.find((value => {
		return path.basename(value, '.uc') === className;
	}));

	if (!filePath) {
		return undefined;
	}

	const document = projectDocuments.get(filePath);
	if (document) {
		// connection.console.log('Cached doc found for ' + className);
		return document;
	}

	// FIXME: may not exist
	let text = fs.readFileSync(filePath).toString();
	return parseDocument(filePath, text);
}

function parseDocument(uri: string, text: string): UCDocument {
	// TODO: Hash check
	let document = projectDocuments.get(uri);
	if (!document) {
		connection.console.log('Parsing document ' + uri);
		document = new UCDocument(WorkspacePackage, uri);
		document.getDocument = parseClassDocument;
		projectDocuments.set(uri, document);

		const parser = new DocumentParser(text);
		parser.parse(document);
	}
	return document;
}

function validateTextDocument(textDocument: TextDocument): Promise<void> {
	invalidateDocument(textDocument.uri);

	let document: UCDocument;
	try {
		document = parseDocument(textDocument.uri, textDocument.getText());
	} catch (err) {
		connection.sendDiagnostics({
			uri: document.uri,
			diagnostics: [Diagnostic.create(undefined, err, DiagnosticSeverity.Warning)]
		});
		return;
	}

	if (!document) {
		connection.sendDiagnostics({
			uri: document.uri,
			diagnostics: [Diagnostic.create(undefined, "Couldn't validate document!", DiagnosticSeverity.Warning)]
		});
		return;
	}

	if (document.class === null) {
		return;
	}

	document.class.link(document);
	diagnoseDocument(document);

	documentItems = []; // reset, never show any items from previous documents.
	for (let fieldStruct: UCStructSymbol = document.class; fieldStruct && fieldStruct instanceof UCStructSymbol; fieldStruct = fieldStruct.extends) {
		if (!fieldStruct.symbols) {
			continue;
		}

		for (const symbol of fieldStruct.symbols.values()) {
			documentItems.push(symbol.toCompletionItem());
		}
	}
}

function diagnoseDocument(document: UCDocument) {
	const diagnostics: Diagnostic[] = [];
	if (document.nodes && document.nodes.length > 0) {
		let errors: Diagnostic[] = document.nodes
			.map(node => {
				return Diagnostic.create(
					node.getRange(),
					node.toString()
				);
			});

		diagnostics.push(...errors);
	}

	connection.sendDiagnostics({
		uri: document.uri,
		diagnostics: diagnostics
	});
}

function getDocumentPositionSymbol(e: TextDocumentPositionParams): UCSymbol {
	let document = projectDocuments.get(e.textDocument.uri);
	if (!document) {
		return undefined;
	}
	return document.getSymbolAtPosition(e.position);
}

connection.onHover((e): Hover => {
	const symbol = getDocumentPositionSymbol(e);
	if (!symbol) {
		return undefined;
	}

	connection.console.log('Hovering: ' + symbol.getTooltip() + ' at ' + symbol.getIdRange());

	return {
		contents: symbol.getTooltip(),
		range: symbol.getIdRange()
	};
});

// Bare implementation to support "go-to-defintion" for variable declarations type references.
connection.onDefinition((e): Definition => {
	const symbol = getDocumentPositionSymbol(e);
	if (!symbol) {
		return undefined;
	}

	if (symbol instanceof UCSymbolRef) {
		let reference = symbol.getReference() as UCSymbol;
		if (reference instanceof UCSymbol) {
			return Location.create(reference.getUri() , reference.getIdRange());
		}
	}
});

connection.onDocumentSymbol((e: DocumentSymbolParams): SymbolInformation[] => {
	let document = projectDocuments.get(e.textDocument.uri);
	if (!document || !document.class) {
		return undefined;
	}

	var contextSymbols = [];
	var buildSymbolsList = (container: UCStructSymbol) => {
		for (let symbol of container.symbols.values()) {
			contextSymbols.push(symbol.toSymbolInfo());
			if (symbol instanceof UCStructSymbol) {
				buildSymbolsList(symbol as UCStructSymbol);
			}
		}
	};

	buildSymbolsList(document.class);
	return contextSymbols;
});

connection.onReferences((e: ReferenceParams): Location[] => {
	const symbol = getDocumentPositionSymbol(e);
	if (!symbol) {
		return undefined;
	}
	return symbol.getLinks();
});

connection.onCompletion((e): CompletionItem[] => {
	const symbol = getDocumentPositionSymbol(e);
	if (!symbol) {
		return undefined;
	}

	const items: CompletionItem[] = [];
	if (symbol instanceof UCClassSymbol) {
		return []
			.concat(CLASS_DECLARATIONS, FUNCTION_MODIFIERS)
			.map(kw => {
				return {
					label: kw,
					kind: CompletionItemKind.Keyword
				} as CompletionItem;
			});
	} else if(symbol instanceof UCPropertySymbol) {
		// document.class.symbols.forEach((symbol) => {
		// 	if (symbol.getKind() !== SymbolKind.Struct && symbol.getKind() !== SymbolKind.Enum) {
		// 		return;
		// 	}
		// 	items.push({
		// 		label: symbol.getName(),
		// 		detail: symbol.getTooltip(),
		// 		documentation: symbol.getDocumentation(),
		// 	});
		// });

		return []
			.concat(VARIABLE_MODIFIERS, PRIMITIVE_TYPE_NAMES)
			.map(type => {
					return {
						label: type,
						kind: CompletionItemKind.Keyword
					} as CompletionItem;
			})
			.concat(projectClassTypes, items);
	}
	else if (symbol instanceof UCFunctionSymbol) {
		// document.class.symbols.forEach((symbol) => {
		// 	if (symbol.getKind() === SymbolKind.Struct) {
		// 		return;
		// 	}
		// 	items.push({
		// 		label: symbol.getName(),
		// 		detail: symbol.getTooltip(),
		// 		documentation: symbol.getDocumentation(),
		// 	});
		// });

		return []
			.concat(FUNCTION_DECLARATIONS, FUNCTION_MODIFIERS, PRIMITIVE_TYPE_NAMES)
			.map(type => {
					return {
						label: type,
						kind: CompletionItemKind.Keyword
					} as CompletionItem;
			})
			.concat(projectClassTypes, items);
	}
	else if (symbol instanceof UCScriptStructSymbol) {
		return []
			.concat(STRUCT_DECLARATIONS, STRUCT_MODIFIERS)
			.map(type => {
					return {
						label: type,
						kind: CompletionItemKind.Keyword
					} as CompletionItem;
			});
	}

	return []
		.concat(STRUCT_DECLARATIONS)
		.map(type => {
			return {
				label: type,
				kind: CompletionItemKind.Keyword
			} as CompletionItem;
		})
		.concat(items, documentItems);
});

documents.listen(connection);
connection.listen();