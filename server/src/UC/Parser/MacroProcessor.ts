import path from 'path';
import { MacroCallContext, MacroDefineContext, MacroElseContext, MacroElseIfContext, MacroEndIfContext, MacroExprContext, MacroIfContext, MacroIncludeContext, MacroIsDefinedExprContext, MacroNotDefinedExprContext, MacroUndefineContext, UCPreprocessorParser } from 'UC/antlr/generated/UCPreprocessorParser';
import { UCDocument } from 'UC/document';
import { applyMacroSymbols, config } from 'UC/indexer';
import { EvaluatedTokens, UCTokenStream } from './TokenStream';
import { ANTLRErrorListener, CommonToken, CommonTokenStream, Token, WritableToken } from 'antlr4ts';
import { UCLexer } from 'UC/antlr/generated/UCLexer';
import { UCInputStream } from './InputStream';
import { URI } from 'vscode-uri';
import { existsSync } from 'fs';
import { readTextByPath } from 'workspace';

const DEFAULT_INPUT = UCInputStream.fromString('');

export function FillEvaluatedTokens(document: UCDocument, macroParser: UCPreprocessorParser, evaluatedTokens:EvaluatedTokens,errListener?: ANTLRErrorListener<number>) {

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
                        macroParser.currentSymbols.set(id.toLowerCase(),{text:text,params:args.map(x=>x.text)});
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
                const isActive = !!macroCtx._expr.value && macroParser.getCurrentState();
                macroParser.currentState.push(isActive);

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, {activeControl:isActive});
            }
            if (macroCtx instanceof MacroElseIfContext) {
                let isActive = true;
                if (macroParser.peekCurrentState()) {
                    macroParser.currentState.pop();
                    macroParser.currentState.push(false);
                    isActive = false;
                }else{
                    const ctxActive = !!macroCtx._expr.value;
                    macroParser.currentState.pop();
                    macroParser.currentState.push(ctxActive);
                    isActive = ctxActive && macroParser.getCurrentState();
                }

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, {activeControl:isActive});
            }
            if (macroCtx instanceof MacroElseContext) {
                let isActive = true;
                if (macroParser.peekCurrentState()) {
                    macroParser.currentState.pop();
                    macroParser.currentState.push(false);
                    isActive = false;
                }else{
                    const ctxActive = true;
                    macroParser.currentState.pop();
                    macroParser.currentState.push(ctxActive);
                    isActive = ctxActive && macroParser.getCurrentState();
                }

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, {activeControl:isActive});
            }
            if (macroCtx instanceof MacroEndIfContext) {
                macroParser.currentState.pop();
                const isActive = macroParser.getCurrentState();

                const macroChar = smNode.MACRO_CHAR();
                evaluatedTokens.set(macroChar.symbol.startIndex, {activeControl:isActive});
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
                            docFileDir = docFileDir.substring(0,srcIndex+rootKey.length)
                            filePath = filePath.replaceAll("\\",path.sep);
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
                            FillEvaluatedTokens(document,includeMacroParser,tokenStream.evaluatedTokens,errListener);
                        }
                        rawLexer.reset();
                        tokenStream.fill();
                        const tokens = tokenStream.getTokens();
                        if (tokens[tokens.length-1].type === Token.EOF) {
                            tokens.pop();
                        }
                        tokens.forEach(t=>{
                            if (t instanceof CommonToken) {
                                t.line = macroCtx.start.line;
                                Object.defineProperty(t,"isGeneratedToken",{
                                    value:true,
                                    writable:true,
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
                    const macroSymbol = (macroExpression as MacroExprContext)._MACRO_SYMBOL;
                    const id = macroSymbol?.text ?? "";
                    const value = macroParser.getSymbolValue(id.toLowerCase());
                    if (!value) {
                        continue;
                    }
                    if ( typeof value !== "object") {
                        continue;
                    }
                    // const value = macroCtx._expr.value.toString();
                    if (value.text === '...') {
                        // stumbled on an empty definition.
                        continue;
                    }
                    if (value.params) {
                        //replace args
                        const inputArgs = (macroCtx._expr as MacroExprContext)._args;
                        if (inputArgs) {
                            const inputArgStrs = inputArgs.macroArgument().map(x=>x.text);

                            for (let index = 0; index < inputArgStrs.length; index++) {
                                const inputParam = inputArgStrs[index];
                                const formalParam = value.params[index] ?? "";
                                value.text = value.text.replaceAll(`\`${formalParam}`,inputParam);
                                value.text = value.text.replaceAll(`\`{${formalParam}}`,inputParam);
                            }

                        }
                    }
                    const rawText = value.text.replace('\\', '');
                    const inputStream = UCInputStream.fromString(rawText);
                    rawLexer.inputStream = inputStream;
                    const tokens = rawLexer.getAllTokens();
                    tokens.forEach(t=>{
                        if (t instanceof CommonToken) {
                            t.line = macroCtx.start.line;
                            Object.defineProperty(t,"isGeneratedToken",{
                                value:true,
                                writable:true,
                            });
                        }
                    })

                    const macroChar = smNode.MACRO_CHAR();
                    evaluatedTokens.set(macroChar.symbol.startIndex, tokens as WritableToken[]);
                }
            }

            // -----------------
            // macro expr
            // -----------------
            if (macroCtx instanceof MacroIsDefinedExprContext) {
                const macroSymbol = macroCtx._MACRO_SYMBOL;
                const id = macroSymbol?.text;
                macroCtx.value = id ? Boolean(macroParser.getSymbolValue(id.toLowerCase())) : false;
            }
            if (macroCtx instanceof MacroNotDefinedExprContext) {
                const macroSymbol = macroCtx._MACRO_SYMBOL;
                const id = macroSymbol?.text;
                macroCtx.value = id ? !Boolean(macroParser.getSymbolValue(id.toLowerCase())) : true;
            }
        }
    }





    if (document.fileName.toLowerCase() === 'globals.uci') {
        UCPreprocessorParser.globalSymbols = macroParser.currentSymbols;
        applyMacroSymbols(config.macroSymbols);
    }

}