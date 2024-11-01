import { ActiveTextDocuments } from 'activeTextDocuments';
import { TextDocumentIdentifier, FormattingOptions, TextEdit, Position, Range } from 'vscode-languageserver';
import { readTextByURI } from 'workspace';
import { UCInputStream } from './UC/Parser/InputStream';
import { UCLexer } from './UC/antlr/generated/UCLexer';
import { UCTokenStream } from './UC/Parser/TokenStream';
import { Token } from 'antlr4ts/Token';
import { UCParser } from 'UC/antlr/generated/UCParser';
import { BraceNewlineRule } from 'Format/BraceNewlineRule';
import { LineIndentRule } from 'Format/LineIndentRule';
import { OperatorSpaceRule } from 'Format/OperatorSpaceRule';
import { UCDocument } from 'UC/document';
import { CommonSpaceRule } from 'Format/CommonSpaceRule';

export interface IFormatInfo {
    line: number;
    position: number;
    length: number;
    fixedText: string;
}

export interface IFormatRule {
    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[];
}

export class FormatContext {
    public indentLevel: number = 0;

    public indextString = "\t";


    private tokens: Token[] = [];
    public isInDefaultPropertiesScope: boolean = false;
    readonly formatOption: FormattingOptions;
    readonly document: UCDocument;


    public tryGetPrevToken(currentToken: Token): Token | undefined {
        return this.tokens[currentToken.tokenIndex - 1];
    }

    public tryGetNextToken(currentToken: Token): Token | undefined {
        return this.tokens[currentToken.tokenIndex + 1];
    }

    constructor(document:UCDocument,tokens: Token[], options: FormattingOptions) {
        this.document = document;
        this.tokens = tokens;
        this.indentLevel = 0;
        this.isInDefaultPropertiesScope = false;
        this.formatOption = options;

        this.indextString = this.formatOption.insertSpaces ?
            " ".repeat(this.formatOption.tabSize)
            :
            "\t";
    }
}

export async function getDocumentFormat(document:UCDocument,textDocId: TextDocumentIdentifier, options: FormattingOptions) {
    const editArr: TextEdit[] = [];


    // line number start form 0
    // character number start from 0, insert will happened before the current character
    // e.g. insert "@" in line 2 and character postions 5

    // 01|first line;
    // 02|second line;
    // 03|this is a line of code;

    // will become
    // 01|first line;
    // 02|second line;
    // 03|this @is a line of code;

    let text = ""
    const textDocument = ActiveTextDocuments.get(textDocId.uri);
    if (textDocument) {
        text = textDocument.getText();
    } else {
        text = readTextByURI(textDocId.uri);
    }
    const inputStream = UCInputStream.fromString(text);
    const lexer = new UCLexer(inputStream);
    // const errorListener = new UCErrorListener();
    // lexer.removeErrorListeners(); lexer.addErrorListener(errorListener);
    const tokenStream = new UCTokenStream(lexer);
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    const ctx = new FormatContext(document,tokens, options);

    const formatRules = buildRules();

    const formatInfoArr: IFormatInfo[] = [];


    for (let index = 0; index < tokens.length; index++) {
        const currentToken = tokens[index];

        preProcessCtx(ctx, currentToken)
        const results = formatRules.map(rule => rule.Format(ctx, currentToken))
            .filter(r => r.length != 0).flat()
        formatInfoArr.push(...results);

        postProcessCtx(ctx, currentToken);
    }

    formatInfoArr.forEach(info => {
        if (info.fixedText == null || info.position == null || info.line == null || info.length == null) {
            return;
        }
        if (info.length === 0) {
            const position = Position.create(info.line, info.position);
            editArr.push(TextEdit.insert(position, info.fixedText));
        } else if (info.fixedText === '') {
            let start = Position.create(info.line, info.position);
            let end = Position.create(info.line, info.position + info.length);
            // const lineText = textDocument.lineAt(result.line).text;
            // if (end.character >= lineText.length) {
            //     end = new vscode.Position(result.line + 1, 0);
            //     // cannot touch whitespace befer the default prop it can interfere with indent change
            //     // if (isWhitepace(lineText.substring(0, result.position))){
            //     //     start = new vscode.Position(result.line, 0);
            //     // }
            // }
            editArr.push(TextEdit.del(Range.create(start, end)));
        } else {
            const start = Position.create(info.line, info.position);
            const end = Position.create(info.line, info.position + info.length);
            editArr.push(TextEdit.replace(Range.create(start, end), info.fixedText));
        }
    })
    return editArr;
}


function buildRules(): IFormatRule[] {
    return [
        new LineIndentRule(),
        new CommonSpaceRule(),
        new OperatorSpaceRule(),
        new BraceNewlineRule(),
    ]
}

function preProcessCtx(ctx: FormatContext, currentToken: Token,) {
    // switch (currentToken.type) {
    //     case UCParser.CLOSE_BRACE:
    //         ctx.indentLevel--;
    //         if (ctx.indentLevel === 0 && ctx.isInDefaultPropertiesScope) {
    //             ctx.isInDefaultPropertiesScope = false;
    //         }
    //         break;
    //     default:
    //         break;
    // }
}

function postProcessCtx(ctx: FormatContext, currentToken: Token,) {
    switch (currentToken.type) {
        case UCParser.KW_DEFAULTPROPERTIES:
            ctx.isInDefaultPropertiesScope = true;
            break;
        case UCParser.OPEN_BRACE:
            // ctx.indentLevel++;
            break;
        default:
            break;
    }
}
