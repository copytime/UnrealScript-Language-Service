import { SymbolKind, CompletionItemKind } from 'vscode-languageserver-types';

import { UCStructSymbol, UCSymbol, UCMethodSymbol, UCPropertySymbol } from './';
import { UCDocument } from '../DocumentListener';
import { ISymbol } from './ISymbol';

export class UCScriptStructSymbol extends UCStructSymbol {
	isProtected(): boolean {
		return true;
	}

	getKind(): SymbolKind {
		return SymbolKind.Struct;
	}

	getCompletionItemKind(): CompletionItemKind {
		return CompletionItemKind.Struct;
	}

	getTooltip(): string {
		return `struct ${this.getQualifiedName()}`;
	}

	getCompletionSymbols(_document: UCDocument): ISymbol[] {
		const symbols: ISymbol[] = [];
		for (let child = this.children; child; child = child.next) {
			symbols.push(child);
		}

		for (let parent = this.super; parent; parent = parent.super) {
			for (let child = parent.children; child; child = child.next) {
				symbols.push(child);
			}
		}
		return symbols;
	}

	acceptCompletion(_document: UCDocument, context: UCSymbol): boolean {
		return (context instanceof UCPropertySymbol || context instanceof UCMethodSymbol);
	}
}