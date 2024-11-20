import path from 'path';
import { IMacroSymbol, MacroArgumentContext, MacroCallContext, MacroConditionExprContext, MacroDefineContext, MacroElseContext, MacroElseIfContext, MacroEndIfContext, MacroExprContext, MacroExpressionContext, MacroFileExprContext, MacroIfContext, MacroIncludeContext, MacroIsDefinedExprContext, MacroLineExprContext, MacroLiteralContext, MacroNotDefinedExprContext, MacroUndefineContext, UCPreprocessorParser } from 'UC/antlr/generated/UCPreprocessorParser';
import { UCDocument } from 'UC/document';
import { applyMacroSymbols, config } from 'UC/indexer';
import { EvaluatedTokens, UCTokenStream } from './TokenStream';
import { ANTLRErrorListener, CommonToken, CommonTokenStream, Token, WritableToken } from 'antlr4ts';
import { UCLexer } from 'UC/antlr/generated/UCLexer';
import { UCInputStream } from './InputStream';
import { URI } from 'vscode-uri';
import { existsSync } from 'fs';
import { readTextByPath } from 'workspace';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';

const DEFAULT_INPUT = UCInputStream.fromString('');

export function FillEvaluatedTokens(document: UCDocument, macroParser: UCPreprocessorParser, evaluatedTokens: EvaluatedTokens, errListener?: ANTLRErrorListener<number>) {

    const macroTree = macroParser.macroProgram();

    if (!macroTree) {
        return;
    }


    // Cannot use document.Name, because we need to preserve lowercases and uppercases
    const classNameMacro = { text: path.basename(document.fileName, path.extname(document.fileName)) };
    macroParser.currentSymbols.set("classname", classNameMacro);

    const packageNameMacro = { text: document.classPackage.getName().text };
    macroParser.currentSymbols.set("packagename", packageNameMacro);


    const smNodes = macroTree.macroStatement();
    if (smNodes) {
        const rawLexer = new UCLexer(DEFAULT_INPUT);
        if (errListener) {
            rawLexer.removeErrorListeners(); rawLexer.addErrorListener(errListener);
        }


        for (const smNode of smNodes) {
            const macroCtx = smNode.macro();
            if (macroCtx instanceof MacroDefineContext) {
                if (macroParser.getCurrentState()) {
                    const symbolToken = macroCtx._MACRO_SYMBOL;
                    const id = symbolToken?.text;
                    if (id) {
                        const text = macroCtx._MACRO_TEXT?.text ?? "...";
                        const args = macroCtx._args?.macroArgument() ?? [];
                        macroParser.currentSymbols.set(id.toLowerCase(), { text: text, params: args.map(x => x.text) });
                    }
                }
            }
            if (macroCtx instanceof MacroUndefineContext) {
                if (macroParser.getCurrentState()) {
                    const symbolToken = macroCtx._MACRO_SYMBOL;
                    const id = symbolToken?.text;
                    if (id) {
                        macroParser.currentSymbols.delete(id.toLowerCase());
                    }
                }
            }
            if (macroCtx instanceof MacroIfContext) {
                const isActive = !!evalMacroExpr(macroParser, macroCtx._expr) && macroParser.getCurrentState();
                macroParser.currentState.push(isActive);

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, { activeControl: isActive });
            }
            if (macroCtx instanceof MacroElseIfContext) {
                let isActive = true;
                if (macroParser.peekCurrentState()) {
                    macroParser.currentState.pop();
                    macroParser.currentState.push(false);
                    isActive = false;
                } else {
                    const ctxActive = !!evalMacroExpr(macroParser, macroCtx._expr);
                    macroParser.currentState.pop();
                    macroParser.currentState.push(ctxActive);
                    isActive = ctxActive && macroParser.getCurrentState();
                }

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, { activeControl: isActive });
            }
            if (macroCtx instanceof MacroElseContext) {
                let isActive = true;
                if (macroParser.peekCurrentState()) {
                    macroParser.currentState.pop();
                    macroParser.currentState.push(false);
                    isActive = false;
                } else {
                    const ctxActive = true;
                    macroParser.currentState.pop();
                    macroParser.currentState.push(ctxActive);
                    isActive = ctxActive && macroParser.getCurrentState();
                }

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, { activeControl: isActive });
            }
            if (macroCtx instanceof MacroEndIfContext) {
                macroParser.currentState.pop();
                const isActive = macroParser.getCurrentState();

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, { activeControl: isActive });
            }
            if (macroCtx instanceof MacroIncludeContext) {
                if (macroParser.getCurrentState() && macroCtx._path && macroCtx._path.text) {
                    let filePath = macroCtx._path.text;

                    const docFilePath = URI.parse(document.uri).fsPath;

                    let docFileDir = path.dirname(docFilePath);
                    if (filePath.includes("\\")) {
                        const rootKey = `development${path.sep}src`;
                        const srcIndex = docFileDir.toLowerCase().indexOf(rootKey.toLowerCase())
                        if (srcIndex > 0) {
                            docFileDir = docFileDir.substring(0, srcIndex + rootKey.length)
                            filePath = filePath.replaceAll("\\", path.sep);
                        }
                    }
                    const inculdeFilePath = path.join(docFileDir, filePath)
                    if (existsSync(inculdeFilePath)) {
                        const codeStr = readTextByPath(inculdeFilePath);
                        const rawText = codeStr.replace('\\', '');
                        const inputStream = UCInputStream.fromString(rawText);

                        rawLexer.inputStream = inputStream;
                        rawLexer.reset();
                        const tokenStream = new UCTokenStream(rawLexer);
                        // deal with macro in included file
                        const macroStream = new CommonTokenStream(rawLexer, UCLexer.MACRO);
                        macroStream.fill();

                        if (macroStream.getNumberOfOnChannelTokens() > 1) {
                            const includeMacroParser = new UCPreprocessorParser(macroStream);
                            includeMacroParser.filePath = document.uri;

                            rawLexer.reset();
                            includeMacroParser.currentSymbols = macroParser.currentSymbols;
                            includeMacroParser.currentState = macroParser.currentState;
                            FillEvaluatedTokens(document, includeMacroParser, tokenStream.evaluatedTokens, errListener);
                        }
                        rawLexer.reset();
                        tokenStream.fill();
                        const tokens = tokenStream.getTokens();
                        if (tokens[tokens.length - 1].type === Token.EOF) {
                            tokens.pop();
                        }
                        tokens.forEach(t => {
                            if (t instanceof CommonToken) {
                                t.line = macroCtx.start.line;
                                Object.defineProperty(t, "isGeneratedToken", {
                                    value: true,
                                    writable: true,
                                });
                            }
                        })

                        const macroChar = smNode.MACRO_CHAR();
                        evaluatedTokens.set(macroChar.symbol.startIndex, tokens as WritableToken[]);
                    }
                }
            }
            if (macroCtx instanceof MacroCallContext) {
                if (macroParser.getCurrentState()) {
                    const macroExpression = macroCtx.macroExpression();

                    let rawText = evalMacroExpr(macroParser,macroExpression).toString();

                    // const macroSymbol = (macroExpression as MacroExprContext)._MACRO_SYMBOL;
                    // const id = macroSymbol?.text ?? "";
                    // const value = macroParser.getSymbolValue(id.toLowerCase());
                    // if (!value) {
                    //     continue;
                    // }
                    // if ( typeof value !== "object") {
                    //     continue;
                    // }
                    // // const value = macroCtx._expr.value.toString();
                    // if (value.text === '...') {
                    //     // stumbled on an empty definition.
                    //     continue;
                    // }
                    // let rawText = value.text;
                    // if (value.params) {
                    //     //replace args
                    //     const inputArgs = (macroCtx._expr as MacroExprContext)._args;
                    //     if (inputArgs) {
                    //         const inputArgStrs = inputArgs.macroArgument().map(x=>x.text);

                    //         for (let index = 0; index < inputArgStrs.length; index++) {
                    //             const inputParam = inputArgStrs[index];
                    //             const formalParam = value.params[index] ?? "";
                    //             rawText = rawText.replaceAll(`\`${formalParam}`,inputParam);
                    //             rawText = rawText.replaceAll(`\`{${formalParam}}`,inputParam);
                    //         }

                    //     }
                    // }

                    rawText = rawText.replace('\\', '');
                    const inputStream = UCInputStream.fromString(rawText);
                    rawLexer.inputStream = inputStream;
                    const tokens = rawLexer.getAllTokens();
                    tokens.forEach(t => {
                        if (t instanceof CommonToken) {
                            t.line = macroCtx.start.line;
                            Object.defineProperty(t, "isGeneratedToken", {
                                value: true,
                                writable: true,
                            });
                        }
                    })

                    const macroChar = smNode.MACRO_CHAR();
                    evaluatedTokens.set(macroChar.symbol.startIndex, tokens as WritableToken[]);
                }
            }
        }
    }





    if (document.fileName.toLowerCase() === 'globals.uci') {
        UCPreprocessorParser.globalSymbols = macroParser.currentSymbols;
        applyMacroSymbols(config.macroSymbols);
    }

}

