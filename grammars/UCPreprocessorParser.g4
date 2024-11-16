parser grammar UCPreprocessorParser;

options {
	tokenVocab = UCLexer;
}

@parser::header {
	export interface IMacroSymbol {
		params?: string[];
		text: string;
	}
}

@parser::members {
	static globalSymbols = new Map<string, IMacroSymbol>();

	currentState: boolean[] = [true];
	currentSymbols = new Map<string, IMacroSymbol>();

	filePath: string;

	getSymbolValue(symbolName: string): IMacroSymbol | undefined {
		return this.currentSymbols.get(symbolName) ?? UCPreprocessorParser.globalSymbols.get(symbolName);
	}

	getCurrentState(): boolean {
		return this.currentState.length === 0 || this.currentState.every(c => c === true);
	}

	peekCurrentState(): boolean {
		return this.currentState.length === 0 || this.currentState[this.currentState.length - 1];
	}
}

macroProgram returns[extraTokens?:Token[][]]
	: macroStatement*
	EOF
	;
macroStatement: MACRO_CHAR macro;

callMacroArguments
	:
	OPEN_PARENS (macroArgument (',' macroArgument)*)? CLOSE_PARENS
	;

macroArgument
	:
	macroLiteral
	| macroArgument MACRO_INCR
	| macroArgument MACRO_DECR
	| MACRO_INCR macroArgument
	| MACRO_DECR macroArgument
	| macroArgument MACRO_PLUS macroArgument
	| MACRO_MINUS macroArgument
	| macroArgument MACRO_MINUS macroArgument
	| MACRO_BANG macroArgument
	| macroArgument MACRO_MODULUS macroArgument
	| macroArgument MACRO_DOLLAR macroArgument
	| macroArgument MACRO_AT macroArgument
	;

macroLiteral
	: MACRO_BOOLEAN_LITERAL
	| MACRO_INTEGER_LITERAL
	| MACRO_DECIMAL_LITERAL
	| MACRO_STRING_LITERAL
	| MACRO_NAME_LITERAL
	| MACRO_NONE_LITERAL
	| MACRO_SYMBOL
	;

macro returns[isActive: boolean, evaluatedTokens?: Token[]]
	: MACRO_DEFINE MACRO_SYMBOL (args=callMacroArguments)? MACRO_TEXT?
	{
		$isActive = this.getCurrentState();
		if ($isActive) {
			const symbolToken = $MACRO_SYMBOL;
			const id = symbolToken && symbolToken.text;
			let text = $MACRO_TEXT.text;

		}
	} # macroDefine
	| MACRO_UNDEFINE MACRO_SYMBOL
	{
		$isActive = this.getCurrentState();
		if ($isActive) {
			const symbolToken = $MACRO_SYMBOL;
			const id = symbolToken && symbolToken.text;
		}
	} # macroUndefine
	| KW_IF OPEN_PARENS (MACRO_CHAR expr=macroExpression) CLOSE_PARENS
	{
	} # macroIf
	| MACRO_ELSE_IF OPEN_PARENS (MACRO_CHAR expr=macroExpression) CLOSE_PARENS
	{
	} # macroElseIf
	| KW_ELSE
	{
	} # macroElse
	| MACRO_END_IF
	{
	} #macroEndIf
	| MACRO_INCLUDE OPEN_PARENS path=MACRO_INCLUDE_PATH CLOSE_PARENS
	{
	} #macroInclude
	| OPEN_BRACE expr=macroExpression CLOSE_BRACE
	{
	} # macroCall
	| expr=macroExpression
	{
	} # macroCall
	;

macroExpression returns[value: boolean | string | IMacroSymbol]
	: MACRO_IS_DEFINED (OPEN_PARENS MACRO_SYMBOL? CLOSE_PARENS)
	{
		var id = $MACRO_SYMBOL.text;
	} # macroIsDefinedExpr
	| MACRO_NOT_DEFINED (OPEN_PARENS MACRO_SYMBOL? CLOSE_PARENS)
	{
		var id = $MACRO_SYMBOL.text;
	} # macroNotDefinedExpr
	| MACRO_LINE
	{
		$value = (this.currentToken.line - 1).toString();
	} # macroLineExpr
	| MACRO_FILE
	{
		$value = '"' + this.filePath + '"';
	} # macroFileExpr
	| MACRO_SYMBOL (args=callMacroArguments)?
	{
		var symbolToken = $MACRO_SYMBOL;
		var id = symbolToken && symbolToken.text;
	} # macroExpr
	;
