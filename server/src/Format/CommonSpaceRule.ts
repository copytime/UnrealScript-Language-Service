import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';
import { isOperatorToken } from './FormatHelper';

export class CommonSpaceRule implements IFormatRule {

    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[] {
        const res: IFormatInfo[] = [];


        if (currentToken.type == UCParser.WS) {
            const prevToken = ctx.tryGetPrevToken(currentToken);
            const nextToken = ctx.tryGetNextToken(currentToken);
            if (prevToken
                && nextToken
                && prevToken.line == currentToken.line
                && nextToken.line == currentToken.line
                && !isOperatorToken(prevToken)
                && !isOperatorToken(nextToken)
            ) {
                let fixedText = " ";
                if (nextToken.type == UCParser.SEMICOLON) {
                    fixedText = "";
                }
                res.push({
                    line: currentToken.line - 1,
                    position: currentToken.charPositionInLine,
                    length: currentToken.stopIndex - currentToken.startIndex + 1,
                    fixedText: fixedText
                });
            }
        }


        return res;
    }
}