function evalMacroExpr(macroParser: UCPreprocessorParser, expr: MacroExpressionContext): boolean | string {
    if (expr instanceof MacroConditionExprContext) {
        const leftVal = evalMacroExpr(macroParser, expr._left);
        const rightVal = evalMacroExpr(macroParser, expr._right);
        const operator = expr._op;
        if (operator.type === UCPreprocessorParser.MACRO_OR) {
            return Boolean(leftVal) || Boolean(rightVal);
        }
        if (operator.type === UCPreprocessorParser.MACRO_AND) {
            return Boolean(leftVal) && Boolean(rightVal);
        }
    }
    if (expr instanceof MacroIsDefinedExprContext) {
        const macroSymbol = expr._MACRO_SYMBOL;
        const id = macroSymbol?.text;
        return id ? Boolean(macroParser.getSymbolValue(id.toLowerCase())) : false;
    }
    if (expr instanceof MacroNotDefinedExprContext) {
        const macroSymbol = expr._MACRO_SYMBOL;
        const id = macroSymbol?.text;
        return id ? !Boolean(macroParser.getSymbolValue(id.toLowerCase())) : true;
    }
    if (expr instanceof MacroLineExprContext) {
        return expr.value.toString();
    }
    if (expr instanceof MacroFileExprContext) {
        return expr.value.toString();
    }
    if (expr instanceof MacroExprContext) {
        const macroSymbol = expr._MACRO_SYMBOL;
        const id = macroSymbol?.text ?? "";
        const value = macroParser.getSymbolValue(id.toLowerCase());
        if (!value) {
            return "";
        }
        if (typeof value !== "object") {
            return "";
        }
        if (value.text === '...') {
            // empty definition.
            return "";
        }
        let rawText = value.text;
        if (value.params) {
            //replace args
            const inputArgs = expr._args;
            if (inputArgs) {
                const inputArgStrs = inputArgs.macroArgument().map(x => resolveMacroArgument(macroParser,x));

                for (let index = 0; index < inputArgStrs.length; index++) {
                    const inputParam = inputArgStrs[index];
                    const formalParam = value.params[index] ?? "";
                    rawText = rawText.replaceAll(`\`${formalParam}`, inputParam);
                    rawText = rawText.replaceAll(`\`{${formalParam}}`, inputParam);
                }
            }
        }

        return rawText;
    }
    return "";
}



function resolveMacroArgument(macroParser: UCPreprocessorParser, macroArgCtx: MacroArgumentContext): string {
    const resStrArr: string[] = [];
    if (macroArgCtx.childCount > 0 && macroArgCtx.children) {
        //find all chilren excpt 'TerminalNode'
        for (let index = 0; index < macroArgCtx.children.length; index++) {
            const child = macroArgCtx.children[index];
            if (child instanceof TerminalNode) {
                // Hack jump other characters
                if (child.text === "`"
                    || child.text === "{"
                    || child.text === "}"
                    || child.text === "("
                    || child.text === ")"
                    || child.text === ","
                ) {
                    continue;
                }else{
                    resStrArr.push(child.text);
                }
            }
            if (child instanceof MacroExpressionContext) {
                const evalRes = evalMacroExpr(macroParser,child);
                resStrArr.push(evalRes.toString());
            }
            if (child instanceof MacroArgumentContext) {
                const resolveRes = resolveMacroArgument(macroParser,child);
                resStrArr.push(resolveRes.toString());
            }
            if (child instanceof MacroLiteralContext) {
                resStrArr.push(child.text);
            }
        }
    }
    return resStrArr.join("");
}