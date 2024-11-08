import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';
import { isOperatorToken } from './FormatHelper';


export class OperatorSpaceRule implements IFormatRule {


    prevLine = -1;

    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[] {
        const res: IFormatInfo[] = [];
        let indentLevel = ctx.indentLevel;

        if (isOperatorToken(currentToken)) {
            //left hand token
            const leftHandToken = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), currentToken);
            if (leftHandToken.token && leftHandToken.token.type != UCParser.OPEN_PARENS) {
                const expectedLength = this.getExpectedLength(ctx, currentToken, false, false);
                const actualLength = this.getWSLength(ctx.formatOption.tabSize, leftHandToken.wsToken);
                if (expectedLength != actualLength) {
                    const fixedText = " ".repeat(expectedLength);
                    res.push({
                        line: currentToken.line - 1,
                        position: leftHandToken.wsToken?.charPositionInLine ?? currentToken.charPositionInLine,
                        length: leftHandToken.wsToken ?
                            (leftHandToken.wsToken.stopIndex - leftHandToken.wsToken.startIndex + 1)
                            :
                            0,
                        fixedText: fixedText
                    })
                }
            }

            //right hand token
            const rightHandToken = this.findSameLineToken(ctx.tryGetNextToken.bind(ctx), currentToken);
            if (rightHandToken.token) {
                const isPrefixOperator = this.isPrefixOperator(leftHandToken.token, currentToken, rightHandToken.token);
                const expectedLength = this.getExpectedLength(ctx, currentToken, isPrefixOperator, true);
                const actualLength = this.getWSLength(ctx.formatOption.tabSize, rightHandToken.wsToken);
                if (expectedLength != actualLength) {
                    const fixedText = " ".repeat(expectedLength);
                    res.push({
                        line: currentToken.line - 1,
                        position: rightHandToken.wsToken?.charPositionInLine ??
                            currentToken.charPositionInLine + (currentToken.stopIndex - currentToken.startIndex + 1),
                        length: rightHandToken.wsToken ?
                            (rightHandToken.wsToken.stopIndex - rightHandToken.wsToken.startIndex + 1)
                            :
                            0,
                        fixedText: fixedText
                    })
                }
            }



        }

        this.prevLine = currentToken.line;
        return res;
    }


    findSameLineToken(findFunc: (token: Token) => Token | undefined, currentToken: Token): { token: Token | undefined, wsToken: Token | undefined } {
        const prevOrNextToken = findFunc(currentToken);
        if (!prevOrNextToken) {
            return { token: undefined, wsToken: undefined };
        }
        if (prevOrNextToken.line != currentToken.line) {
            return { token: undefined, wsToken: undefined };
        }
        if (prevOrNextToken.type == UCParser.WS) {
            const innerRes = this.findSameLineToken(findFunc, prevOrNextToken);
            return { token: innerRes.token, wsToken: prevOrNextToken };
        }
        return { token: prevOrNextToken, wsToken: undefined };
    }

    getWSLength(tabSize: number, wsToken: Token | undefined): number {
        let count = 0;
        if (!wsToken) {
            return count;
        }
        const text = wsToken.text ?? ""
        for (let index = 0; index < text.length; index++) {
            const character = text[index];
            if (character === '\t') {
                count += tabSize;
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

    getExpectedLength(ctx: FormatContext, currentToken: Token, isPrefixOperator: boolean, isRight: boolean): 0 | 1 {
        if (ctx.defaultPropertiesScope.isInScope) {
            return 0;
        }
        if (currentToken.type == UCParser.DOLLAR    //$ string concat
            || currentToken.type == UCParser.AT     //@ string concat
            || currentToken.type == UCParser.INCR   //++ increment
            || currentToken.type == UCParser.DECR   //-- decrement
        ) {
            return 0;
        }
        if (isPrefixOperator) {
            return 0;
        }

        if (currentToken.type == UCParser.LT) {
            const prevTokenInfo = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), currentToken);
            const prevToken = prevTokenInfo.token;

            if (prevToken?.type == UCParser.KW_ARRAY            // array<       e.g. array<int>
                || prevToken?.type == UCParser.KW_CLASS         // map<         e.g. map<int>
                || prevToken?.type == UCParser.KW_DELEGATE      // delegete<    e.g. delegete<int>
            ) {
                return 0;
            }
        }

        if (currentToken.type == UCParser.GT && !isRight) {
            //find prev matched <
            let prevMatchedLT: Token | undefined = currentToken;
            let level = 1;
            while (true) {
                const prevTokenInfo = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), prevMatchedLT);
                prevMatchedLT = prevTokenInfo.token;
                if (!prevMatchedLT) {
                    break;
                }
                if (prevMatchedLT.type == UCParser.GT) {
                    level += 1;
                }
                if (prevMatchedLT.type == UCParser.LT) {
                    level -= 1;
                }
                if (level == 0) {
                    break;
                }
            }
            if (prevMatchedLT && prevMatchedLT.charPositionInLine != currentToken.charPositionInLine && prevMatchedLT.type == UCParser.LT) {
                const prevTokenInfo = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), prevMatchedLT);
                const prevToken = prevTokenInfo.token;

                if (prevToken?.type == UCParser.KW_ARRAY            // array<       e.g. array<int>
                    || prevToken?.type == UCParser.KW_CLASS         // map<         e.g. map<int>
                    || prevToken?.type == UCParser.KW_DELEGATE      // delegete<    e.g. delegete<int>
                ) {
                    return 0;
                }
            }
        }

        if (currentToken.type == UCParser.COLON && !isRight) {
            let hasInterr = false;
            let token: Token | undefined = currentToken;
            while (true) {
                token = ctx.tryGetPrevToken(token);
                if (!token) {
                    break;
                }
                if (token.type === UCParser.INTERR) {
                    hasInterr = true;
                    break;
                }
                if (token.line !== currentToken.line) {
                    break;
                }
            }
            return hasInterr ? 1 : 0;
        }

        return 1;
    }

    isPrefixOperator(prev: Token | undefined, currentToken: Token, next: Token) {
        if (currentToken.type != UCParser.BANG && currentToken.type != UCParser.MINUS) {
            return false;
        }
        if (!this.canOperatorBeAppliedTo(next, true)) {
            return false;
        }
        if (this.canOperatorBeAppliedTo(prev, false)) {
            return false;
        }
        return true;
    }

    canOperatorBeAppliedTo(token: Token | undefined, isRight: boolean) {
        if (!token) {
            return false;
        }
        switch (token.type) {
            case UCParser.ID:
            case UCParser.BOOLEAN_LITERAL:
            case UCParser.INTEGER_LITERAL:
            case UCParser.DECIMAL_LITERAL:
            case UCParser.STRING_LITERAL:
            case UCParser.NAME_LITERAL:
                return true;
            case UCParser.OPEN_PARENS:
                return isRight;     // "(-"❌    "-("✔️
            case UCParser.CLOSE_PARENS:
                return !isRight;    // "-)"❌    ")-"✔️
            default:
                return false;
        }
    }
}