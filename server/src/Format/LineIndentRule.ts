import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';

export class LineIndentRule implements IFormatRule {


    prevLine = -1;

    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[] {
        const res: IFormatInfo[] = [];
        let indentLevel = ctx.indentLevel;


        if (currentToken.line != this.prevLine) {
            if (currentToken.type != UCParser.LINE_COMMENT  //ignore line comment
                && currentToken.type != UCParser.BLOCK_COMMENT //ignore block comment
            ) {
                //if next token is close brace, then the indent level shold minus one level
                if (ctx.tryGetNextToken(currentToken)?.type == UCParser.CLOSE_BRACE) {
                    indentLevel = indentLevel - 1 >= 0 ? indentLevel - 1 : 0;
                }

                let actualIndentCount = 0;
                if (currentToken.type == UCParser.WS) {
                    actualIndentCount = this.getIndentCount(ctx, currentToken.text ?? "")
                }
                const expectIndent = ctx.indextString.repeat(indentLevel);
                const expectIndentCount = this.getIndentCount(ctx, expectIndent)
                if (actualIndentCount != expectIndentCount) {
                    res.push({
                        line: currentToken.line - 1,
                        position: 0,
                        length: currentToken.text?.length ?? 0,
                        fixedText: expectIndent
                    })
                }
            }
        }


        this.prevLine = currentToken.line;


        return res;
    }


    getIndentCount(ctx: FormatContext, indent: string) {
        let count = 0;
        if (indent.length === 0) {
            return count;
        }
        for (let index = 0; index < indent.length; index++) {
            const character = indent[index];
            if (character === '\t') {
                count += ctx.formatOption.tabSize;
            }
            else if (character === ' ') {
                count += 1;
            }
            else {
                break;
            }
        }
        return count;
    }
}