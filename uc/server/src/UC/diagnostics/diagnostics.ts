import { Range } from 'vscode-languageserver-types';
import { UCSymbol, UCReferenceSymbol } from "../symbols";

export interface IDiagnosticNode {
	getRange(): Range;
}

export class SyntaxErrorNode implements IDiagnosticNode {
	constructor(private range: Range, private error: string) {
	}

	getRange(): Range {
		return this.range;
	}

	toString(): string {
		return this.error;
	}
}

export class SemanticErrorNode implements IDiagnosticNode {
	constructor(private symbol: UCSymbol | UCReferenceSymbol, private error: string) {
	}

	getRange(): Range {
		return this.symbol.getRange();
	}

	toString(): string {
		return this.error;
	}
}

export class UnrecognizedTypeNode implements IDiagnosticNode {
	constructor(private symbol: UCReferenceSymbol) {
	}

	getRange(): Range {
		return this.symbol.getRange();
	}

	toString(): string {
		return `Type '${this.symbol.getName()}' not found!`;
	}
}

export class UnrecognizedFieldNode implements IDiagnosticNode {
	constructor(private symbol: UCReferenceSymbol, private context?: UCSymbol) {
	}

	getRange(): Range {
		return this.symbol.getRange();
	}

	toString(): string {
		return this.context
			? `'${this.symbol.getName()}' Does not exist on type '${this.context.getName()}'!`
			: `'${this.symbol.getName()}' Does not exist!`;
	}
}
